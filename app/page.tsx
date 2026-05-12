"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ADMIN_EMAIL } from "@/lib/config";
import AdminDashboard from "@/components/AdminDashboard";
import ClientDashboard from "@/components/ClientDashboard";
import AddClientForm from "@/components/AddClientForm";
import ConsentPage from "@/components/ConsentPage";
import StatementImport from "@/components/StatementImport";
import ReturnsImport from "@/components/ReturnsImport";
import ACHWorksImport from "@/components/ACHWorksImport";
import ConfirmModal from "@/components/ConfirmModal";
import { ToastProvider, toast } from "@/components/Toast";
import { T, type Lang } from "@/lib/i18n";
import TriageDashboard from "@/components/TriageDashboard";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import type { Client, Payment, NewClientForm } from "@/lib/types";

type ViewType =
  | "admin"
  | "client"
  | "add"
  | "triage"
  | "analytics"
  | "returns"
  | "statement"
  | "achworks";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" },
];

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

// Nav button style helper — defined outside component to avoid re-creation on render
function navBtn(active: boolean, color: { bg: string; border: string; text: string }): React.CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 7,
    border: `1px solid ${color.border}`,
    background: active ? color.bg : "rgba(255,255,255,0.04)",
    color: active ? color.text : "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  };
}

const EMPTY_CLIENT: NewClientForm = {
  businessName: "", invoice: "", achWorksName: "", ownerName: "", clientEmail: "",
  ownerPhone: "", fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "",
  paymentFrequency: "daily", paymentDay: "",
  state: "", sicCode: "", businessType: "", ficoScore: "",
  avgMonthlyRevenue: "", timeInBusinessMonths: "", position: "",
};

