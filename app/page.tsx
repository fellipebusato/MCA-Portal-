"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminDashboard from "@/components/AdminDashboard";
import ClientDashboard from "@/components/ClientDashboard";
import AddClientForm from "@/components/AddClientForm";
import ConsentPage from "@/components/ConsentPage";

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

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ── Parse ACH Works XML/XLS format ──────────────────────────
function parseXLSRows(text: string): { invoice: string; date: string; amount: number }[] {
  const results: { invoice: string; date: string; amount: number }[] = [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");

    // Try namespace-aware parsing first
    const ns = "urn:schemas-microsoft-com:office:spreadsheet";
    let rows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "Row"));

    // Fallback: try without namespace
    if (rows.length === 0) {
      rows = Array.from(xmlDoc.getElementsByTagName("Row"));
    }

    // Find header row to locate column positions
    if (rows.length === 0) return results;

    const headerRow = rows[0];
    let headerCells = Array.from(headerRow.getElementsByTagNameNS(ns, "Data"));
    if (headerCells.length === 0) {
      headerCells = Array.from(headerRow.getElementsByTagName("Data"));
    }

    // Map column names to indices
    let typeCol = 1, dateCol = 2, invoiceCol = 3, amountCol = 6;
    headerCells.forEach((cell, idx) => {
      const val = (cell.textContent || "").trim().toLowerCase();
      if (val === "type") typeCol = idx;
      if (val.includes("date")) dateCol = idx;
      if (val.includes("inv") || val === "inv#") invoiceCol = idx;
      if (val === "amount") amountCol = idx;
    });

    // Process data rows
    for (let i = 1; i < rows.length; i++) {
      let cells = Array.from(rows[i].getElementsByTagNameNS(ns, "Data"));
      if (cells.length === 0) {
        cells = Array.from(rows[i].getElementsByTagName("Data"));
      }
      if (cells.length < 4) continue;

      const type = (cells[typeCol]?.textContent || "").trim();
      const dateRaw = (cells[dateCol]?.textContent || "").trim();
      const invoice = (cells[invoiceCol]?.textContent || "").trim();
      const amountRaw = (cells[amountCol]?.textContent || "").trim();
      const amount = parseFloat(amountRaw);

      // Only process actual Payment rows
      if (type !== "Payment" && type !== "payment") continue;
      if (!invoice || !amount || isNaN(amount)) continue;

      // Normalize date — strip time component
      const date = dateRaw.includes("T") ? dateRaw.split("T")[0] : dateRaw;

      results.push({ invoice, date, amount });
    }
  } catch (err) {
    console.error("XLS parse error:", err);
  }
  return results;
}

