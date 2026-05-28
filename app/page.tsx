"use client";

import CICDashboard from "@/components/CICDashboard";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminDashboard from "@/components/AdminDashboard";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import TriageDashboard from "@/components/TriageDashboard";
import ClientDashboard from "@/components/ClientDashboard";
import AddClientForm from "@/components/AddClientForm";
import ConsentPage from "@/components/ConsentPage";
import StatementImport from "@/components/StatementImport";
import ReturnsImport from "@/components/ReturnsImport";
import ACHWorksImport from "@/components/ACHWorksImport";
import DailyOperations from "@/components/DailyOperations";
import ExcelImport from "@/components/ExcelImport";
import PortfolioAnalysis from "@/components/PortfolioAnalysis";
import SegmentationDashboard from "@/components/SegmentationDashboard";

const ADMIN_EMAIL = "fbusato@cfgms.com";

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let subtracted = 0;
  while (subtracted < days) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) subtracted++;
  }
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseXLSRows(text: string): { invoice: string; date: string; amount: number }[] {
  const results: { invoice: string; date: string; amount: number }[] = [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    const ns = "urn:schemas-microsoft-com:office:spreadsheet";
    let rows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "Row"));
    if (rows.length === 0) rows = Array.from(xmlDoc.getElementsByTagName("Row"));
    if (rows.length === 0) return results;

    const headerRow = rows[0];
    let headerCells = Array.from(headerRow.getElementsByTagNameNS(ns, "Data"));
    if (headerCells.length === 0) headerCells = Array.from(headerRow.getElementsByTagName("Data"));

    let typeCol = 1, dateCol = 2, invoiceCol = 3, amountCol = 6;
    headerCells.forEach((cell, idx) => {
      const val = (cell.textContent || "").trim().toLowerCase();
      if (val === "type") typeCol = idx;
      if (val.includes("date")) dateCol = idx;
      if (val.includes("inv") || val === "inv#") invoiceCol = idx;
      if (val === "amount") amountCol = idx;
    });

    for (let i = 1; i < rows.length; i++) {
      let cells = Array.from(rows[i].getElementsByTagNameNS(ns, "Data"));
      if (cells.length === 0) cells = Array.from(rows[i].getElementsByTagName("Data"));
      if (cells.length < 4) continue;

      const type = (cells[typeCol]?.textContent || "").trim();
      const dateRaw = (cells[dateCol]?.textContent || "").trim();
      const invoice = (cells[invoiceCol]?.textContent || "").trim();
      const amount = parseFloat((cells[amountCol]?.textContent || "").trim());

      if (!["payment", "credit memo"].includes(type.toLowerCase())) continue;
      if (!invoice || !amount || isNaN(amount)) continue;

      const date = dateRaw.includes("T") ? dateRaw.split("T")[0] : dateRaw;
      results.push({ invoice, date, amount });
    }
  } catch (err) {
    console.error("XLS parse error:", err);
  }
  return results;
}

function parseCSVRows(text: string): { invoice: string; date: string; amount: number }[] {
  const results: { invoice: string; date: string; amount: number }[] = [];
  const rows = text.split("\n").slice(1);
  for (const row of rows) {
    const cols = row.split(",");
    const invoice = cols[3]?.trim();
    const date = cols[2]?.trim();
    const amount = parseFloat(cols[6]?.trim() || "0");
    if (!invoice || !amount || isNaN(amount)) continue;
    results.push({ invoice, date, amount });
  }
  return results;
}

