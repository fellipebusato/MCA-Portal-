"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import AdminDashboard from "@/components/AdminDashboard";
import ClientDashboard from "@/components/ClientDashboard";
import AddClientForm from "@/components/AddClientForm";
import ConsentPage from "@/components/ConsentPage";
import Footer from "@/components/Footer";
import ReturnsImport from "@/components/ReturnsImport";
import { ADMIN_EMAIL, PORTAL, CONTACT } from "@/lib/config";
import { ensureMonthlySnapshots } from "@/lib/snapshots";
import type { Client, Payment, NewClientForm, ParsedPaymentRow } from "@/lib/types";

const PAGE_SIZE = 25;

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

function parseXLSRows(text: string): ParsedPaymentRow[] {
  const results: ParsedPaymentRow[] = [];
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

function parseCSVRows(text: string): ParsedPaymentRow[] {
  const results: ParsedPaymentRow[] = [];
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

// Check if a paused client should auto-resume today
function shouldAutoResume(client: Client, todayStr: string): boolean {
  if (client.payment_status !== "paused") return false;
  if (!client.pause_end) return false;
  return client.pause_end < todayStr; // past the end date
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [view, setView] = useState<"admin" | "client" | "add" | "returns">("admin");
  const [clientRecord, setClientRecord] = useState<Client | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [checkingConsent, setCheckingConsent] = useState(false);
  const [orgId, setOrgId] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const [filterAttention, setFilterAttention] = useState(false);
  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [newClient, setNewClient] = useState<NewClientForm>({
    businessName: "", invoice: "", ownerName: "", clientEmail: "",
    fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "",
    paymentFrequency: "daily", paymentDay: "",
    state: "", sicCode: "", businessType: "", ficoScore: "",
    avgMonthlyRevenue: "", timeInBusinessMonths: "", position: "",
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchClients = useCallback(async (
    page: number = 1,
    search: string = "",
    attentionOnly: boolean = false
  ) => {
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase.from("clients").select("*", { count: "exact" });

    if (search.trim()) {
      query = query.or(
        `business_name.ilike.%${search.trim()}%,invoice.ilike.%${search.trim()}%,owner_name.ilike.%${search.trim()}%`
      );
    }

    if (attentionOnly) {
      query = query.neq("status", "Good Standing");
    }

    query = query.order("id", { ascending: true }).range(from, to);

    const { data, error, count } = await query;

    if (error) { alert(error.message); setLoading(false); return; }

    setClients((data || []) as Client[]);
    setTotalClients(count || 0);

    if (data?.[0] && !selectedClient) {
      setSelectedClient(data[0] as Client);
      await fetchPayments(data[0].invoice);
    }

    setView("admin");
    setLoading(false);
  }, [selectedClient]);

  async function fetchAllClients(): Promise<Client[]> {
    const { data } = await supabase.from("clients").select("*");
    const all = (data || []) as Client[];
    setAllClients(all);
    return all;
  }

  async function fetchOrgId() {
    const { data } = await supabase
      .from("organizations").select("id").limit(1).single();
    if (data) setOrgId(data.id);
  }

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchOrgId();
      fetchAllClients();
    }
  }, [user, isAdmin]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) {
      if (isAdmin) fetchClients(1, "", false);
      else checkConsent(user.email);
    }
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user && isAdmin) {
      fetchClients(currentPage, searchQuery, filterAttention);
    }
  }, [currentPage, searchQuery, filterAttention]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function checkUser() {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    setLoading(false);
  }

  async function checkConsent(userEmail: string) {
    setCheckingConsent(true);
    const { data } = await supabase
      .from("consent_log").select("id").eq("email", userEmail).limit(1);
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
      redirectTo: `${PORTAL.url}/reset`,
    });
    if (error) { setForgotMessage(error.message); setForgotStatus("error"); return; }
    setForgotStatus("sent");
    setForgotMessage("Check your email for a password reset link. It expires in 1 hour.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null); setClients([]); setPayments([]);
    setSelectedClient(null); setClientRecord(null); setHasConsented(false);
    setCurrentPage(1); setSearchQuery(""); setSearchInput(""); setFilterAttention(false);
  }

  async function fetchClientByEmail(userEmail: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients").select("*").eq("client_email", userEmail).single();
    if (error || !data) { setClientRecord(null); setLoading(false); setCheckingConsent(false); return; }
    setClientRecord(data as Client);
    await fetchPayments(data.invoice);
    setView("client");
    setLoading(false);
    setCheckingConsent(false);
  }

  async function fetchPayments(invoice: string) {
    const { data, error } = await supabase
      .from("payments").select("*").eq("invoice", invoice)
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true });
    if (error) { alert(error.message); return; }
    setPayments((data || []) as Payment[]);
  }

  async function openClient(client: Client) {
    setSelectedClient(client);
    await fetchPayments(client.invoice);
    setView("client");
  }

  async function addClient() {
    const payback = Number(newClient.payback);
    const payment = Number(newClient.payment);
    const frequency = newClient.paymentFrequency;
    const calculatedTerm = payback && payment
      ? Math.ceil(payback / payment) * (frequency === "weekly" ? 5 : 1)
      : 0;

    const client = {
      business_name: newClient.businessName,
      invoice: newClient.invoice,
      owner_name: newClient.ownerName,
      client_email: newClient.clientEmail,
      funded_date: newClient.fundedDate,
      funded: Number(newClient.funded),
      payback,
      paid: 0,
      balance: payback,
      payment,
      total_term: calculatedTerm,
      payment_frequency: frequency,
      payment_day: newClient.paymentDay || null,
      status: "Good Standing",
      payment_status: "active",
      total_returns: 0,
      state: newClient.state || null,
      sic_code: newClient.sicCode || null,
      business_type: newClient.businessType || null,
      fico_score: newClient.ficoScore ? Number(newClient.ficoScore) : null,
      avg_monthly_revenue: newClient.avgMonthlyRevenue ? Number(newClient.avgMonthlyRevenue) : null,
      time_in_business_months: newClient.timeInBusinessMonths ? Number(newClient.timeInBusinessMonths) : null,
      position: newClient.position ? Number(newClient.position) : null,
    };
    const { error } = await supabase.from("clients").insert([client]);
    if (error) { alert(error.message); return; }
    setNewClient({
      businessName: "", invoice: "", ownerName: "", clientEmail: "",
      fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "",
      paymentFrequency: "daily", paymentDay: "",
      state: "", sicCode: "", businessType: "", ficoScore: "",
      avgMonthlyRevenue: "", timeInBusinessMonths: "", position: "",
    });
    await fetchClients(1, searchQuery, filterAttention);
    await fetchAllClients();
    setView("admin");
  }

  async function deleteClient(client: Client) {
    if (!confirm(`Delete ${client.business_name} and all payment history?`)) return;
    await supabase.from("payments").delete().eq("invoice", client.invoice);
    await supabase.from("returns").delete().eq("invoice", client.invoice);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) { alert(error.message); return; }
    const newTotal = totalClients - 1;
    const maxPage = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
    const targetPage = Math.min(currentPage, maxPage);
    setCurrentPage(targetPage);
    await fetchClients(targetPage, searchQuery, filterAttention);
    await fetchAllClients();
  }

  async function updateClient(client: Client) {
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
      payment_status: client.payment_status || "active",
      pause_start: client.pause_start || null,
      pause_end: client.pause_end || null,
      state: client.state || null,
      sic_code: client.sic_code || null,
      business_type: client.business_type || null,
      fico_score: client.fico_score ? Number(client.fico_score) : null,
      avg_monthly_revenue: client.avg_monthly_revenue ? Number(client.avg_monthly_revenue) : null,
      time_in_business_months: client.time_in_business_months ? Number(client.time_in_business_months) : null,
      position: client.position ? Number(client.position) : null,
    }).eq("id", client.id);
    if (error) { alert(error.message); return; }
    await fetchClients(currentPage, searchQuery, filterAttention);
    await fetchAllClients();
  }

  async function evaluateStanding(client: Client, reportHadPayment: boolean, hadReturn: boolean): Promise<string> {
    if (hadReturn) return "Needs Attention";
    if (!reportHadPayment) {
      const { data: recentPayments } = await supabase
        .from("payments").select("settlement_date, description")
        .eq("invoice", client.invoice)
        .order("settlement_date", { ascending: false }).limit(10);
      if (recentPayments) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
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
    setUploading(true);

    const text = await file.text();
    const today = new Date();
    const todayStr = toDateString(today);

    const { data: clientsData } = await supabase.from("clients").select("*");
    if (!clientsData) { setUploading(false); return; }

    let localClients = clientsData as Client[];

    // ── Auto-resume paused clients whose pause_end has passed ──────────
    const resuming: string[] = [];
    for (const client of localClients) {
      if (shouldAutoResume(client, todayStr)) {
        await supabase.from("clients").update({
          payment_status: "active",
          pause_start: null,
          pause_end: null,
        }).eq("id", client.id);
        resuming.push(client.business_name);
        (client as any).payment_status = "active";
        (client as any).pause_start = null;
        (client as any).pause_end = null;
      }
    }

    const reportInvoices: string[] = [];
    const returnedInvoices: string[] = [];

    const isXML = text.trim().startsWith("<?xml") || text.trim().startsWith("<Workbook") || text.trim().startsWith(" <Workbook");
    const parsedRows = isXML ? parseXLSRows(text) : parseCSVRows(text);

    if (parsedRows.length === 0) {
      alert("No valid payment rows found in the file. Please check the format and try again.");
      setUploading(false);
      return;
    }

    let matched = 0;
    let skippedDuplicates = 0;

    for (const { invoice, date, amount } of parsedRows) {
      const client = localClients.find(c =>
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
        credit: 0,
        debit: amount,
        returns: 0,
        running_balance: alreadySettled ? newBalance : null,
      });

      if (insertError && insertError.code === "23505") { skippedDuplicates++; continue; }
      if (insertError) { console.error("Insert error:", insertError); continue; }

      matched++;

      if (alreadySettled) {
        await supabase.from("clients").update({ balance: newBalance }).eq("id", client.id);
        (client as any).balance = newBalance;
      }
    }

    // Flag missing clients — respect payment_status
    for (const client of localClients) {
      if (!reportInvoices.includes(client.invoice)) {
        const paymentStatus = client.payment_status || "active";

        // Skip non-active clients — paused, frozen, paid_off, weekly_off
        if (["paused", "paid_off", "frozen", "weekly_off"].includes(paymentStatus)) continue;

        const day = today.getDay();
        if (client.payment_frequency === "weekly" && day !== 5) continue;

        await supabase.from("payments").insert({
          invoice: client.invoice,
          payment_date: todayStr,
          ach_date: todayStr,
          settlement_date: todayStr,
          description: "Missed Payment",
          credit: 0,
          debit: 0,
          returns: Number(client.payment),
          running_balance: Number(client.balance || 0),
        });
        returnedInvoices.push(client.invoice);
      }
    }

    for (const client of localClients) {
      const paymentStatus = client.payment_status || "active";
      if (["paused", "paid_off"].includes(paymentStatus)) continue;

      const hadPayment = reportInvoices.includes(client.invoice);
      const hadReturn = returnedInvoices.includes(client.invoice);
      const newStatus = await evaluateStanding(client, hadPayment, hadReturn);
      await supabase.from("clients").update({ status: newStatus }).eq("id", client.id);
    }

    await ensureMonthlySnapshots(localClients, orgId);

    let msg = `Upload complete.\n\n${matched} new payments recorded.`;
    if (skippedDuplicates > 0) msg += `\n${skippedDuplicates} duplicate${skippedDuplicates > 1 ? "s" : ""} skipped (already on file).`;
    if (resuming.length > 0) msg += `\n\n${resuming.length} client${resuming.length > 1 ? "s" : ""} automatically resumed from pause:\n${resuming.join(", ")}`;
    alert(msg);
    setUploading(false);
    await fetchClients(currentPage, searchQuery, filterAttention);
    await fetchAllClients();
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading || checkingConsent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f4f0]">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  // ── Login ────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f4f0] p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">{PORTAL.name}</h1>
            <p className="mt-1 text-sm text-gray-400">Sign in to your account</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-sm">
            {!showForgot ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                  <input type="email" placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
                  <input type="password" placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                </div>
                <button onClick={handleLogin}
                  className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors mt-2">
                  Sign in
                </button>
                <div className="text-center">
                  <button onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotStatus("idle"); setForgotMessage(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    Forgot your password?
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Your email address</label>
                  <input type="email" placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                    value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()} />
                </div>
                {forgotMessage && (
                  <div className={`rounded-lg px-3 py-2.5 text-sm ${forgotStatus === "sent" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
                    {forgotMessage}
                  </div>
                )}
                {forgotStatus !== "sent" && (
                  <button onClick={handleForgotPassword} disabled={forgotStatus === "loading"}
                    className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50">
                    {forgotStatus === "loading" ? "Sending..." : "Send reset link"}
                  </button>
                )}
                <div className="text-center">
                  <button onClick={() => { setShowForgot(false); setForgotStatus("idle"); setForgotMessage(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    ← Back to sign in
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-gray-400">{PORTAL.tagline}</p>
          <p className="mt-2 text-center text-[10px] text-gray-300 leading-relaxed px-4">{PORTAL.disclaimer}</p>
        </div>
      </main>
    );
  }

  // ── Consent ──────────────────────────────────────────────
  if (!isAdmin && !hasConsented) {
    return <ConsentPage userEmail={user.email} onAgree={handleConsent} onDecline={handleDecline} />;
  }

  // ── Client view ──────────────────────────────────────────
  if (!isAdmin) {
    if (!clientRecord) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f4f0]">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">No account found for {user.email}.</p>
            <p className="text-xs text-gray-400 mb-6">Please contact {CONTACT.name} for access.</p>
            <button onClick={logout} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Sign out</button>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen flex flex-col bg-[#f4f4f0]">
        <nav className="sticky top-0 z-10 border-b border-gray-100 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <span className="text-base font-semibold text-gray-900">{PORTAL.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
              <button onClick={logout} className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Logout</button>
            </div>
          </div>
        </nav>
        <div className="mx-auto max-w-6xl w-full px-6 py-6 flex-1">
          <div className="mb-5"><h1 className="text-lg font-semibold text-gray-900">My account</h1></div>
          <ClientDashboard selectedClient={clientRecord} payments={payments} />
        </div>
        <Footer />
      </main>
    );
  }

  // ── Admin view ───────────────────────────────────────────
  return (
    <main className="min-h-screen flex flex-col bg-[#f4f4f0]">
      <nav className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <button onClick={() => setView("admin")} className="text-left">
            <span className="text-base font-semibold text-gray-900">{PORTAL.name}</span>
            <span className="ml-2 text-xs text-gray-400">Admin</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("admin")}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${view === "admin" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              Dashboard
            </button>
            <button onClick={() => setView("returns")}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${view === "returns" ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50 border border-red-200"}`}>
              Import returns
            </button>
            <button onClick={() => setView("add")}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${view === "add" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              + Add client
            </button>
            {selectedClient && (
              <button onClick={() => openClient(selectedClient)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${view === "client" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                Client view
              </button>
            )}
            <div className="mx-1 h-5 w-px bg-gray-200" />
            <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
            <button onClick={logout} className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Logout</button>
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-6xl w-full px-6 py-6 flex-1">
        <div className="mb-5">
          {view === "admin" && <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>}
          {view === "returns" && <h1 className="text-lg font-semibold text-gray-900">Import returned payments</h1>}
          {view === "add" && <h1 className="text-lg font-semibold text-gray-900">Add client</h1>}
          {view === "client" && selectedClient && (
            <div className="flex items-center gap-2">
              <button onClick={() => setView("admin")} className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</button>
              <h1 className="text-lg font-semibold text-gray-900">{selectedClient.business_name}</h1>
            </div>
          )}
        </div>

        {view === "admin" && (
          <AdminDashboard
            clients={clients}
            payments={payments}
            openClient={openClient}
            handlePaymentUpload={handlePaymentUpload}
            deleteClient={deleteClient}
            updateClient={updateClient}
            uploading={uploading}
            currentPage={currentPage}
            totalPages={totalPages}
            totalClients={totalClients}
            onPageChange={(page) => setCurrentPage(page)}
            searchInput={searchInput}
            onSearchChange={(val) => setSearchInput(val)}
            filterAttention={filterAttention}
            onFilterAttention={(val) => { setFilterAttention(val); setCurrentPage(1); }}
            orgId={orgId}
          />
        )}

        {view === "returns" && (
          <ReturnsImport
            clients={allClients}
            orgId={orgId}
            onImportComplete={async () => {
              await fetchClients(currentPage, searchQuery, filterAttention);
              await fetchAllClients();
              setView("admin");
            }}
          />
        )}

        {view === "client" && selectedClient && (
          <ClientDashboard
            selectedClient={selectedClient}
            payments={payments}
            isAdminView={true}
            onPaymentAdded={async () => {
              await fetchPayments(selectedClient.invoice);
              const { data } = await supabase.from("clients").select("*").eq("id", selectedClient.id).single();
              if (data) {
                setSelectedClient(data as Client);
                setClients(prev => prev.map(c => c.id === data.id ? data as Client : c));
              }
            }}
          />
        )}

        {view === "add" && (
          <AddClientForm newClient={newClient} setNewClient={setNewClient} addClient={addClient} />
        )}
      </div>
      <Footer />
    </main>
  );
}