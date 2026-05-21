"use client";
import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type AdminDashboardProps = {
  clients: any[];
  openClient: (client: any) => void;
  handlePaymentUpload: (e: any) => void;
  handlePaymentUploadWithPreview?: (rows: any[]) => void;
  deleteClient: (client: any) => void;
  updateClient: (client: any) => void;
};

type SmartFilter = "all" | "on-track" | "behind" | "daily" | "weekly";
type WeekStatus = { status: "on-track" | "behind" | "in-progress" | "not-due"; made: number; expected: number };

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function moneyM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return money(n);
}
function formatDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
function pct(n: number) { return `${Math.round(n * 100)}%`; }
function todayStr() { return new Date().toISOString().split("T")[0]; }

function getMondayStr(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime() + diff * 86400000);
  return monday.toISOString().split("T")[0];
}
function businessDaysElapsedThisWeek(): number {
  const dow = new Date().getDay();
  if (dow === 0) return 0;
  if (dow === 6) return 5;
  return dow;
}
function getWeeklyStatus(client: any, weekPayments: any[]): WeekStatus {
  const valid = weekPayments.filter(p => p.debit > 0 && !(p.description || "").toLowerCase().includes("missed"));
  if (client.payment_frequency === "weekly") {
    const dayMap: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
    const expectedDow = dayMap[client.payment_day?.toLowerCase() || ""] ?? -1;
    const todayDow = new Date().getDay();
    if (valid.length >= 1) return { status: "on-track", made: 1, expected: 1 };
    if (expectedDow < 0 || todayDow < expectedDow) return { status: "not-due", made: 0, expected: 1 };
    return { status: "behind", made: 0, expected: 1 };
  } else {
    const elapsed = businessDaysElapsedThisWeek();
    const made = valid.length;
    if (made >= 3) return { status: "on-track", made, expected: elapsed };
    if (elapsed < 3) return { status: "in-progress", made, expected: elapsed };
    return { status: "behind", made, expected: elapsed };
  }
}

function StandingBadge({ status }: { status: string }) {
  const s = status || "Good Standing";
  const configs: Record<string, { bg: string; border: string; color: string; dot: string; label: string }> = {
    "Good Standing": { bg: "var(--sage-surface)", border: "var(--sage-border)", color: "var(--sage)", dot: "var(--sage)", label: "Good standing" },
    "Paused": { bg: "rgba(196,140,40,0.1)", border: "rgba(196,140,40,0.3)", color: "#a07010", dot: "#c48c28", label: "Paused" },
    "Blocked": { bg: "var(--ink-1)", border: "var(--ink-1)", color: "rgba(255,255,255,0.9)", dot: "rgba(255,255,255,0.5)", label: "Blocked" },
    "Payment Issues": { bg: "rgba(220,100,20,0.1)", border: "rgba(220,100,20,0.3)", color: "#c45010", dot: "#e06020", label: "Payment issues" },
    "Needs Attention": { bg: "var(--sienna-surface)", border: "var(--sienna-border)", color: "var(--sienna)", dot: "var(--sienna)", label: "Needs attention" },
  };
  const cfg = configs[s] || configs["Needs Attention"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: 10, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}
function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "32px 0 20px" }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.14em", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

