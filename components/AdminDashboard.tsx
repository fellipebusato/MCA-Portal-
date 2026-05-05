"use client";

import { useState } from "react";

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
  const isGood = status === "Good Standing";
  if (isGood) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 6, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", color: "var(--sage)", fontSize: 11, fontWeight: 500 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sage)", display: "inline-block", flexShrink: 0 }} />
        Good standing
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 6, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", color: "var(--sienna)", fontSize: 11, fontWeight: 500 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sienna)", display: "inline-block", flexShrink: 0 }} />
      Needs attention
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
  ["status", "Standing", "text"],
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
  const [filterAttention, setFilterAttention] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewRows, setPreviewRows] = useState<any[] | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  // Sort by funded_date oldest → newest
  const sortedClients = [...clients].sort((a, b) => {
    if (!a.funded_date) return 1;
    if (!b.funded_date) return -1;
    return new Date(a.funded_date).getTime() - new Date(b.funded_date).getTime();
  });

  const totalBalance = clients.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  const attentionClients = clients.filter(c => c.status !== "Good Standing");
  const goodClients = clients.filter(c => c.status === "Good Standing");
  const dailyClients = clients.filter(c => c.payment_frequency === "daily").length;
  const weeklyClients = clients.filter(c => c.payment_frequency === "weekly").length;

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
    : baseClients;

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

      {/* ── Navigation ── */}
      <nav style={navStyles}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginRight: 28 }}>
          <div style={{ width: 33, height: 33, borderRadius: 9, border: "1px solid var(--gold-border)", background: "rgba(160,120,64,0.12)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontWeight: 600, color: "var(--gold-bright)", letterSpacing: "0.05em" }}>FB</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.72)", letterSpacing: "-0.01em" }}>FB Client Portal</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Admin</span>
        </div>
        <span style={{ padding: "7px 14px", borderRadius: 7, background: "rgba(160,120,64,0.12)", color: "var(--gold-muted)", fontSize: 13, fontWeight: 500 }}>Dashboard</span>
      </nav>

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
            { label: "Needs attention", value: String(attentionClients.length), sub: attentionClients.length > 0 ? "Review now →" : "All accounts current", color: attentionClients.length > 0 ? "var(--sienna)" : "var(--sage)", clickable: true, onClick: () => { setFilterAttention(true); setSearchQuery(""); } },
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

        {/* ── Edit panel ── */}
        {editingClient && (
          <div style={{ ...cardStyle, marginBottom: 20, cursor: "default" }}>
            <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, color: "var(--ink-1)" }}>
                Editing — {editingClient.business_name}
              </div>
              <button onClick={() => setEditingClient(null)} style={{ fontSize: 11, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {EDIT_FIELDS.map(([field, label, type]) => (
                <div key={field}>
                  <label style={{ display: "block", fontSize: 10, color: "var(--ink-4)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</label>
                  <input
                    type={type}
                    style={{ width: "100%", borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                    value={editingClient[field] || ""}
                    onChange={e => setEditingClient({ ...editingClient, [field]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: "block", fontSize: 10, color: "var(--ink-4)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Frequency</label>
                <select
                  style={{ width: "100%", borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                  value={editingClient.payment_frequency || "daily"}
                  onChange={e => setEditingClient({ ...editingClient, payment_frequency: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              {editingClient.payment_frequency === "weekly" && (
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--ink-4)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Payment day</label>
                  <select
                    style={{ width: "100%", borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                    value={editingClient.payment_day || ""}
                    onChange={e => setEditingClient({ ...editingClient, payment_day: e.target.value })}>
                    <option value="">Select day</option>
                    {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button
                onClick={() => { updateClient(editingClient); setEditingClient(null); }}
                style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Save changes
              </button>
              <button
                onClick={() => setEditingClient(null)}
                style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

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

        {/* ── Monthly default risk panel ── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(30,16,4,0.06)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)" }}>Monthly Default Risk</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: "var(--ink-4)", background: "var(--parchment-2)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Internal only</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>
                3% minimum threshold &nbsp;·&nbsp; {goodClients.length} safe &nbsp;·&nbsp; {attentionClients.length} at risk
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px 40px" }}>
            {sortedClients.map(client => {
              const pct = client.payback > 0 ? Math.round(((client.payback - client.balance) / client.payback) * 100) : 0;
              const isAtRisk = client.status !== "Good Standing";
              return (
                <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", width: 140, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{client.business_name}</span>
                  <div style={{ flex: 1, height: 3, background: "var(--parchment-3)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: isAtRisk ? "var(--sienna)" : "var(--sage)", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: isAtRisk ? "var(--sienna)" : "var(--sage)", width: 30, textAlign: "right" as const }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

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
                return (
                  <tr key={client.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                    onClick={() => openClient(client)}
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
                      <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{sched}</span>
                    </td>
                    <td style={{ padding: "17px 26px" }}>
                      <StandingBadge status={client.status} />
                    </td>
                    <td style={{ padding: "17px 26px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      <div
                        style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: "var(--ink-5)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, fontWeight: 700, transition: "all 0.15s", letterSpacing: "0.05em" }}
                        onClick={e => { e.stopPropagation(); setEditingClient({ ...client }); }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--gold-surface)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--gold-border)"; (e.currentTarget as HTMLElement).style.color = "var(--gold)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-mid)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-5)"; }}>
                        ···
                      </div>
                    </td>
                  </tr>
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