"use client";

import { useRef, useState, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface DocFile {
  name: string;
  base64: string;
  mediaType: string;
  size: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CategoryScore {
  name: string;
  score: number;
  max: number;
  notes: string;
}

interface MonthRevenue {
  month: string;
  gross: number;
  adjusted: number;
  excluded: string[];
}

interface Obligation {
  lender: string;
  weeklyPayment: number;
  monthlyBurden: number;
  notes: string;
}

interface OndeckEvent {
  date: string;
  event: string;
  amount: number;
}

interface DepositSource {
  name: string;
  type: "true_revenue" | "loan_proceeds" | "transfer" | "flagged";
  monthlyAvg: number;
}

interface UWReport {
  dealName: string;
  verdict: "APPROVE" | "CONDITIONAL" | "DECLINE_REVISIT" | "DECLINE";
  totalScore: number;
  maxScore: number;
  categoryScores: CategoryScore[];
  greenFlags: string[];
  redFlags: string[];
  yellowFlags: string[];
  trueMonthlyRevenue: MonthRevenue[];
  existingObligations: Obligation[];
  ondeckTimeline: OndeckEvent[];
  depositSources: DepositSource[];
  verdictRationale: string;
  conditions: string[];
  revisitTriggers: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectDocType(name: string): { label: string; color: string; bg: string } {
  const n = name.toLowerCase();
  if (n.includes("statement") || n.includes("bank"))
    return { label: "Bank Statement", color: "#60A5FA", bg: "rgba(96,165,250,0.15)" };
  if (n.includes("decision") || n.includes("dl"))
    return { label: "DecisionLogic", color: "#A78BFA", bg: "rgba(167,139,250,0.15)" };
  if (n.includes("credit") || n.includes("experian") || n.includes("owner") || n.includes("profile"))
    return { label: "Credit Report", color: "#FB923C", bg: "rgba(251,146,60,0.15)" };
  if (n.includes("application") || n.includes("signed"))
    return { label: "Application", color: "#4ADE80", bg: "rgba(74,222,128,0.15)" };
  return { label: "Other", color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CICDashboard() {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [dealName, setDealName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<UWReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const newDocs: DocFile[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;
      const base64 = await fileToBase64(file);
      newDocs.push({ name: file.name, base64, mediaType: "application/pdf", size: file.size });
    }
    setDocs(d => [...d, ...newDocs]);
  }

  async function send(text?: string) {
    const content = (text || input).trim();
    if (!content) return;
    setInput("");
    const newMsg: Message = { role: "user", content };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);
    try {
      const res = await fetch("/api/cic/ai-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated,
          documents: docs.map(d => ({ name: d.name, base64: d.base64, mediaType: d.mediaType })),
          dealContext: dealName,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(m => [...m, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages(m => [...m, { role: "assistant", content: data.reply }]);
        if (data.report) setReport(data.report);
      }
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setLoading(false);
  }

  // ── Style constants ─────────────────────────────────────────────────────────

  const bg = "#0D1B2A";
  const headerBg = "#0a1520";
  const panelBorder = "1px solid rgba(200,146,42,0.15)";
  const textPrimary = "#E8D5A3";
  const textMuted = "rgba(232,213,163,0.45)";
  const gold = "#C8922A";

  const verdictConfig: Record<string, { bg: string; color: string; label: string }> = {
    APPROVE:        { bg: "#1a4a2e", color: "#4ADE80",  label: "✓ APPROVED" },
    CONDITIONAL:    { bg: "#4a3a0a", color: "#FCD34D",  label: "⚠ CONDITIONAL APPROVAL" },
    DECLINE_REVISIT:{ bg: "#4a2a0a", color: "#FB923C",  label: "↻ DECLINE — REVISIT" },
    DECLINE:        { bg: "#4a0a0a", color: "#F87171",  label: "✗ DECLINE" },
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 62px)", background: bg, overflow: "hidden" }}>

      {/* ── LEFT: Documents ─────────────────────────────────────────────────── */}
      <div style={{ width: "28%", display: "flex", flexDirection: "column", borderRight: panelBorder }}>

        <div style={{ padding: "14px 16px", background: headerBg, borderBottom: panelBorder, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Deal Documents</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${gold}`, background: "rgba(200,146,42,0.12)", color: gold, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            ＋ Upload PDF
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
        </div>

        <div style={{ padding: "10px 14px 6px", borderBottom: panelBorder, flexShrink: 0 }}>
          <input
            value={dealName}
            onChange={e => setDealName(e.target.value)}
            placeholder="e.g. Long-Win Logistics LLC"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: textPrimary, outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" as const }}
          />
          <div style={{ fontSize: 9, color: textMuted, marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>Deal Name</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" as const, padding: "8px 10px" }}>
          {docs.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "36px 16px", color: textMuted }}>
              <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.35 }}>📄</div>
              <div style={{ fontSize: 12 }}>Upload deal documents to begin</div>
              <div style={{ fontSize: 10, marginTop: 6, lineHeight: 1.6 }}>Bank statements, DecisionLogic,<br />credit reports, applications</div>
            </div>
          ) : docs.map((doc, i) => {
            const dt = detectDocType(doc.name);
            return (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.1)", borderRadius: 8, padding: "9px 11px", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: dt.bg, color: dt.color, display: "inline-block", marginBottom: 4 }}>{dt.label}</span>
                  <div style={{ fontSize: 11, color: textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }} title={doc.name}>{doc.name}</div>
                  <div style={{ fontSize: 9, color: textMuted, marginTop: 2 }}>{fmtBytes(doc.size)}</div>
                </div>
                <button onClick={() => setDocs(d => d.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "1px 2px", flexShrink: 0 }}>✕</button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "9px 14px", borderTop: panelBorder, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: textMuted }}>{docs.length} document{docs.length !== 1 ? "s" : ""}</span>
          {docs.length > 0 && (
            <button onClick={() => setDocs([])} style={{ fontSize: 11, color: gold, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear All</button>
          )}
        </div>
      </div>

      {/* ── CENTER: Chat ─────────────────────────────────────────────────────── */}
      <div style={{ width: "44%", display: "flex", flexDirection: "column", borderRight: panelBorder }}>

        <div style={{ padding: "14px 16px", background: headerBg, borderBottom: panelBorder, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", flexShrink: 0, animation: "uwPulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Underwriting Agent</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" as const, padding: "16px" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center" as const, padding: "48px 24px", color: textMuted }}>
              <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.4 }}>⚖️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 8 }}>MCA Underwriting Agent</div>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>Upload deal documents on the left, then ask me to run a full analysis. I'll score every risk dimension and produce a structured underwriting decision.</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
              {m.role === "user" ? (
                <div style={{ maxWidth: "74%", background: "rgba(200,146,42,0.18)", border: "1px solid rgba(200,146,42,0.28)", borderRadius: "12px 12px 3px 12px", padding: "10px 14px", fontSize: 13, color: textPrimary, lineHeight: 1.55 }}>
                  {m.content}
                </div>
              ) : (
                <div style={{ maxWidth: "86%", background: "#1a2f45", border: "1px solid rgba(96,165,250,0.13)", borderRadius: "12px 12px 12px 3px", padding: "12px 16px", fontSize: 13, color: textPrimary, lineHeight: 1.75, whiteSpace: "pre-wrap" as const }}>
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
              <div style={{ background: "#1a2f45", border: "1px solid rgba(96,165,250,0.13)", borderRadius: "12px 12px 12px 3px", padding: "13px 16px", display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: gold, animation: `uwBounce 1.2s ${j * 0.18}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" as const }}>
          {["📊 Full Analysis", "🚩 Red Flags Only", "💵 Cash Flow"].map(chip => (
            <button key={chip} onClick={() => send(chip)} disabled={loading}
              style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(200,146,42,0.22)", background: "rgba(200,146,42,0.07)", color: textPrimary, fontSize: 11, cursor: loading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.5 : 1 }}>
              {chip}
            </button>
          ))}
        </div>

        <div style={{ padding: "6px 14px 14px", flexShrink: 0, display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about this deal..."
            disabled={loading}
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: textPrimary, outline: "none", fontFamily: "'DM Sans', sans-serif" }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: loading || !input.trim() ? "rgba(200,146,42,0.25)" : gold, color: "#0D1B2A", fontSize: 13, fontWeight: 700, cursor: loading || !input.trim() ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s" }}>
            Send
          </button>
        </div>
      </div>

      {/* ── RIGHT: Report ────────────────────────────────────────────────────── */}
      <div style={{ width: "28%", display: "flex", flexDirection: "column" }}>

        <div style={{ padding: "14px 16px", background: headerBg, borderBottom: panelBorder, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Underwriting Report</span>
          {report && (
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${(report.dealName || "deal").replace(/\s+/g, "-")}-uw-report.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ padding: "4px 9px", borderRadius: 5, border: `1px solid ${gold}`, background: "rgba(200,146,42,0.1)", color: gold, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Export JSON
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto" as const }}>
          {!report ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", textAlign: "center" as const }}>
              <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.2 }}>📋</div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.7 }}>Run an analysis to see the underwriting report</div>
            </div>
          ) : (() => {
            const vc = verdictConfig[report.verdict] || verdictConfig.DECLINE;
            return (
              <div>
                {/* Verdict banner */}
                <div style={{ background: vc.bg, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: vc.color }}>{vc.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: vc.color }}>{report.totalScore} / {report.maxScore}</span>
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {report.dealName && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 14 }}>{report.dealName}</div>
                  )}

                  {/* Score bars */}
                  {report.categoryScores?.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Category Scores</div>
                      {report.categoryScores.map((cat, i) => {
                        const pct = cat.max > 0 ? cat.score / cat.max : 0;
                        const barColor = pct >= 0.7 ? "#4ADE80" : pct >= 0.4 ? "#FCD34D" : "#F87171";
                        return (
                          <div key={i} style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ fontSize: 10, color: textPrimary }}>{cat.name}</span>
                              <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>{cat.score}/{cat.max}</span>
                            </div>
                            <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(pct * 100, 100)}%`, background: barColor, borderRadius: 3 }} />
                            </div>
                            {cat.notes && <div style={{ fontSize: 9, color: textMuted, marginTop: 2, lineHeight: 1.4 }}>{cat.notes}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* True revenue table */}
                  {report.trueMonthlyRevenue?.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>True Monthly Revenue</div>
                      <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                            {["Month", "Gross", "Adjusted", "Diff"].map(h => (
                              <th key={h} style={{ textAlign: "left" as const, padding: "4px 5px", color: textMuted, fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.trueMonthlyRevenue.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                              <td style={{ padding: "5px 5px", color: textPrimary }}>{r.month}</td>
                              <td style={{ padding: "5px 5px", color: textPrimary }}>{fmtMoney(r.gross)}</td>
                              <td style={{ padding: "5px 5px", color: "#4ADE80" }}>{fmtMoney(r.adjusted)}</td>
                              <td style={{ padding: "5px 5px", color: "#F87171" }}>-{fmtMoney(r.gross - r.adjusted)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Flags */}
                  {(report.greenFlags?.length > 0 || report.yellowFlags?.length > 0 || report.redFlags?.length > 0) && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Risk Flags</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#4ADE80", marginBottom: 5 }}>🟢 Green</div>
                          {report.greenFlags?.map((f, i) => <div key={i} style={{ fontSize: 9, color: "rgba(74,222,128,0.8)", marginBottom: 3, lineHeight: 1.4 }}>• {f}</div>)}
                        </div>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#FCD34D", marginBottom: 5 }}>🟡 Yellow</div>
                          {report.yellowFlags?.map((f, i) => <div key={i} style={{ fontSize: 9, color: "rgba(252,211,77,0.8)", marginBottom: 3, lineHeight: 1.4 }}>• {f}</div>)}
                        </div>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#F87171", marginBottom: 5 }}>🔴 Red</div>
                          {report.redFlags?.map((f, i) => <div key={i} style={{ fontSize: 9, color: "rgba(248,113,113,0.8)", marginBottom: 3, lineHeight: 1.4 }}>• {f}</div>)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Existing obligations */}
                  {report.existingObligations?.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Existing Obligations</div>
                      <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                            {["Lender", "Weekly", "Monthly", "Notes"].map(h => (
                              <th key={h} style={{ textAlign: "left" as const, padding: "4px 5px", color: textMuted, fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.existingObligations.map((o, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                              <td style={{ padding: "5px 5px", color: textPrimary }}>{o.lender}</td>
                              <td style={{ padding: "5px 5px", color: "#F87171" }}>{fmtMoney(o.weeklyPayment)}</td>
                              <td style={{ padding: "5px 5px", color: "#F87171" }}>{fmtMoney(o.monthlyBurden)}</td>
                              <td style={{ padding: "5px 5px", color: textMuted, fontSize: 9 }}>{o.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* OnDeck timeline */}
                  {report.ondeckTimeline?.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>OnDeck Timeline</div>
                      {report.ondeckTimeline.map((ev, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: gold, marginTop: 2 }} />
                            {i < report.ondeckTimeline.length - 1 && (
                              <div style={{ width: 1, height: 22, background: "rgba(200,146,42,0.25)", marginTop: 2 }} />
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: textMuted }}>{ev.date}</div>
                            <div style={{ fontSize: 10, color: textPrimary, lineHeight: 1.4 }}>{ev.event}</div>
                            {ev.amount > 0 && <div style={{ fontSize: 9, color: gold, marginTop: 1 }}>{fmtMoney(ev.amount)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Verdict rationale */}
                  {report.verdictRationale && (
                    <div style={{ marginBottom: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.14)", borderRadius: 8, padding: "11px 13px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Verdict Rationale</div>
                      <div style={{ fontSize: 11, color: textPrimary, fontStyle: "italic", lineHeight: 1.7 }}>{report.verdictRationale}</div>
                    </div>
                  )}

                  {/* Conditions */}
                  {report.conditions?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#FCD34D", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Conditions</div>
                      {report.conditions.map((c, i) => (
                        <div key={i} style={{ fontSize: 10, color: "rgba(252,211,77,0.8)", marginBottom: 4, lineHeight: 1.5 }}>• {c}</div>
                      ))}
                    </div>
                  )}

                  {/* Revisit triggers */}
                  {report.revisitTriggers?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#FB923C", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Revisit Triggers</div>
                      {report.revisitTriggers.map((t, i) => (
                        <div key={i} style={{ fontSize: 10, color: "rgba(251,146,60,0.8)", marginBottom: 4, lineHeight: 1.5 }}>• {t}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <style>{`
        @keyframes uwPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes uwBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