const EDIT_FIELDS: [string, string, string][] = [
  ["business_name", "Business name", "text"], ["invoice", "Invoice #", "text"],
  ["ach_works_name", "ACH Works name", "text"], ["owner_name", "Owner name", "text"],
  ["owner_phone", "Owner phone", "text"], ["client_email", "Client email", "text"],
  ["funded_date", "Funded date", "date"], ["funded", "Funded amount ($)", "text"],
  ["payback", "Payback amount ($)", "text"], ["balance", "Current balance ($)", "text"],
  ["payment", "Payment amount ($)", "text"], ["total_term", "Total term (days)", "text"],
  ["status", "Standing", "select"], ["pause_start", "Pause start date", "date"],
  ["pause_end", "Pause end date", "date"], ["state", "State", "text"],
  ["sic_code", "SIC code", "text"], ["business_type", "Business type", "text"],
];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export default function AdminDashboard({
  clients, openClient, handlePaymentUpload, deleteClient, updateClient,
}: AdminDashboardProps) {
  const [editingClient, setEditingClient] = useState<any>(null);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewRows, setPreviewRows] = useState<any[] | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [menuClient, setMenuClient] = useState<any | null>(null);
  const [periodIdx, setPeriodIdx] = useState<number | null>(null);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [weekPaymentsByInvoice, setWeekPaymentsByInvoice] = useState<Record<string, any[]>>({});
  const [recentHistoryByInvoice, setRecentHistoryByInvoice] = useState<Record<string, any[]>>({});

  const today = todayStr();

  useEffect(() => {
    async function load() {
      if (!clients.length) return;
      const allInvoices = clients.map(c => c.invoice);
      const monday = getMondayStr();

      // This week's payments
      const { data: weekData } = await supabase
        .from("payments").select("invoice, payment_date, debit, returns, description")
        .in("invoice", allInvoices).gte("payment_date", monday).lte("payment_date", today);
      const weekMap: Record<string, any[]> = {};
      for (const row of weekData || []) {
        if (!weekMap[row.invoice]) weekMap[row.invoice] = [];
        weekMap[row.invoice].push(row);
      }
      setWeekPaymentsByInvoice(weekMap);

      // Recent payment history for dots (last 45 days)
      const d45 = new Date();
      d45.setDate(d45.getDate() - 45);
      const histStart = d45.toISOString().split("T")[0];
      const { data: histData } = await supabase
        .from("payments").select("invoice, payment_date, debit, returns, description")
        .in("invoice", allInvoices).gte("payment_date", histStart)
        .order("payment_date", { ascending: false });
      const histMap: Record<string, any[]> = {};
      for (const row of histData || []) {
        if (!histMap[row.invoice]) histMap[row.invoice] = [];
        if (histMap[row.invoice].length < 12) histMap[row.invoice].push(row);
      }
      setRecentHistoryByInvoice(histMap);
    }
    if (clients.length > 0) load();
  }, [clients, today]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const totalBalance = useMemo(() => clients.reduce((s, c) => s + Number(c.balance || 0), 0), [clients]);

  const weeklyStatusMap = useMemo(() => {
    const map: Record<number, WeekStatus> = {};
    for (const c of clients) map[c.id] = getWeeklyStatus(c, weekPaymentsByInvoice[c.invoice] || []);
    return map;
  }, [clients, weekPaymentsByInvoice]);

  const weekCounts = useMemo(() => ({
    onTrack: clients.filter(c => weeklyStatusMap[c.id]?.status === "on-track").length,
    behind: clients.filter(c => weeklyStatusMap[c.id]?.status === "behind").length,
    inProgress: clients.filter(c => weeklyStatusMap[c.id]?.status === "in-progress").length,
    notDue: clients.filter(c => weeklyStatusMap[c.id]?.status === "not-due").length,
  }), [clients, weeklyStatusMap]);

  // ── Sort + filter ────────────────────────────────────────────────────────
  const sortedClients = useMemo(() => [...clients].sort((a, b) => {
    if (!a.funded_date) return 1;
    if (!b.funded_date) return -1;
    const dd = new Date(a.funded_date).getTime() - new Date(b.funded_date).getTime();
    if (dd !== 0) return dd;
    return (parseInt((a.invoice || "").replace(/\D/g, "")) || 0) - (parseInt((b.invoice || "").replace(/\D/g, "")) || 0);
  }), [clients]);

  const smartFilteredClients = useMemo(() => {
    if (smartFilter === "all") return sortedClients;
    if (smartFilter === "on-track") return sortedClients.filter(c => weeklyStatusMap[c.id]?.status === "on-track");
    if (smartFilter === "behind") return sortedClients.filter(c => weeklyStatusMap[c.id]?.status === "behind");
    if (smartFilter === "daily") return sortedClients.filter(c => c.payment_frequency === "daily");
    if (smartFilter === "weekly") return sortedClients.filter(c => c.payment_frequency === "weekly");
    return sortedClients;
  }, [smartFilter, sortedClients, weeklyStatusMap]);

  const counts = {
    all: sortedClients.length,
    "on-track": weekCounts.onTrack,
    behind: weekCounts.behind,
    daily: sortedClients.filter(c => c.payment_frequency === "daily").length,
    weekly: sortedClients.filter(c => c.payment_frequency === "weekly").length,
  };

  // ── Period navigation ────────────────────────────────────────────────────
  function getPeriodLabel(d: string): string {
    if (!d) return "Unknown";
    const dt = new Date(d + "T00:00:00");
    const y = dt.getFullYear();
    const m = dt.toLocaleString("en-US", { month: "long" });
    return dt.getDate() <= 15 ? `${m} ${y} · 1st half` : `${m} ${y} · 2nd half`;
  }
  const allPeriods = useMemo(() => Array.from(new Set(sortedClients.map(c => getPeriodLabel(c.funded_date)))), [sortedClients]);
  const resolvedIdx = periodIdx === null ? allPeriods.length - 1 : Math.min(Math.max(0, periodIdx), allPeriods.length - 1);

  const displayedClients = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return smartFilteredClients.filter(c =>
        c.business_name?.toLowerCase().includes(q) || c.invoice?.toLowerCase().includes(q) ||
        c.owner_name?.toLowerCase().includes(q) || (c.owner_phone || "").toLowerCase().includes(q)
      );
    }
    if (smartFilter !== "all") return smartFilteredClients;
    if (allPeriods.length > 0) return smartFilteredClients.filter(c => getPeriodLabel(c.funded_date) === allPeriods[resolvedIdx]);
    return smartFilteredClients;
  }, [searchQuery, smartFilteredClients, smartFilter, allPeriods, resolvedIdx]);

  const currentPeriod = allPeriods[resolvedIdx] || "";

  // ── Export ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ["Business Name", "Invoice", "Owner", "Phone", "Email", "Funded Date", "Funded ($)", "Payback ($)", "Balance ($)", "Payment ($)", "Frequency", "Status", "Sales Rep", "% Paid"];
    const rows = clients.map(c => [
      c.business_name, c.invoice, c.owner_name, c.owner_phone || "", c.client_email, c.funded_date,
      c.funded, c.payback, c.balance, c.payment, c.payment_frequency, c.status,
      c.sales_rep || "", c.percentage_paid != null ? pct(Number(c.percentage_paid)) : "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `clients-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── File upload preview ──────────────────────────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewFile(file);
    const text = await file.text();
    const isXML = text.trim().startsWith("<?xml") || text.includes("<Workbook");
    const rows: any[] = [];
    if (isXML) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const ns = "urn:schemas-microsoft-com:office:spreadsheet";
      let xmlRows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "Row"));
      if (xmlRows.length === 0) xmlRows = Array.from(xmlDoc.getElementsByTagName("Row"));
      for (let i = 1; i < xmlRows.length; i++) {
        let cells = Array.from(xmlRows[i].getElementsByTagNameNS(ns, "Data")) as Element[];
        if (cells.length === 0) cells = Array.from(xmlRows[i].getElementsByTagName("Data")) as Element[];
        if (cells.length < 4) continue;
        const type = (cells[1]?.textContent || "").trim().toLowerCase();
        if (!["payment", "credit memo"].includes(type)) continue;
        const date = (cells[2]?.textContent || "").trim().split("T")[0];
        const invoice = (cells[3]?.textContent || "").trim();
        const amount = parseFloat(cells[6]?.textContent || "0");
        if (!invoice || !amount || isNaN(amount)) continue;
        const client = clients.find(c => c.invoice.trim().toLowerCase() === invoice.trim().toLowerCase());
        rows.push({ invoice, date, amount, clientName: client?.business_name || "Unknown", matched: !!client });
      }
    } else {
      const lines = text.split("\n").slice(1);
      for (const line of lines) {
        const cols = line.split(",");
        const invoice = cols[3]?.trim();
        const date = cols[2]?.trim();
        const amount = parseFloat(cols[6]?.trim() || "0");
        if (!invoice || !amount || isNaN(amount)) continue;
        const client = clients.find(c => c.invoice.trim().toLowerCase() === invoice.trim().toLowerCase());
        rows.push({ invoice, date, amount, clientName: client?.business_name || "Unknown", matched: !!client });
      }
    }
    setPreviewRows(rows);
    e.target.value = "";
  }
  function handleConfirmUpload() {
    if (!previewFile) return;
    const dt = new DataTransfer();
    dt.items.add(previewFile);
    handlePaymentUpload({ target: { files: dt.files } } as any);
    setPreviewRows(null); setPreviewFile(null);
  }

  return (
    <div style={{ minHeight: "calc(100vh - 108px)", background: "var(--parchment)", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: "28px 32px 40px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 600, color: "var(--ink-1)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Good morning, <em style={{ fontStyle: "italic", color: "var(--gold)" }}>Fellipe.</em>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 5 }}>
              {clients.length} active {clients.length === 1 ? "client" : "clients"} &nbsp;·&nbsp; {moneyM(totalBalance)} open balance
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: 7, background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 16px", borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><path d="M6.5 12V4M3 9l3.5 3L10 9M1.5 2.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export CSV
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--ink-1)", color: "var(--gold-bright)", border: "1px solid rgba(196,154,90,0.35)", padding: "11px 20px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3 4L6.5 1 10 4M1.5 10.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Upload payments
              <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFileSelect} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        {/* ── Upload preview modal ── */}
        {previewRows !== null && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(28,20,12,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 680, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(28,20,12,0.3)", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
              <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: "var(--ink-1)", marginBottom: 4 }}>Review before processing</div>
                <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{previewRows.length} payment{previewRows.length !== 1 ? "s" : ""} found · {previewRows.filter(r => r.matched).length} matched</div>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--parchment-2)", position: "sticky", top: 0 }}>
                      {["Client", "Invoice", "Date", "Amount", "Match"].map(h => (
                        <th key={h} style={{ padding: "10px 22px", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 22px", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{row.clientName}</td>
                        <td style={{ padding: "12px 22px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{row.invoice}</td>
                        <td style={{ padding: "12px 22px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{row.date}</td>
                        <td style={{ padding: "12px 22px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{money(row.amount)}</td>
                        <td style={{ padding: "12px 22px" }}>
                          {row.matched
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", color: "var(--sage)", fontSize: 10, fontWeight: 500 }}>✓ Matched</span>
                            : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", color: "var(--sienna)", fontSize: 10, fontWeight: 500 }}>✕ No match</span>
                          }
                        </td>
                      </tr>
                    ))}
                    {previewRows.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: "32px", textAlign: "center", fontSize: 13, color: "var(--ink-4)" }}>No payment rows found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "18px 28px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
                <button onClick={handleConfirmUpload} disabled={previewRows.filter(r => r.matched).length === 0} style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.25)", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: previewRows.filter(r => r.matched).length === 0 ? 0.4 : 1 }}>
                  Process {previewRows.filter(r => r.matched).length} payment{previewRows.filter(r => r.matched).length !== 1 ? "s" : ""}
                </button>
                <button onClick={() => { setPreviewRows(null); setPreviewFile(null); }} style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Weekly Performance Banner ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)", marginBottom: 0 }}>
          {([
            { label: "On Track", count: weekCounts.onTrack, color: "#7DC898", desc: "made 3+ daily or weekly payment", filter: "on-track" as SmartFilter },
            { label: "Behind This Week", count: weekCounts.behind, color: "#b83220", desc: "missed threshold or weekly payment", filter: "behind" as SmartFilter },
            { label: "In Progress", count: weekCounts.inProgress, color: "#c48c28", desc: "early week, not enough days yet", filter: null },
            { label: "Not Yet Due", count: weekCounts.notDue, color: "var(--ink-4)", desc: "weekly clients, payment day ahead", filter: null },
          ]).map(({ label, count, color, desc, filter }, i) => (
            <div
              key={label}
              style={{ padding: "20px 22px", borderRight: i < 3 ? "1px solid rgba(0,0,0,0.06)" : "none", cursor: filter ? "pointer" : "default", transition: "background 0.1s" }}
              onClick={() => filter && setSmartFilter(smartFilter === filter ? "all" : filter)}
              onMouseEnter={e => { if (filter) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.02)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 400, color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 6 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* ── CLIENT ROSTER ── */}
        <SectionDivider label="Client Roster" />

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(30,16,4,0.06)", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)", zIndex: 1 }} />

          {/* Roster header */}
          <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, color: "var(--ink-1)" }}>
                Clients <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>· {displayedClients.length} shown</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>Sorted by funded date · oldest first</div>
            </div>
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="var(--ink-5)" strokeWidth="1.3"/>
                <path d="M9 9l2 2" stroke="var(--ink-5)" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input type="text" placeholder="Search name or invoice…"
                style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 12, borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", color: "var(--ink-2)", outline: "none", width: 210, fontFamily: "'DM Sans', sans-serif" }}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>

          {/* Smart filter buttons */}
          <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, background: "var(--parchment-2)", flexWrap: "wrap" }}>
            {([
              { key: "all", label: "All" },
              { key: "on-track", label: "On Track This Week" },
              { key: "behind", label: "Behind This Week" },
              { key: "daily", label: "Daily" },
              { key: "weekly", label: "Weekly" },
            ] as { key: SmartFilter; label: string }[]).map(({ key, label }) => {
              const active = smartFilter === key;
              return (
                <button key={key} onClick={() => { setSmartFilter(key); setPeriodIdx(null); setSearchQuery(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 13px", borderRadius: 99, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: active ? "#0D1B2A" : "transparent", border: active ? "1px solid rgba(196,154,90,0.4)" : "1px solid var(--border-mid)", color: active ? "#C4A050" : "var(--ink-3)", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, color: active ? "rgba(196,154,90,0.75)" : "var(--ink-5)", background: active ? "rgba(196,154,90,0.12)" : "rgba(0,0,0,0.06)", borderRadius: 4, padding: "1px 5px" }}>{counts[key]}</span>
                </button>
              );
            })}
          </div>

          {/* Period navigation */}
          {!searchQuery.trim() && smartFilter === "all" && allPeriods.length > 1 && (
            <div style={{ padding: "8px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--parchment-2)" }}>
              <button onClick={() => setPeriodIdx(resolvedIdx > 0 ? resolvedIdx - 1 : 0)} disabled={resolvedIdx === 0} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: resolvedIdx === 0 ? "var(--ink-5)" : "var(--ink-3)", cursor: resolvedIdx === 0 ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", minWidth: 200, textAlign: "center" }}>
                {currentPeriod} <span style={{ fontWeight: 400, color: "var(--ink-4)" }}>({displayedClients.length})</span>
              </span>
              <button onClick={() => setPeriodIdx(resolvedIdx < allPeriods.length - 1 ? resolvedIdx + 1 : resolvedIdx)} disabled={resolvedIdx >= allPeriods.length - 1} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: resolvedIdx >= allPeriods.length - 1 ? "var(--ink-5)" : "var(--ink-3)", cursor: resolvedIdx >= allPeriods.length - 1 ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{resolvedIdx + 1} of {allPeriods.length}</span>
            </div>
          )}

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--parchment-2)" }}>
                {["Business / ACH Name", "Invoice", "Balance · Payment", "Schedule", "This Week", "History (recent→oldest)", "Standing", ""].map(h => (
                  <th key={h} style={{ padding: "10px 16px", fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedClients.map(client => {
                const sched = client.payment_frequency === "weekly"
                  ? `Weekly${client.payment_day ? ` · ${client.payment_day.charAt(0).toUpperCase() + client.payment_day.slice(1)}` : ""}`
                  : "Daily";
                const ws = weeklyStatusMap[client.id];
                const weekStatusConfigs = {
                  "on-track": { color: "#2E7D32", bg: "rgba(46,125,50,0.08)", border: "rgba(46,125,50,0.25)", label: client.payment_frequency === "weekly" ? "✓ Paid" : `${ws?.made}/${ws?.expected} days` },
                  "behind":   { color: "#b83220", bg: "rgba(184,50,32,0.08)", border: "rgba(184,50,32,0.25)", label: client.payment_frequency === "weekly" ? "Missed" : `${ws?.made}/${ws?.expected} days` },
                  "in-progress": { color: "#c48c28", bg: "rgba(196,140,40,0.08)", border: "rgba(196,140,40,0.25)", label: `${ws?.made}/${ws?.expected} days` },
                  "not-due":  { color: "var(--ink-4)", bg: "rgba(0,0,0,0.04)", border: "rgba(0,0,0,0.1)", label: "Not Due" },
                };
                const wsCfg = ws ? weekStatusConfigs[ws.status] : null;
                const history = (recentHistoryByInvoice[client.invoice] || []).slice(0, 10);

                return (
                  <React.Fragment key={client.id}>
                    <tr
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                      onClick={() => { setMenuClient(null); openClient(client); }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                      {/* Business name + ACH name */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>{client.business_name}</div>
                        {client.ach_works_name && (
                          <div style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 2 }}>{client.ach_works_name}</div>
                        )}
                      </td>

                      {/* Invoice */}
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{client.invoice}</span>
                      </td>

                      {/* Balance + payment */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{money(Number(client.balance || 0))}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>{money(Number(client.payment || 0))}/{client.payment_frequency === "weekly" ? "wk" : "day"}</div>
                      </td>

                      {/* Schedule */}
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{sched}</span>
                      </td>

                      {/* This Week */}
                      <td style={{ padding: "13px 16px" }}>
                        {wsCfg
                          ? <span style={{ fontSize: 10, fontWeight: 600, color: wsCfg.color, background: wsCfg.bg, border: `1px solid ${wsCfg.border}`, borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap" }}>{wsCfg.label}</span>
                          : <span style={{ fontSize: 10, color: "var(--ink-5)" }}>—</span>
                        }
                      </td>

                      {/* Payment history dots — most recent left */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          {history.map((p, i) => {
                            const desc = (p.description || "").toLowerCase();
                            const isReturn = p.returns > 0 || desc.includes("return");
                            const isMissed = !isReturn && (p.debit === 0 || desc.includes("missed"));
                            const dotColor = isReturn ? "#D4461E" : isMissed ? "#d1d5db" : "#7DC898";
                            const borderColor = isReturn ? "#D4461E" : isMissed ? "#c0c4cc" : "#5aaa7a";
                            return (
                              <span key={i}
                                title={`${formatDate(p.payment_date)}: ${isReturn ? "Return" : isMissed ? "Missed" : "Paid"}`}
                                style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, border: `1px solid ${borderColor}`, display: "inline-block", flexShrink: 0 }} />
                            );
                          })}
                          {history.length === 0 && <span style={{ fontSize: 9, color: "var(--ink-5)" }}>no history</span>}
                        </div>
                      </td>

                      {/* Standing */}
                      <td style={{ padding: "13px 16px" }}>
                        <StandingBadge status={client.status} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "13px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                        <div style={{ position: "relative", display: "inline-block" }}>
                          <div
                            style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border-mid)", background: menuClient?.id === client.id ? "var(--gold-surface)" : "transparent", color: menuClient?.id === client.id ? "var(--gold)" : "var(--ink-4)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, fontWeight: 700, transition: "all 0.15s" }}
                            onClick={e => { e.stopPropagation(); setMenuClient(menuClient?.id === client.id ? null : client); }}>
                            ···
                          </div>
                          {menuClient?.id === client.id && (
                            <div style={{ position: "absolute", right: 0, top: 34, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(30,16,4,0.14)", minWidth: 140, overflow: "hidden" }}>
                              <button onClick={e => { e.stopPropagation(); setEditingClient({ ...client }); setEditingClientId(client.id); setMenuClient(null); }} style={{ width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 13, color: "var(--ink-2)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>✏️ Edit client</button>
                              <div style={{ height: 1, background: "var(--border)", margin: "0 10px" }} />
                              <button onClick={e => { e.stopPropagation(); setMenuClient(null); deleteClient(client); }} style={{ width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 13, color: "#C83C1E", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>🗑️ Delete client</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit row */}
                    {editingClientId === client.id && editingClient && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: "var(--parchment-2)" }}>
                          <div style={{ padding: "18px 24px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: "var(--ink-1)" }}>Editing — {editingClient.business_name}</div>
                              <button onClick={() => { setEditingClient(null); setEditingClientId(null); }} style={{ fontSize: 11, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                              {EDIT_FIELDS.map(([field, label, type]) => (
                                <div key={field}>
                                  <label style={{ display: "block", fontSize: 9, color: "var(--ink-4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</label>
                                  {type === "select" ? (
                                    <select style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "8px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} value={editingClient[field] || ""} onChange={e => setEditingClient({ ...editingClient, [field]: e.target.value })}>
                                      <option value="Good Standing">Good Standing</option>
                                      <option value="Needs Attention">Needs Attention</option>
                                      <option value="Paused">Paused</option>
                                      <option value="Blocked">Blocked</option>
                                      <option value="Completed">Completed</option>
                                      <option value="Default">Default</option>
                                    </select>
                                  ) : (
                                    <input type={type || "text"} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "8px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} value={editingClient[field] || ""} onChange={e => setEditingClient({ ...editingClient, [field]: e.target.value })} />
                                  )}
                                </div>
                              ))}
                              <div>
                                <label style={{ display: "block", fontSize: 9, color: "var(--ink-4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Frequency</label>
                                <select style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "8px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} value={editingClient.payment_frequency || "daily"} onChange={e => setEditingClient({ ...editingClient, payment_frequency: e.target.value })}>
                                  <option value="daily">Daily</option>
                                  <option value="weekly">Weekly</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: 9, color: "var(--ink-4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Payment day</label>
                                <select style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "8px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} value={editingClient.payment_day || ""} onChange={e => setEditingClient({ ...editingClient, payment_day: e.target.value })}>
                                  <option value="">Not applicable (daily)</option>
                                  {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                              <button onClick={() => { updateClient(editingClient); setEditingClient(null); setEditingClientId(null); }} style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save changes</button>
                              <button onClick={() => { setEditingClient(null); setEditingClientId(null); }} style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "9px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {displayedClients.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: "48px", textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
                    {searchQuery ? `No clients matching "${searchQuery}"` : "No clients yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 40, textAlign: "center", fontSize: 11, color: "var(--ink-5)", lineHeight: 1.6 }}>
          This portal is a personal organizational tool operated independently by Fellipe Busato.<br />
          It is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity.
        </div>
      </div>
    </div>
  );
}
