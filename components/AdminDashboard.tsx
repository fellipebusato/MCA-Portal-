"use client";
import React from "react";

import { useState } from "react";
import MonthlyRiskPanel from "@/components/MonthlyRiskPanel";
import MorningDashboard from "@/components/MorningDashboard";
import ACHOperationsCenter from "@/components/ACHOperationsCenter";

type AdminDashboardProps = {
  clients: any[];
  openClient: (client: any) => void;
  handlePaymentUpload: (e: any) => void;
  handlePaymentUploadWithPreview?: (rows: any[]) => void;
  deleteClient: (client: any) => void;
  updateClient: (client: any) => void;
};

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

const EDIT_FIELDS: [string, string, string][] = [
  ["business_name", "Business name", "text"],
  ["invoice", "Invoice #", "text"],
  ["owner_name", "Owner name", "text"],
  ["client_email", "Client email", "text"],
  ["funded_date", "Funded date", "date"],
  ["funded", "Funded amount ($)", "text"],
  ["payback", "Payback amount ($)", "text"],
  ["balance", "Current balance ($)", "text"],
  ["payment", "Payment amount ($)", "text"],
  ["total_term", "Total term (days)", "text"],
  ["status", "Standing", "select"],
  ["pause_start", "Pause start date", "date"],
  ["pause_end", "Pause end date", "date"],
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

// Shared style objects
const navStyles: React.CSSProperties = {
  background: "var(--ink-1)",
  padding: "0 28px",
  display: "flex",
  alignItems: "center",
  height: 62,
  gap: 2,
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "24px 22px",
  boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  position: "relative",
  overflow: "hidden",
  transition: "all 0.25s",
  cursor: "default",
};

export default function AdminDashboard({
  clients, openClient, handlePaymentUpload, handlePaymentUploadWithPreview,
  deleteClient, updateClient,
}: AdminDashboardProps) {
  const [editingClient, setEditingClient] = useState<any>(null);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [filterAttention, setFilterAttention] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewRows, setPreviewRows] = useState<any[] | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [menuClient, setMenuClient] = useState<any | null>(null);
  const [periodIdx, setPeriodIdx] = useState<number | null>(null);
  const [settlementOpen, setSettlementOpen] = useState(false);

  // Sort by funded_date oldest → newest
  const sortedClients = [...clients].sort((a, b) => {
    if (!a.funded_date) return 1;
    if (!b.funded_date) return -1;
    const dateDiff = new Date(a.funded_date).getTime() - new Date(b.funded_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    // Same date — sort by invoice number ascending (INV105007 → INV107083)
    const aNum = parseInt((a.invoice || "").replace(/\D/g, "")) || 0;
    const bNum = parseInt((b.invoice || "").replace(/\D/g, "")) || 0;
    return aNum - bNum;
  });

  const totalBalance = clients.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  const attentionClients = clients.filter(c => c.status !== "Good Standing");
  const goodClients = clients.filter(c => c.status === "Good Standing");
  const dailyClients = clients.filter(c => c.payment_frequency === "daily").length;
  const weeklyClients = clients.filter(c => c.payment_frequency === "weekly").length;

  // Build date-range periods from actual funded dates
  function getPeriodLabel(d: string): string {
    if (!d) return "Unknown";
    const dt = new Date(d + "T00:00:00");
    const y = dt.getFullYear();
    const m = dt.toLocaleString("en-US", { month: "long" });
    const day = dt.getDate();
    return day <= 15 ? `${m} ${y} · 1st half` : `${m} ${y} · 2nd half`;
  }

  // Get unique ordered periods from sorted clients
  const allPeriods = Array.from(
    new Set(sortedClients.map(c => getPeriodLabel(c.funded_date)))
  );
  const resolvedIdx = periodIdx === null ? allPeriods.length - 1 : Math.min(Math.max(0, periodIdx), allPeriods.length - 1);

  const baseClients = filterAttention ? attentionClients : sortedClients;

  const displayedClients = searchQuery.trim()
    ? baseClients.filter(c => {
        const q = searchQuery.toLowerCase();
        return (
          c.business_name?.toLowerCase().includes(q) ||
          c.invoice?.toLowerCase().includes(q) ||
          c.owner_name?.toLowerCase().includes(q)
        );
      })
    : allPeriods.length > 0
    ? baseClients.filter(c => getPeriodLabel(c.funded_date) === allPeriods[resolvedIdx])
    : baseClients;

  const currentPeriod = allPeriods[resolvedIdx] || "";

  // Pre-upload preview handler
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewFile(file);

    const text = await file.text();
    // Parse preview rows (simplified — real parse happens in page.tsx)
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
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function handleConfirmUpload() {
    if (!previewFile) return;
    // Create synthetic event to pass to original handler
    const dt = new DataTransfer();
    dt.items.add(previewFile);
    const syntheticEvent = { target: { files: dt.files } } as any;
    handlePaymentUpload(syntheticEvent);
    setPreviewRows(null);
    setPreviewFile(null);
  }

  return (
    <div style={{ minHeight: "calc(100vh - 0px)", background: "var(--parchment)", fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ padding: "38px 32px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 600, color: "var(--ink-1)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Good morning, <em style={{ fontStyle: "italic", color: "var(--gold)" }}>Fellipe.</em>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, letterSpacing: "0.01em" }}>
              {clients.length} active {clients.length === 1 ? "client" : "clients"} &nbsp;·&nbsp; {money(totalBalance)} open balance
            </div>
          </div>

          {/* Upload trigger */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--ink-1)", color: "var(--gold-bright)", border: "1px solid rgba(196,154,90,0.35)", padding: "12px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 12px rgba(30,16,4,0.12)", transition: "all 0.2s" }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v8M3 4L6.5 1 10 4M1.5 10.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Upload daily payments
            <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
        </div>

        {/* ── Pre-upload preview modal ── */}
        {previewRows !== null && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(28,20,12,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 680, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(28,20,12,0.3)", position: "relative" }}>
              {/* Gold rule */}
              <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />

              <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: "var(--ink-1)", marginBottom: 4 }}>
                  Review before processing
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  {previewRows.length} payment{previewRows.length !== 1 ? "s" : ""} found in {previewFile?.name} &nbsp;·&nbsp; {previewRows.filter(r => r.matched).length} matched to clients
                </div>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--parchment-2)", position: "sticky", top: 0, zIndex: 2 }}>
                      {["Client", "Invoice", "Date", "Amount", "Match"].map(h => (
                        <th key={h} style={{ padding: "10px 22px", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{row.clientName}</td>
                        <td style={{ padding: "13px 22px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{row.invoice}</td>
                        <td style={{ padding: "13px 22px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{row.date}</td>
                        <td style={{ padding: "13px 22px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{money(row.amount)}</td>
                        <td style={{ padding: "13px 22px" }}>
                          {row.matched ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", color: "var(--sage)", fontSize: 10, fontWeight: 500 }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--sage)", display: "inline-block" }} /> Matched
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", color: "var(--sienna)", fontSize: 10, fontWeight: 500 }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--sienna)", display: "inline-block" }} /> No match
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {previewRows.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: "32px", textAlign: "center", fontSize: 13, color: "var(--ink-4)" }}>
                          No payment rows found in this file. Check the format and try again.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "20px 28px", borderTop: "1px solid var(--border)", display: "flex", gap: 12 }}>
                <button
                  onClick={handleConfirmUpload}
                  disabled={previewRows.filter(r => r.matched).length === 0}
                  style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.25)", padding: "11px 22px", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: previewRows.filter(r => r.matched).length === 0 ? 0.4 : 1 }}>
                  Process {previewRows.filter(r => r.matched).length} matched payment{previewRows.filter(r => r.matched).length !== 1 ? "s" : ""}
                </button>
                <button
                  onClick={() => { setPreviewRows(null); setPreviewFile(null); }}
                  style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "11px 22px", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total clients", value: clients.length.toString(), sub: `${dailyClients} daily · ${weeklyClients} weekly`, color: "var(--ink-1)" },
            { label: "Open balance", value: money(totalBalance), sub: "Across all clients", color: "var(--ink-2)", mono: true },
            { label: "Needs attention", value: String(attentionClients.length), sub: attentionClients.length > 0 ? "Review now →" : "All accounts current", color: attentionClients.length > 0 ? "var(--sienna)" : "var(--sage)", clickable: true, onClick: () => { setFilterAttention(v => !v); setSearchQuery(""); } },
            { label: "Good standing", value: String(goodClients.length), sub: clients.length > 0 ? `${Math.round((goodClients.length / clients.length) * 100)}% of portfolio` : "—", color: "var(--sage)" },
          ].map((card, i) => (
            <div key={i}
              onClick={card.onClick}
              style={{ ...cardStyle, cursor: card.clickable ? "pointer" : "default" }}>
              <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>{card.label}</div>
              <div style={{ fontFamily: card.mono ? "'DM Mono', monospace" : "'Cormorant Garamond', serif", fontSize: card.mono ? 22 : 42, fontWeight: card.mono ? 400 : 400, color: card.color, letterSpacing: card.mono ? "-0.02em" : "-0.03em", lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Attention panel ── */}
        {filterAttention && attentionClients.length > 0 && (
          <div style={{ background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", borderRadius: 16, padding: 22, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--sienna)" }}>{attentionClients.length} {attentionClients.length === 1 ? "account needs" : "accounts need"} attention</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>Missed payments or returned transactions on record.</div>
              </div>
              <button onClick={() => setFilterAttention(false)} style={{ fontSize: 11, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer" }}>Show all →</button>
            </div>
            {attentionClients.map(client => (
              <div key={client.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", marginBottom: 8, display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }} onClick={() => openClient(client)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)" }}>{client.business_name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{client.invoice} · {money(Number(client.payment))} per payment</div>
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "var(--ink-2)", fontWeight: 500 }}>{money(Number(client.balance || 0))}</div>
                <StandingBadge status={client.status} />
                <div style={{ fontSize: 11, color: "var(--ink-4)" }}>View →</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Monthly default risk panel (full interactive component) ── */}
        {/* ── Morning Dashboard ── */}
        {/* ── Floating Settlement Picture Button + Drawer ── */}
        <div style={{ position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 100 }}>
          <button
            onClick={() => setSettlementOpen(v => !v)}
            style={{
              writingMode: "vertical-rl", textOrientation: "mixed",
              background: "var(--ink-1)", color: "var(--gold-muted)",
              border: "none", borderRadius: "8px 0 0 8px",
              padding: "16px 10px", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "0.06em", textTransform: "uppercase",
              boxShadow: "-2px 0 12px rgba(30,16,4,0.15)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
            {settlementOpen ? "✕" : "📊"} Settlement
          </button>
        </div>
        {settlementOpen && (
          <div style={{
            position: "fixed", right: 0, top: 0, bottom: 0, width: 420, zIndex: 99,
            background: "var(--surface)", borderLeft: "1px solid var(--border)",
            boxShadow: "-8px 0 32px rgba(30,16,4,0.12)", overflowY: "auto",
            padding: "20px 0",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 16px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Today&apos;s settlement picture</p>
              <button onClick={() => setSettlementOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--ink-4)" }}>✕</button>
            </div>
            <div style={{ padding: "0 20px" }}>
              <MorningDashboard clients={clients} />
            </div>
          </div>
        )}
        <ACHOperationsCenter clients={clients} />

        <MonthlyRiskPanel clients={clients} />

        {/* ── Client roster ── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(30,16,4,0.06)", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)", zIndex: 1 }} />

          <div style={{ padding: "20px 26px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, color: "var(--ink-1)" }}>
                Client Roster{" "}
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
                  · {displayedClients.length} {filterAttention ? "needs attention" : "clients"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                Sorted by funded date &nbsp;·&nbsp; oldest first
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {filterAttention && (
                <button onClick={() => setFilterAttention(false)} style={{ fontSize: 11, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer" }}>Show all →</button>
              )}
              <div style={{ position: "relative" }}>
                <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="5.5" cy="5.5" r="4" stroke="var(--ink-5)" strokeWidth="1.3"/>
                  <path d="M9 9l2 2" stroke="var(--ink-5)" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search name or invoice…"
                  style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 12, borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", color: "var(--ink-2)", outline: "none", width: 220, fontFamily: "'DM Sans', sans-serif" }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Period navigation - shown between header and table, hidden when searching */}
          {!searchQuery.trim() && allPeriods.length > 1 && (
            <div style={{ padding: "10px 26px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--parchment-2)" }}>
              <button
                onClick={() => setPeriodIdx(resolvedIdx > 0 ? resolvedIdx - 1 : 0)}
                disabled={resolvedIdx === 0}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: resolvedIdx === 0 ? "var(--ink-5)" : "var(--ink-3)", cursor: resolvedIdx === 0 ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ←
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", minWidth: 200, textAlign: "center" }}>
                {currentPeriod} <span style={{ fontWeight: 400, color: "var(--ink-4)" }}>({displayedClients.length})</span>
              </span>
              <button
                onClick={() => setPeriodIdx(resolvedIdx < allPeriods.length - 1 ? resolvedIdx + 1 : resolvedIdx)}
                disabled={resolvedIdx >= allPeriods.length - 1}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: resolvedIdx >= allPeriods.length - 1 ? "var(--ink-5)" : "var(--ink-3)", cursor: resolvedIdx >= allPeriods.length - 1 ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                →
              </button>
              <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
                {resolvedIdx + 1} of {allPeriods.length}
              </span>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--parchment-2)" }}>
                {["Business", "Invoice", "Funded ↑", "Balance", "Schedule", "Standing", ""].map(h => (
                  <th key={h} style={{ padding: "12px 26px", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedClients.map(client => {
                const sched = client.payment_frequency === "weekly"
                  ? `Weekly${client.payment_day ? ` · ${client.payment_day.charAt(0).toUpperCase() + client.payment_day.slice(1)}` : ""}`
                  : "Daily";

                // Calculate weeks behind based on returned payments only
                const totalReturns = Number(client.total_returns || 0);
                const weeksBehind = client.payment_frequency === "weekly"
                  ? totalReturns
                  : Math.floor(totalReturns / 5);
                const isBehind1Week = weeksBehind === 1;
                const isBehind2PlusWeeks = weeksBehind >= 2;
                return (
                  <React.Fragment key={client.id}>
                  <tr
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                    onClick={() => { setMenuClient(null); openClient(client); }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "17px 26px" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>{client.business_name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{client.owner_name}</div>
                    </td>
                    <td style={{ padding: "17px 26px" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{client.invoice}</span>
                    </td>
                    <td style={{ padding: "17px 26px" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{formatDate(client.funded_date)}</span>
                    </td>
                    <td style={{ padding: "17px 26px" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{money(Number(client.balance || 0))}</span>
                    </td>
                    <td style={{ padding: "17px 26px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{sched}</span>
                        {isBehind2PlusWeeks && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#b83220", background: "rgba(190,60,40,0.1)", border: "1px solid rgba(190,60,40,0.25)", borderRadius: 99, padding: "1px 7px", fontFamily: "'DM Sans', sans-serif" }}>
                            {weeksBehind}w behind
                          </span>
                        )}
                        {isBehind1Week && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#a07010", background: "rgba(196,140,40,0.1)", border: "1px solid rgba(196,140,40,0.25)", borderRadius: 99, padding: "1px 7px", fontFamily: "'DM Sans', sans-serif" }}>
                            1w behind
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "17px 26px" }}>
                      <StandingBadge status={client.status} />
                    </td>
                    <td style={{ padding: "17px 26px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <div
                          style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-mid)", background: menuClient?.id === client.id ? "var(--gold-surface)" : "transparent", color: menuClient?.id === client.id ? "var(--gold)" : "var(--ink-4)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, fontWeight: 700, letterSpacing: "0.05em", transition: "all 0.15s" }}
                          onClick={e => { e.stopPropagation(); setMenuClient(menuClient?.id === client.id ? null : client); }}>
                          ···
                        </div>
                        {menuClient?.id === client.id && (
                          <div style={{ position: "absolute", right: 0, top: 36, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(30,16,4,0.14)", minWidth: 140, overflow: "hidden" }}>
                            <button
                              onClick={e => { e.stopPropagation(); setEditingClient({ ...client }); setEditingClientId(client.id); setMenuClient(null); }}
                              style={{ width: "100%", textAlign: "left", padding: "11px 16px", fontSize: 13, color: "var(--ink-2)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
                              ✏️ Edit client
                            </button>
                            <div style={{ height: 1, background: "var(--border)", margin: "0 12px" }} />
                            <button
                              onClick={e => { e.stopPropagation(); setMenuClient(null); deleteClient(client); }}
                              style={{ width: "100%", textAlign: "left", padding: "11px 16px", fontSize: 13, color: "#C83C1E", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
                              🗑️ Delete client
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingClientId === client.id && editingClient && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, background: "var(--parchment-2)" }}>
                        <div style={{ padding: "20px 26px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: "var(--ink-1)" }}>
                              Editing — {editingClient.business_name}
                            </div>
                            <button onClick={() => { setEditingClient(null); setEditingClientId(null); }} style={{ fontSize: 11, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                            {EDIT_FIELDS.map(([field, label, type]) => (
                              <div key={field}>
                                <label style={{ display: "block", fontSize: 10, color: "var(--ink-4)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</label>
                                {type === "select" ? (
                                  <select
                                    style={{ width: "100%", borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                                    value={editingClient[field] || ""}
                                    onChange={e => setEditingClient({ ...editingClient, [field]: e.target.value })}>
                                    <option value="Good Standing">Good Standing</option>
                                    <option value="Needs Attention">Needs Attention</option>
                                    <option value="Paused">Paused</option>
                                    <option value="Blocked">Blocked</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Default">Default</option>
                                  </select>
                                ) : (
                                  <input
                                    type={type || "text"}
                                    style={{ width: "100%", borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: type === "number" ? "'DM Mono', monospace" : "'DM Sans', sans-serif", boxSizing: "border-box" }}
                                    value={editingClient[field] || ""}
                                    onChange={e => setEditingClient({ ...editingClient, [field]: e.target.value })}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                            <button
                              onClick={() => { updateClient(editingClient); setEditingClient(null); setEditingClientId(null); }}
                              style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                              Save changes
                            </button>
                            <button
                              onClick={() => { setEditingClient(null); setEditingClientId(null); }}
                              style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                              Cancel
                            </button>
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
                  <td colSpan={7} style={{ padding: "48px", textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
                    {searchQuery ? `No clients matching "${searchQuery}"` : "No clients yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, textAlign: "center", fontSize: 11, color: "var(--ink-5)", lineHeight: 1.6 }}>
          This portal is a personal organizational tool operated independently by Fellipe Busato.<br />
          It is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity.
        </div>

      </div>
    </div>
  );
}