// ── Parse CSV format ─────────────────────────────────────────
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

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [view, setView] = useState<"admin" | "client" | "add">("admin");
  const [clientRecord, setClientRecord] = useState<any>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [checkingConsent, setCheckingConsent] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState("");

  const [newClient, setNewClient] = useState({
    businessName: "", invoice: "", ownerName: "", clientEmail: "",
    fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "",
    paymentFrequency: "daily",
    paymentDay: "",
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => { checkUser(); }, []);
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
    const { data, error } = await supabase
      .from("clients").select("*").eq("client_email", userEmail).single();
    if (error || !data) { setClientRecord(null); setLoading(false); setCheckingConsent(false); return; }
    setClientRecord(data);
    await fetchPayments(data.invoice);
    setView("client");
    setLoading(false);
    setCheckingConsent(false);
  }

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").order("id", { ascending: true });
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
      business_name: newClient.businessName, invoice: newClient.invoice,
      owner_name: newClient.ownerName, client_email: newClient.clientEmail,
      funded_date: newClient.fundedDate, funded: Number(newClient.funded),
      payback: Number(newClient.payback), paid: 0, balance: Number(newClient.payback),
      payment: Number(newClient.payment), total_term: Number(newClient.totalTerm),
      payment_frequency: newClient.paymentFrequency,
      payment_day: newClient.paymentDay || null,
      status: "Good Standing",
    };
    const { error } = await supabase.from("clients").insert([client]);
    if (error) { alert(error.message); return; }
    setNewClient({ businessName: "", invoice: "", ownerName: "", clientEmail: "", fundedDate: "", funded: "", payback: "", payment: "", totalTerm: "", paymentFrequency: "daily", paymentDay: "" });
    await fetchClients();
    setView("admin");
  }

  async function deleteClient(client: any) {
    if (!confirm(`Delete ${client.business_name} and all payment history?`)) return;
    await supabase.from("payments").delete().eq("invoice", client.invoice);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) { alert(error.message); return; }
    await fetchClients();
  }

  async function updateClient(client: any) {
    const { error } = await supabase.from("clients").update({
      business_name: client.business_name, invoice: client.invoice,
      owner_name: client.owner_name, client_email: client.client_email,
      funded_date: client.funded_date, funded: Number(client.funded),
      payback: Number(client.payback), balance: Number(client.balance),
      payment: Number(client.payment), total_term: Number(client.total_term),
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
        .eq("invoice", client.invoice).order("settlement_date", { ascending: false }).limit(10);
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

    const text = await file.text();
    const today = new Date();
    const todayStr = toDateString(today);

    const { data: clientsData } = await supabase.from("clients").select("*");
    if (!clientsData) return;

    const localClients = clientsData.map((c: any) => ({ ...c }));
    const reportInvoices: string[] = [];
    const returnedInvoices: string[] = [];

    // Auto-detect format
    const isXML = text.trim().startsWith("<?xml") || text.trim().startsWith("<Workbook") || text.trim().startsWith(" <Workbook");
    const isCSV = !isXML;

    let parsedRows: { invoice: string; date: string; amount: number }[] = [];

    if (isXML) {
      parsedRows = parseXLSRows(text);
    } else {
      parsedRows = parseCSVRows(text);
    }

    if (parsedRows.length === 0) {
      alert("No valid payment rows found in the file. Please check the format and try again.");
      return;
    }

    // Process each payment row
    for (const { invoice, date, amount } of parsedRows) {
      // Find matching client by invoice number
      const client = localClients.find((c: any) =>
        c.invoice.trim().toLowerCase() === invoice.trim().toLowerCase()
      );

      if (!client) {
        console.warn(`No client found for invoice: ${invoice}`);
        continue;
      }

      reportInvoices.push(invoice);

      const achDate = new Date(date || todayStr);
      const settlementDate = addBusinessDays(achDate, 4);
      const settlementStr = toDateString(settlementDate);
      const alreadySettled = settlementDate <= today;
      const newBalance = alreadySettled
        ? Math.max(Number(client.balance || 0) - amount, 0)
        : Number(client.balance || 0);

      await supabase.from("payments").insert({
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

      if (alreadySettled) {
        await supabase.from("clients").update({ balance: newBalance }).eq("id", client.id);
        client.balance = newBalance;
      }
    }

    // Flag clients not in today's report
    for (const client of localClients) {
      if (!reportInvoices.includes(client.invoice)) {
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

    // Update standing for all clients
    for (const client of localClients) {
      const hadPayment = reportInvoices.includes(client.invoice);
      const hadReturn = returnedInvoices.includes(client.invoice);
      const newStatus = await evaluateStanding(client, hadPayment, hadReturn);
      await supabase.from("clients").update({ status: newStatus }).eq("id", client.id);
    }

    const matched = reportInvoices.length;
    const total = parsedRows.length;
    alert(`Upload complete.\n\n${matched} of ${total} payments matched and recorded.\nAll balances updated.`);
    await fetchClients();
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
      <main className="flex min-h-screen items-center justify-center bg-[#f4f4f0] p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">MCA Portal</h1>
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
          <p className="mt-4 text-center text-xs text-gray-400">Secure client portal · Operated by Fellipe Busato</p>
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
        <main className="flex min-h-screen items-center justify-center bg-[#f4f4f0]">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">No account found for {user.email}.</p>
            <p className="text-xs text-gray-400 mb-6">Please contact your manager for access.</p>
            <button onClick={logout} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Sign out</button>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen bg-[#f4f4f0]">
        <nav className="sticky top-0 z-10 border-b border-gray-100 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <span className="text-base font-semibold text-gray-900">MCA Portal</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
              <button onClick={logout} className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Logout</button>
            </div>
          </div>
        </nav>
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="mb-5"><h1 className="text-lg font-semibold text-gray-900">My account</h1></div>
          <ClientDashboard selectedClient={clientRecord} payments={payments} />
        </div>
      </main>
    );
  }

  // ── Admin view ───────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#f4f4f0]">
      <nav className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <button onClick={() => setView("admin")} className="text-left">
            <span className="text-base font-semibold text-gray-900">MCA Portal</span>
            <span className="ml-2 text-xs text-gray-400">Admin</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("admin")}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${view === "admin" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              Dashboard
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
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5">
          {view === "admin" && <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>}
          {view === "add" && <h1 className="text-lg font-semibold text-gray-900">Add client</h1>}
          {view === "client" && selectedClient && (
            <div className="flex items-center gap-2">
              <button onClick={() => setView("admin")} className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</button>
              <h1 className="text-lg font-semibold text-gray-900">{selectedClient.business_name}</h1>
            </div>
          )}
        </div>
        {view === "admin" && (
          <AdminDashboard clients={clients} openClient={openClient} handlePaymentUpload={handlePaymentUpload} deleteClient={deleteClient} updateClient={updateClient} />
        )}
        {view === "client" && selectedClient && (
          <ClientDashboard selectedClient={selectedClient} payments={payments} />
        )}
        {view === "add" && (
          <AddClientForm newClient={newClient} setNewClient={setNewClient} addClient={addClient} />
        )}
      </div>
    </main>
  );
}