export default function Home() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [view, setView] = useState<ViewType>("admin");
  const [clientRecord, setClientRecord] = useState<Client | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [checkingConsent, setCheckingConsent] = useState(false);
  const [lang, setLang] = useState<Lang>("en");

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState("");

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const [newClient, setNewClient] = useState<NewClientForm>(EMPTY_CLIENT);

  const isAdmin = user?.email === ADMIN_EMAIL;
  const t = T[lang];

  useEffect(() => {
    const saved = localStorage.getItem("portal_lang") as Lang | null;
    if (saved && ["en", "es", "pt"].includes(saved)) setLang(saved);
  }, []);

  function changeLang(l: Lang) { setLang(l); localStorage.setItem("portal_lang", l); }

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("funded_date", { ascending: true });
    if (error) { toast.error("Failed to load clients", error.message); setLoading(false); return; }
    setClients(data || []);
    setSelectedClient(data?.[0] || null);
    if (data?.[0]) await fetchPayments(data[0].invoice);
    setView("admin");
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPayments = useCallback(async (invoice: string) => {
    const { data, error } = await supabase
      .from("payments").select("*").eq("invoice", invoice).order("payment_date", { ascending: true });
    if (error) { toast.error("Failed to load payments", error.message); return; }
    setPayments(data || []);
  }, []);

  const checkConsent = useCallback(async (userEmail: string) => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { checkUser(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    if (isAdmin) fetchClients();
    else checkConsent(user.email);
  }, [user, isAdmin, fetchClients, checkConsent]);

  async function checkUser() {
    const { data } = await supabase.auth.getUser();
    setUser(data.user as { email: string } | null);
    setLoading(false);
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
    if (error) { toast.error("Sign in failed", error.message); return; }
    const { data } = await supabase.auth.getUser();
    setUser(data.user as { email: string } | null);
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

  async function openClient(client: Client) {
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
      owner_phone: newClient.ownerPhone || null,
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
    if (error) { toast.error("Failed to create client", error.message); return; }
    toast.success("Client created", newClient.businessName + " has been added.");
    setNewClient(EMPTY_CLIENT);
    await fetchClients();
    setView("admin");
  }

  function confirmDeleteClient(client: Client) {
    setConfirmModal({
      open: true,
      title: "Delete client",
      message: `Delete ${client.business_name} and all payment history? This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, open: false }));
        await supabase.from("payments").delete().eq("invoice", client.invoice);
        const { error } = await supabase.from("clients").delete().eq("id", client.id);
        if (error) { toast.error("Delete failed", error.message); return; }
        toast.success("Client deleted", client.business_name + " has been removed.");
        await fetchClients();
      },
    });
  }

  async function updateClient(client: Client) {
    const { error } = await supabase.from("clients").update({
      business_name: client.business_name,
      invoice: client.invoice,
      owner_name: client.owner_name,
      owner_phone: (client as any).owner_phone || null,
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
    if (error) { toast.error("Save failed", error.message); return; }
    toast.success("Client updated");
    await fetchClients();
  }

  async function evaluateStanding(client: Client, reportHadPayment: boolean, hadReturn: boolean): Promise<string> {
    if (hadReturn) return "Needs Attention";
    if (!reportHadPayment) {
      const { data: recentPayments } = await supabase
        .from("payments").select("settlement_date, description")
        .eq("invoice", client.invoice)
        .order("settlement_date", { ascending: false }).limit(10);
      if (recentPayments) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const lastSettled = recentPayments.find((p: Payment) => {
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

  async function handlePaymentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const today = new Date();
    const todayStr = toDateString(today);

    const { data: clientsData } = await supabase.from("clients").select("*");
    if (!clientsData) return;

    const localClients = clientsData.map((c: Client) => ({ ...c }));
    const reportInvoices: string[] = [];
    const returnedInvoices: string[] = [];

    const isXML = text.trim().startsWith("<?xml") || text.trim().startsWith("<Workbook") || text.trim().startsWith(" <Workbook");
    const parsedRows = isXML ? parseXLSRows(text) : parseCSVRows(text);

    if (parsedRows.length === 0) {
      toast.error("No payments found", "No valid payment rows found. Check the file format and try again.");
      return;
    }

    let matched = 0, skippedDuplicates = 0;

    for (const { invoice, date, amount } of parsedRows) {
      const client = localClients.find((c: Client) =>
        c.invoice.trim().toLowerCase() === invoice.trim().toLowerCase()
      );
      if (!client) continue;

      reportInvoices.push(invoice);

      const achDate = new Date(date || todayStr);
      const settlementDate = addBusinessDays(achDate, 4);
      const settlementStr = toDateString(settlementDate);
      const alreadySettled = settlementDate <= today;
      const newBalance = alreadySettled
        ? Math.max(Number(client.balance || 0) - amount, 0)
        : Number(client.balance || 0);

      const { error: insertError } = await supabase.from("payments").insert({
        invoice,
        payment_date: date || todayStr,
        ach_date: date || todayStr,
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

    toast.success(
      "Upload complete",
      `${matched} new payment${matched !== 1 ? "s" : ""} recorded${skippedDuplicates > 0 ? ` · ${skippedDuplicates} duplicate${skippedDuplicates > 1 ? "s" : ""} skipped` : ""}.`
    );
    await fetchClients();
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading || checkingConsent) {
    return (
      <>
        <ToastProvider />
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--parchment)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 400, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 12 }}>
              {t.portalName}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-5)", letterSpacing: "0.04em" }}>{t.loading}</div>
          </div>
        </div>
      </>
    );
  }

  // ── Login ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <ToastProvider />
        <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--parchment)", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            {/* Language switcher */}
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
              {LANGS.map(l => (
                <button key={l.code} onClick={() => changeLang(l.code)} style={{ padding: "4px 12px", borderRadius: 7, border: `1px solid ${lang === l.code ? "transparent" : "var(--border-mid)"}`, background: lang === l.code ? "var(--ink-1)" : "transparent", color: lang === l.code ? "var(--gold-muted)" : "var(--ink-4)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                  {l.label}
                </button>
              ))}
            </div>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 14, background: "var(--ink-1)", border: "1px solid rgba(196,154,90,0.25)", marginBottom: 16 }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "var(--gold-bright)", letterSpacing: "0.05em" }}>FB</span>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: "var(--ink-1)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                {t.portalName}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{t.signInHeading}</div>
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 32, boxShadow: "0 4px 24px rgba(30,16,4,0.08)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />

              {!showForgot ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t.emailAddress}</label>
                    <input
                      type="email" placeholder="you@example.com"
                      style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "11px 14px", fontSize: 14, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                      value={email} onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t.password}</label>
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
                    {t.signInBtn}
                  </button>
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotStatus("idle"); setForgotMessage(""); }}
                      style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      {t.forgotPassword}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t.emailAddress}</label>
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
                      {forgotStatus === "loading" ? t.sending : t.sendResetLink}
                    </button>
                  )}
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={() => { setShowForgot(false); setForgotStatus("idle"); setForgotMessage(""); }}
                      style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      {t.backToSignIn}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.6, padding: "0 8px" }}>
              This portal is operated independently by Fellipe Busato and is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity. Information displayed is for organizational purposes only and does not constitute an official financial record.
            </div>
          </div>
        </main>
      </>
    );
  }

  // ── Consent ──────────────────────────────────────────────────────────────
  if (!isAdmin && !hasConsented) {
    return (
      <>
        <ToastProvider />
        <ConsentPage userEmail={user.email} onAgree={handleConsent} onDecline={handleDecline} />
      </>
    );
  }

  // ── Client view (non-admin) ───────────────────────────────────────────────
  if (!isAdmin) {
    if (!clientRecord) {
      return (
        <>
          <ToastProvider />
          <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--parchment)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "var(--ink-2)", marginBottom: 8 }}>{t.noAccount}</div>
              <p style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 20 }}>{t.noAccountDesc.replace("{email}", user.email)}</p>
              <button onClick={logout} style={{ borderRadius: 9, border: "1px solid var(--border-mid)", padding: "10px 20px", fontSize: 13, color: "var(--ink-3)", background: "transparent", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {t.logout}
              </button>
            </div>
          </main>
        </>
      );
    }
    return (
      <>
        <ToastProvider />
        <main style={{ minHeight: "100vh", background: "var(--parchment)" }}>
          <nav style={{ background: "var(--ink-1)", padding: "0 16px 0 20px", display: "flex", alignItems: "center", height: 60, position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--gold-border)", background: "rgba(160,120,64,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontWeight: 600, color: "var(--gold-bright)" }}>FB</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{t.portalName}</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {LANGS.map(l => (
                  <button key={l.code} onClick={() => changeLang(l.code)} style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${lang === l.code ? "rgba(196,154,90,0.4)" : "rgba(255,255,255,0.08)"}`, background: lang === l.code ? "rgba(196,154,90,0.15)" : "transparent", color: lang === l.code ? "var(--gold-bright)" : "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                    {l.label}
                  </button>
                ))}
              </div>
              <button onClick={logout} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(255,255,255,0.22)", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {t.logout}
              </button>
            </div>
          </nav>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 40px" }}>
            <ClientDashboard
              selectedClient={clientRecord}
              payments={payments}
              lang={lang}
              onPaymentAdded={async () => { await fetchPayments(clientRecord.invoice); }}
            />
          </div>
        </main>
      </>
    );
  }

  // ── Admin view ───────────────────────────────────────────────────────────
  return (
    <>
      <ToastProvider />
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(m => ({ ...m, open: false }))}
      />

      <main style={{ minHeight: "100vh", background: "var(--parchment)" }}>
        {/* ── Single Admin Nav ── */}
        <nav style={{ background: "var(--ink-1)", padding: "0 20px", display: "flex", alignItems: "center", height: 62, position: "sticky", top: 0, zIndex: 10, gap: 5, overflowX: "auto" }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 16, flexShrink: 0 }}>
            <button onClick={() => setView("admin")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--gold-border)", background: "rgba(160,120,64,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontWeight: 600, color: "var(--gold-bright)" }}>FB</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em" }}>FB Portal</span>
            </button>
            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Admin</span>
          </div>

          <button onClick={() => setView("admin")} style={navBtn(view === "admin", { bg: "rgba(160,120,64,0.2)", border: "rgba(160,120,64,0.4)", text: "var(--gold-bright)" })}>
            Dashboard
          </button>
          <button onClick={() => setView("triage")} style={navBtn(view === "triage", { bg: "rgba(154,90,58,0.15)", border: "rgba(154,90,58,0.35)", text: "#E8926A" })}>
            Triage
          </button>
          <button onClick={() => setView("analytics")} style={navBtn(view === "analytics", { bg: "rgba(74,100,160,0.18)", border: "rgba(74,100,160,0.38)", text: "#8B9ED4" })}>
            Analytics
          </button>
          <button onClick={() => setView("returns")} style={navBtn(view === "returns", { bg: "rgba(154,90,58,0.2)", border: "rgba(154,90,58,0.4)", text: "#E8926A" })}>
            Import returns
          </button>
          <button onClick={() => setView("statement")} style={navBtn(view === "statement", { bg: "rgba(74,126,160,0.2)", border: "rgba(74,126,160,0.4)", text: "#8BAED4" })}>
            Import statement
          </button>
          <button onClick={() => setView("achworks")} style={navBtn(view === "achworks", { bg: "rgba(74,100,160,0.2)", border: "rgba(74,100,160,0.4)", text: "#8B9ED4" })}>
            ACH Works
          </button>
          <button onClick={() => setView("add")} style={navBtn(view === "add", { bg: "rgba(90,138,106,0.2)", border: "rgba(90,138,106,0.4)", text: "#7ab89a" })}>
            + Add client
          </button>

          {selectedClient && (
            <button onClick={() => openClient(selectedClient)} style={navBtn(view === "client", { bg: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.9)" })}>
              Client view
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{user.email}</span>
            <button onClick={logout} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Logout
            </button>
          </div>
        </nav>

        {/* ── Admin body ── */}
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

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

          {view === "admin" && (
            <AdminDashboard
              clients={clients}
              openClient={openClient}
              handlePaymentUpload={handlePaymentUpload}
              deleteClient={confirmDeleteClient}
              updateClient={updateClient}
            />
          )}

          {view === "client" && selectedClient && (
            <div style={{ padding: "0 32px 40px" }}>
              <ClientDashboard
                selectedClient={selectedClient}
                payments={payments}
                isAdminView={true}
                lang={lang}
                onPaymentAdded={async () => {
                  await fetchPayments(selectedClient.invoice);
                  const { data } = await supabase.from("clients").select("*").eq("id", selectedClient.id).single();
                  if (data) {
                    setSelectedClient(data);
                    setClients(prev => prev.map((c) => c.id === data.id ? data : c));
                  }
                }}
              />
            </div>
          )}

          {view === "add" && (
            <div style={{ padding: "32px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 24 }}>
                Add client
              </div>
              <AddClientForm newClient={newClient} setNewClient={setNewClient} addClient={addClient} />
            </div>
          )}

          {view === "triage" && (
            <TriageDashboard clients={clients} openClient={openClient} updateClient={updateClient} />
          )}

          {view === "analytics" && (
            <AnalyticsDashboard clients={clients} />
          )}

          {view === "returns" && (
            <div style={{ padding: "32px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 24 }}>
                Import returns
              </div>
              <ReturnsImport clients={clients} onImportComplete={async () => { await fetchClients(); setView("admin"); }} />
            </div>
          )}

          {view === "statement" && (
            <div style={{ padding: "32px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 24 }}>
                Import CFG statement
              </div>
              <StatementImport clients={clients} onImportComplete={async () => { await fetchClients(); setView("admin"); }} />
            </div>
          )}

          {view === "achworks" && (
            <div style={{ padding: "32px" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em", marginBottom: 24 }}>
                Import ACH Works history
              </div>
              <ACHWorksImport clients={clients} onImportComplete={async () => { await fetchClients(); setView("admin"); }} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