type AdminSubView = "dashboard" | "daily" | "portfolio" | "analytics" | "triage" | "segmentation" | "add" | "excel-import";
type ImportType = "returns" | "statement" | "achworks";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [view, setView] = useState<"admin" | "client" | "cic">("admin");
  const [adminSubView, setAdminSubView] = useState<AdminSubView>("dashboard");
  const [clientRecord, setClientRecord] = useState<any>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [checkingConsent, setCheckingConsent] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSelected, setImportSelected] = useState<ImportType | null>(null);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState("");

  const [newClient, setNewClient] = useState<{
    businessName: string; invoice: string; achWorksName: string; ownerName: string; ownerPhone: string; clientEmail: string;
    fundedDate: string; funded: string; payback: string; payment: string; totalTerm: string;
    paymentFrequency: "daily" | "weekly"; paymentDay: string;
    state: string; sicCode: string; businessType: string; ficoScore: string;
    avgMonthlyRevenue: string; timeInBusinessMonths: string; position: string;
  }>({
    businessName: "", invoice: "", achWorksName: "", ownerName: "", ownerPhone: "", clientEmail: "",
    fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "",
    paymentFrequency: "daily" as const, paymentDay: "",
    state: "", sicCode: "", businessType: "", ficoScore: "",
    avgMonthlyRevenue: "", timeInBusinessMonths: "", position: "",
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { checkUser(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) {
      if (isAdmin) fetchClients();
      else checkConsent(user.email);
    }
  }, [user]);

  async function checkUser() {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    setLoading(false);
  }

  async function checkConsent(userEmail: string) {
    setCheckingConsent(true);
    const { data } = await supabase.from("consent_log").select("id").eq("email", userEmail).limit(1);
    if (data && data.length > 0) {
      setHasConsented(true);
      await fetchClientByEmail(userEmail);
    } else {
      setHasConsented(false);
      setCheckingConsent(false);
      setLoading(false);
    }
  }

  async function handleConsent() {
    if (!user) return;
    await supabase.from("consent_log").insert({ email: user.email, portal_version: "1.0" });
    setHasConsented(true);
    await fetchClientByEmail(user.email);
  }

  async function handleDecline() {
    await supabase.auth.signOut();
    setUser(null);
    setHasConsented(false);
  }

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { alert(error.message); return; }
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
  }

  async function handleForgotPassword() {
    if (!forgotEmail) { setForgotMessage("Please enter your email address."); setForgotStatus("error"); return; }
    setForgotStatus("loading");
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: "https://mcaportal-fb.vercel.app/reset",
    });
    if (error) { setForgotMessage(error.message); setForgotStatus("error"); return; }
    setForgotStatus("sent");
    setForgotMessage("Check your email for a password reset link. It expires in 1 hour.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null); setClients([]); setPayments([]);
    setSelectedClient(null); setClientRecord(null); setHasConsented(false);
  }

  async function fetchClientByEmail(userEmail: string) {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").eq("client_email", userEmail).single();
    if (error || !data) { setClientRecord(null); setLoading(false); setCheckingConsent(false); return; }
    setClientRecord(data);
    await fetchPayments(data.invoice);
    setView("client");
    setLoading(false);
    setCheckingConsent(false);
  }

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("funded_date", { ascending: true });
    if (error) { alert(error.message); setLoading(false); return; }
    setClients(data || []);
    setSelectedClient(data?.[0] || null);
    if (data?.[0]) await fetchPayments(data[0].invoice);
    setView("admin");
    setLoading(false);
  }

  async function fetchPayments(invoice: string) {
    const { data, error } = await supabase
      .from("payments").select("*").eq("invoice", invoice).order("payment_date", { ascending: true });
    if (error) { alert(error.message); return; }
    setPayments(data || []);
  }

  async function openClient(client: any) {
    setSelectedClient(client);
    await fetchPayments(client.invoice);
    setView("client");
  }

  async function addClient() {
    const client = {
      business_name: newClient.businessName,
      invoice: newClient.invoice,
      ach_works_name: newClient.achWorksName || null,
      owner_name: newClient.ownerName,
      client_email: newClient.clientEmail,
      funded_date: newClient.fundedDate,
      funded: Number(newClient.funded),
      payback: Number(newClient.payback),
      paid: 0,
      balance: Number(newClient.payback),
      payment: Number(newClient.payment),
      total_term: newClient.totalTerm
        ? Number(newClient.totalTerm)
        : (newClient.payback && newClient.payment
          ? Math.ceil(Number(newClient.payback) / Number(newClient.payment)) * (newClient.paymentFrequency === "weekly" ? 5 : 1)
          : 0),
      payment_frequency: newClient.paymentFrequency,
      payment_day: newClient.paymentDay || null,
      status: "Good Standing",
    };
    const { error } = await supabase.from("clients").insert([client]);
    if (error) { alert(error.message); return; }
    setNewClient({
      businessName: "", invoice: "", achWorksName: "", ownerName: "", ownerPhone: "", clientEmail: "",
      fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "",
      paymentFrequency: "daily" as const, paymentDay: "",
      state: "", sicCode: "", businessType: "", ficoScore: "",
      avgMonthlyRevenue: "", timeInBusinessMonths: "", position: "",
    });
    await fetchClients();
    setAdminSubView("dashboard");
  }

  async function deleteClient(client: any) {
    if (!confirm(`Delete ${client.business_name} and all payment history? This cannot be undone.`)) return;
    await supabase.from("payments").delete().eq("invoice", client.invoice);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) { alert(error.message); return; }
    await fetchClients();
  }

  async function updateClient(client: any) {
    const { error } = await supabase.from("clients").update({
      business_name: client.business_name,
      invoice: client.invoice,
      owner_name: client.owner_name,
      client_email: client.client_email,
      funded_date: client.funded_date,
      funded: Number(client.funded),
      payback: Number(client.payback),
      balance: Number(client.balance),
      payment: Number(client.payment),
      total_term: Number(client.total_term),
      payment_frequency: client.payment_frequency,
      payment_day: client.payment_day || null,
      status: client.status,
    }).eq("id", client.id);
    if (error) { alert(error.message); return; }
    await fetchClients();
  }

  async function evaluateStanding(client: any, reportHadPayment: boolean, hadReturn: boolean): Promise<string> {
    if (hadReturn) return "Needs Attention";
    if (!reportHadPayment) {
      const { data: recentPayments } = await supabase
        .from("payments").select("settlement_date, description")
        .eq("invoice", client.invoice)
        .order("settlement_date", { ascending: false }).limit(10);
      if (recentPayments) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const lastSettled = recentPayments.find((p: any) => {
          const desc = (p.description || "").toLowerCase();
          return !desc.includes("return") && !desc.includes("missed") && !desc.includes("initial") && p.settlement_date;
        });
        if (!lastSettled) return "Needs Attention";
        const settlDate = new Date(lastSettled.settlement_date);
        settlDate.setHours(0, 0, 0, 0);
        let bizDays = 0;
        const cursor = new Date(settlDate);
        while (cursor < today) {
          cursor.setDate(cursor.getDate() + 1);
          if (cursor.getDay() !== 0 && cursor.getDay() !== 6) bizDays++;
        }
        if (bizDays >= 5) return "Needs Attention";
      }
    }
    return "Good Standing";
  }

  async function handlePaymentUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const today = new Date();
    const todayStr = toDateString(today);

    const { data: clientsData } = await supabase.from("clients").select("*");
    if (!clientsData) return;

    const localClients = clientsData.map((c: any) => ({ ...c }));
    const reportInvoices: string[] = [];
    const returnedInvoices: string[] = [];

    const isXML = text.trim().startsWith("<?xml") || text.trim().startsWith("<Workbook") || text.trim().startsWith(" <Workbook");
    const parsedRows = isXML ? parseXLSRows(text) : parseCSVRows(text);

    if (parsedRows.length === 0) {
      alert("No valid payment rows found. Check the file format and try again.");
      return;
    }

    let matched = 0, skippedDuplicates = 0;

    for (const { invoice, date, amount } of parsedRows) {
      const client = localClients.find((c: any) =>
        c.invoice.trim().toLowerCase() === invoice.trim().toLowerCase()
      );
      if (!client) continue;

      reportInvoices.push(invoice);

      const settlementDate = new Date((date || todayStr) + "T00:00:00");
      const achDate = subtractBusinessDays(settlementDate, 4);
      const settlementStr = date || todayStr;
      const achDateStr = toDateString(achDate);
      const alreadySettled = settlementDate <= today;
      const newBalance = alreadySettled
        ? Math.max(Number(client.balance || 0) - amount, 0)
        : Number(client.balance || 0);

      const { error: insertError } = await supabase.from("payments").insert({
        invoice,
        payment_date: achDateStr,
        ach_date: achDateStr,
        settlement_date: settlementStr,
        description: "Posted",
        credit: 0, debit: amount, returns: 0,
        running_balance: alreadySettled ? newBalance : null,
      });

      if (insertError && insertError.code === "23505") { skippedDuplicates++; continue; }
      if (insertError) { console.error("Insert error:", insertError); continue; }

      matched++;
      if (alreadySettled) {
        await supabase.from("clients").update({ balance: newBalance }).eq("id", client.id);
        client.balance = newBalance;
      }
    }

    for (const client of localClients) {
      if (!reportInvoices.includes(client.invoice)) {
        const day = today.getDay();
        if (client.payment_frequency === "weekly" && day !== 5) continue;

        await supabase.from("payments").insert({
          invoice: client.invoice,
          payment_date: todayStr, ach_date: todayStr, settlement_date: todayStr,
          description: "Missed Payment",
          credit: 0, debit: 0, returns: Number(client.payment),
          running_balance: Number(client.balance || 0),
        });
        returnedInvoices.push(client.invoice);
      }
    }

    for (const client of localClients) {
      const hadPayment = reportInvoices.includes(client.invoice);
      const hadReturn = returnedInvoices.includes(client.invoice);
      const newStatus = await evaluateStanding(client, hadPayment, hadReturn);
      await supabase.from("clients").update({ status: newStatus }).eq("id", client.id);
    }

    let msg = `Upload complete.\n\n${matched} new payment${matched !== 1 ? "s" : ""} recorded.`;
    if (skippedDuplicates > 0) msg += `\n${skippedDuplicates} duplicate${skippedDuplicates > 1 ? "s" : ""} skipped.`;
    alert(msg);
    await fetchClients();
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading || checkingConsent) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--parchment)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 400, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 12 }}>
            FB Client Portal
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-5)", letterSpacing: "0.04em" }}>Loading your account…</div>
        </div>
      </div>
    );
  }

  // ── Login ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--parchment)", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 14, background: "var(--ink-1)", border: "1px solid rgba(196,154,90,0.25)", marginBottom: 16 }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "var(--gold-bright)", letterSpacing: "0.05em" }}>FB</span>
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "var(--ink-1)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              FB Client Portal
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>Sign in to your account</div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 32, boxShadow: "0 4px 24px rgba(30,16,4,0.08)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />

            {!showForgot ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email address</label>
                  <input
                    type="email" placeholder="you@example.com"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "11px 14px", fontSize: 14, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                    value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Password</label>
                  <input
                    type="password" placeholder="••••••••"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "11px 14px", fontSize: 14, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <button
                  onClick={handleLogin}
                  style={{ width: "100%", borderRadius: 10, background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "13px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
                  Sign in
                </button>
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotStatus("idle"); setForgotMessage(""); }}
                    style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    Forgot your password?
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Your email address</label>
                  <input
                    type="email" placeholder="you@example.com"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "11px 14px", fontSize: 14, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                    value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleForgotPassword()}
                  />
                </div>
                {forgotMessage && (
                  <div style={{ borderRadius: 10, padding: "11px 14px", fontSize: 13, background: forgotStatus === "sent" ? "var(--sage-surface)" : "var(--sienna-surface)", border: `1px solid ${forgotStatus === "sent" ? "var(--sage-border)" : "var(--sienna-border)"}`, color: forgotStatus === "sent" ? "var(--sage)" : "var(--sienna)" }}>
                    {forgotMessage}
                  </div>
                )}
                {forgotStatus !== "sent" && (
                  <button
                    onClick={handleForgotPassword} disabled={forgotStatus === "loading"}
                    style={{ width: "100%", borderRadius: 10, background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "13px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: forgotStatus === "loading" ? 0.6 : 1 }}>
                    {forgotStatus === "loading" ? "Sending…" : "Send reset link"}
                  </button>
                )}
                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={() => { setShowForgot(false); setForgotStatus("idle"); setForgotMessage(""); }}
                    style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    ← Back to sign in
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.6, padding: "0 8px" }}>
            This portal is operated independently by Fellipe Busato and is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity.
          </div>
        </div>
      </main>
    );
  }

  // ── Consent ──────────────────────────────────────────────────────────────
  if (!isAdmin && !hasConsented) {
    return <ConsentPage userEmail={user.email} onAgree={handleConsent} onDecline={handleDecline} />;
  }

  // ── Client view (non-admin) ───────────────────────────────────────────────
  if (!isAdmin) {
    if (!clientRecord) {
      return (
        <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--parchment)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "var(--ink-2)", marginBottom: 8 }}>No account found</div>
            <p style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 20 }}>No account found for {user.email}. Please contact Fellipe for access.</p>
            <button onClick={logout} style={{ borderRadius: 9, border: "1px solid var(--border-mid)", padding: "10px 20px", fontSize: 13, color: "var(--ink-3)", background: "transparent", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Sign out
            </button>
          </div>
        </main>
      );
    }
    return (
      <main style={{ minHeight: "100vh", background: "var(--parchment)" }}>
        <nav style={{ background: "var(--ink-1)", padding: "0 28px", display: "flex", alignItems: "center", height: 60, position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--gold-border)", background: "rgba(160,120,64,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontWeight: 600, color: "var(--gold-bright)" }}>FB</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>FB Client Portal</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{user.email}</span>
            <button onClick={logout} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(255,255,255,0.22)", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Logout
            </button>
          </div>
        </nav>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 28px" }}>
          <ClientDashboard
            selectedClient={clientRecord}
            payments={payments}
            onPaymentAdded={async () => { await fetchPayments(clientRecord.invoice); }}
          />
        </div>
      </main>
    );
  }

  // ── Admin view ───────────────────────────────────────────────────────────
  function navBtn(active: boolean, color: { bg: string; border: string; text: string }) {
    return {
      padding: "7px 16px",
      borderRadius: 7,
      border: `1px solid ${active ? color.border : "transparent"}`,
      background: active ? color.bg : "transparent",
      color: active ? color.text : "rgba(255,255,255,0.55)",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      fontFamily: "'DM Sans', sans-serif",
      transition: "all 0.15s",
    } as React.CSSProperties;
  }

  function subTabBtn(active: boolean) {
    return {
      padding: "0 16px",
      height: "100%",
      border: "none",
      borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
      background: "transparent",
      color: active ? "var(--ink-1)" : "var(--ink-4)",
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
      fontFamily: "'DM Sans', sans-serif",
      transition: "all 0.15s",
    } as React.CSSProperties;
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--parchment)" }}>

      {/* ── Primary Nav ── */}
      <nav style={{ background: "var(--ink-1)", padding: "0 28px", display: "flex", alignItems: "center", height: 62, position: "sticky", top: 0, zIndex: 20, gap: 4 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 20 }}>
          <button onClick={() => { setView("admin"); setAdminSubView("dashboard"); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--gold-border)", background: "rgba(160,120,64,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontWeight: 600, color: "var(--gold-bright)" }}>FB</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em" }}>FB Client Portal</span>
          </button>
          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Admin</span>
        </div>

        {/* Client Dashboard */}
        <button
          onClick={() => { setView("admin"); setAdminSubView("dashboard"); }}
          style={navBtn(view === "admin" || view === "client", { bg: "rgba(160,120,64,0.2)", border: "rgba(160,120,64,0.4)", text: "var(--gold-bright)" })}>
          Client Dashboard
        </button>

        {/* AI Agents */}
        <button
          onClick={() => setView("cic")}
          style={navBtn(view === "cic", { bg: "rgba(200,146,42,0.2)", border: "rgba(200,146,42,0.4)", text: "#C8922A" })}>
          AI Agents
        </button>

        {/* Import button */}
        <button
          onClick={() => { setImportModalOpen(true); setImportSelected(null); }}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 16px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginLeft: 6 }}>
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3 4L6.5 1 10 4M1.5 10.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Import
        </button>

        {/* Right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{user.email}</span>
          <button onClick={logout} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Logout
          </button>
        </div>
      </nav>

      {/* ── Import Modal ── */}
      {importModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,20,12,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 680, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(28,20,12,0.3)", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />

            <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: "var(--ink-1)" }}>
                  {importSelected === null ? "Import Data" : importSelected === "returns" ? "Returns" : importSelected === "statement" ? "CFG Statement" : "ACH Works"}
                </div>
                {importSelected === null && (
                  <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>Choose the type of data to import</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {importSelected !== null && (
                  <button
                    onClick={() => setImportSelected(null)}
                    style={{ fontSize: 12, color: "var(--ink-3)", background: "none", border: "1px solid var(--border-mid)", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    ← Back
                  </button>
                )}
                <button
                  onClick={() => { setImportModalOpen(false); setImportSelected(null); }}
                  style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: "var(--ink-4)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: importSelected === null ? "24px 28px" : "0" }}>
              {importSelected === null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {([
                    { key: "statement" as ImportType, label: "CFG Statement", desc: "Import the daily CFG settlement file — records debits, credits, and updates balances for all matched clients", icon: "📄" },
                    { key: "achworks" as ImportType, label: "ACH Works", desc: "Import ACH Works payment history — syncs payment records and identifies mismatches between ACH Works and CFG data", icon: "🏦" },
                    { key: "returns" as ImportType, label: "Returns", desc: "Record payment returns — marks missed or returned payments, updates client standing, and flags accounts for review", icon: "↩" },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setImportSelected(opt.key)}
                      style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-mid)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--parchment-2)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ink-1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        {opt.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-1)", marginBottom: 3 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{opt.desc}</div>
                      </div>
                      <span style={{ fontSize: 16, color: "var(--ink-4)" }}>→</span>
                    </button>
                  ))}
                </div>
              ) : importSelected === "returns" ? (
                <ReturnsImport clients={clients} onImportComplete={async () => { await fetchClients(); setImportModalOpen(false); setImportSelected(null); }} />
              ) : importSelected === "statement" ? (
                <StatementImport clients={clients} onImportComplete={async () => { await fetchClients(); setImportModalOpen(false); setImportSelected(null); }} />
              ) : (
                <ACHWorksImport clients={clients} onImportComplete={async () => { await fetchClients(); setImportModalOpen(false); setImportSelected(null); }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Admin sub-header (only when in admin view) ── */}
      {view === "admin" && (
        <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 32px", display: "flex", alignItems: "stretch", justifyContent: "space-between", height: 46, position: "sticky", top: 62, zIndex: 15, boxShadow: "0 1px 0 var(--border)" }}>
          {/* Sub-tabs */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
            {([
              { key: "daily", label: "Daily Operations" },
              { key: "segmentation", label: "Segmentation" },
              { key: "analytics", label: "Analytics" },
              { key: "triage", label: "Triage" },
              { key: "dashboard", label: "Overview" },
            ] as { key: AdminSubView; label: string }[]).map(({ key, label }) => (
              <button key={key} onClick={() => setAdminSubView(key)} style={subTabBtn(adminSubView === key)}>
                {label}
              </button>
            ))}
          </div>
          {/* Action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setAdminSubView("add")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "1px solid rgba(90,138,106,0.4)", background: adminSubView === "add" ? "rgba(90,138,106,0.15)" : "transparent", color: "#7ab89a", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              + Add Client
            </button>
            <button
              onClick={() => setAdminSubView("excel-import")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "1px solid rgba(46,125,50,0.4)", background: adminSubView === "excel-import" ? "rgba(46,125,50,0.15)" : "transparent", color: "#7ab89a", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              <svg width="10" height="10" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3 4L6.5 1 10 4M1.5 10.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Import Deals
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ maxWidth: view === "cic" ? "none" : 1200, margin: "0 auto" }}>

        {/* Back button when admin drills into a client */}
        {view === "client" && selectedClient && (
          <div style={{ padding: "20px 32px 0" }}>
            <button
              onClick={() => setView("admin")}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
              ← Dashboard
            </button>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 20 }}>
              Welcome, {selectedClient.owner_name}
            </div>
          </div>
        )}

        {/* Admin sub-views */}
        {view === "admin" && adminSubView === "dashboard" && (
          <AdminDashboard
            clients={clients}
            openClient={openClient}
            handlePaymentUpload={handlePaymentUpload}
            deleteClient={deleteClient}
            updateClient={updateClient}
          />
        )}

        {view === "admin" && adminSubView === "daily" && (
          <DailyOperations clients={clients} onImportComplete={async () => { await fetchClients(); setImportModalOpen(false); setImportSelected(null); }} />
        )}

        {view === "admin" && adminSubView === "portfolio" && (
          <PortfolioAnalysis clients={clients} openClient={openClient} />
        )}

        {view === "admin" && adminSubView === "analytics" && (
          <div style={{ padding: "32px" }}>
            <AnalyticsDashboard clients={clients} />
          </div>
        )}

        {view === "admin" && adminSubView === "triage" && (
          <div style={{ padding: "32px" }}>
            <TriageDashboard clients={clients} openClient={openClient} updateClient={updateClient} />
          </div>
        )}

        {view === "admin" && adminSubView === "segmentation" && (
          <div style={{ padding: "32px" }}>
            <SegmentationDashboard clients={clients} payments={payments} snapshots={[]} openClient={openClient} />
          </div>
        )}

        {view === "admin" && adminSubView === "add" && (
          <div style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <button onClick={() => setAdminSubView("dashboard")} style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em" }}>Add Client</div>
            </div>
            <AddClientForm newClient={newClient} setNewClient={setNewClient} addClient={addClient} />
          </div>
        )}

        {view === "admin" && adminSubView === "excel-import" && (
          <div style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <button onClick={() => setAdminSubView("dashboard")} style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em" }}>Import Deals</div>
            </div>
            <ExcelImport onComplete={async () => { await fetchClients(); setAdminSubView("dashboard"); }} />
          </div>
        )}

        {/* Admin → Client drill-in */}
        {view === "client" && selectedClient && (
          <div style={{ padding: "0 32px 40px" }}>
            <ClientDashboard
              selectedClient={selectedClient}
              payments={payments}
              isAdminView={true}
              onPaymentAdded={async () => {
                await fetchPayments(selectedClient.invoice);
                const { data } = await supabase.from("clients").select("*").eq("id", selectedClient.id).single();
                if (data) {
                  setSelectedClient(data);
                  setClients(prev => prev.map((c: any) => c.id === data.id ? data : c));
                }
              }}
            />
          </div>
        )}

        {view === "cic" && <CICDashboard />}
      </div>
    </main>
  );
}
