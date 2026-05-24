"use client";

import { useRef, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocFile {
  id: string;
  name: string;
  base64: string;
  mediaType: string;
  docType: string;
  size: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_ABBREVS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function detectDocType(name: string): string {
  const n = name.toLowerCase();
  const hasMonth = MONTH_ABBREVS.some(m => n.includes(m));
  if (hasMonth || n.includes("statement") || n.includes("bank")) return "Bank Statement";
  if (n.includes("decision") || n.includes("dl")) return "DecisionLogic";
  if (n.includes("credit") || n.includes("experian") || n.includes("owner") || n.includes("profile")) return "Credit Report";
  if (n.includes("application") || n.includes("signed") || n.includes(" app") || n.includes("clarify")) return "Application";
  return "Other";
}

function docTypeStyle(type: string): { color: string; bg: string } {
  switch (type) {
    case "Bank Statement": return { color: "#3B82F6", bg: "rgba(59,130,246,0.15)" };
    case "DecisionLogic":  return { color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" };
    case "Credit Report":  return { color: "#F59E0B", bg: "rgba(245,158,11,0.15)" };
    case "Application":    return { color: "#10B981", bg: "rgba(16,185,129,0.15)" };
    default:               return { color: "#6B7280", bg: "rgba(107,114,128,0.15)" };
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString();
}

function renderAgentMessage(content: string): React.ReactNode {
  return content.split("\n").map((line, i) => {
    if (line.trim() === "---") {
      return <hr key={i} style={{ border: "none", borderTop: "1px solid rgba(200,146,42,0.2)", margin: "8px 0" }} />;
    }
    const isBullet = line.trim().startsWith("•") || line.trim().startsWith("-");
    const processed = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^[\s]*[•\-]\s*/, "");
    return (
      <div key={i} style={{ display: "flex", gap: isBullet ? 6 : 0, marginBottom: line.trim() === "" ? 6 : 2 }}>
        {isBullet && <span style={{ color: "#C8922A", flexShrink: 0, marginTop: 1 }}>•</span>}
        <span dangerouslySetInnerHTML={{ __html: processed || "&nbsp;" }} />
      </div>
    );
  });
}

// ── ReportPanel ───────────────────────────────────────────────────────────────

type VerdictConfig = Record<string, { bg: string; border: string; color: string; label: string }>;

function ReportPanel({ report, verdictConfig }: { report: any; verdictConfig: VerdictConfig }) {
  const vc = verdictConfig[report.verdict] || verdictConfig.DECLINE;
  return (
    <div>
      {/* Verdict banner */}
      <div style={{ background: vc.bg, borderLeft: `4px solid ${vc.border}`, padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: vc.color }}>{vc.label}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{report.totalScore} / {report.maxScore}</span>
      </div>

      <div style={{ padding: "14px" }}>

        {report.dealName && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E8D5A3", marginBottom: 14 }}>{report.dealName}</div>
        )}

        {/* Score breakdown */}
        {report.categoryScores?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,213,163,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Score Breakdown</div>
            {report.categoryScores.map((cat: any, i: number) => {
              const pct = cat.max > 0 ? cat.score / cat.max : 0;
              const barColor = pct >= 0.7 ? "#10B981" : pct >= 0.4 ? "#F59E0B" : "#EF4444";
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "#fff" }}>{cat.name}</span>
                    <span style={{ fontSize: 10, color: "rgba(232,213,163,0.45)" }}>{cat.score}/{cat.max}</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pct * 100, 100)}%`, background: barColor, borderRadius: 3 }} />
                  </div>
                  {cat.notes && <div style={{ fontSize: 9, color: "rgba(232,213,163,0.38)", marginTop: 2, lineHeight: 1.4 }}>{cat.notes}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* True Revenue Analysis */}
        {report.trueMonthlyRevenue?.length > 0 && (
          <div style={{ marginBottom: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.12)", borderRadius: 8, padding: "11px 12px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>True Revenue Analysis</div>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Month", "Gross", "Adjusted", "Diff"].map(h => (
                    <th key={h} style={{ textAlign: "left" as const, padding: "3px 4px", color: "rgba(232,213,163,0.4)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.trueMonthlyRevenue.map((r: any, i: number) => {
                  const diff = r.adjusted - r.gross;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "5px 4px", color: "#E8D5A3" }}>{r.month}</td>
                      <td style={{ padding: "5px 4px", color: "#E8D5A3" }}>{fmtMoney(r.gross)}</td>
                      <td style={{ padding: "5px 4px", color: "#10B981" }}>{fmtMoney(r.adjusted)}</td>
                      <td style={{ padding: "5px 4px", color: diff >= 0 ? "#10B981" : "#EF4444" }}>{diff >= 0 ? "+" : ""}{fmtMoney(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {report.trueMonthlyRevenue.some((r: any) => r.excluded?.length > 0) && (
              <div style={{ marginTop: 6, fontSize: 9, color: "rgba(232,213,163,0.32)", lineHeight: 1.5 }}>
                {report.trueMonthlyRevenue.map((r: any, i: number) =>
                  r.excluded?.length > 0 ? <div key={i}>{r.month}: excluded {r.excluded.join(", ")}</div> : null
                )}
              </div>
            )}
          </div>
        )}

        {/* Risk Flags */}
        {(report.greenFlags?.length > 0 || report.yellowFlags?.length > 0 || report.redFlags?.length > 0) && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,213,163,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Risk Flags</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#10B981", marginBottom: 5 }}>✅ Green</div>
                {report.greenFlags?.map((f: string, i: number) => <div key={i} style={{ fontSize: 9, color: "rgba(16,185,129,0.8)", marginBottom: 3, lineHeight: 1.4 }}>• {f}</div>)}
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", marginBottom: 5 }}>⚠️ Yellow</div>
                {report.yellowFlags?.map((f: string, i: number) => <div key={i} style={{ fontSize: 9, color: "rgba(245,158,11,0.8)", marginBottom: 3, lineHeight: 1.4 }}>• {f}</div>)}
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#EF4444", marginBottom: 5 }}>🚨 Red</div>
                {report.redFlags?.map((f: string, i: number) => <div key={i} style={{ fontSize: 9, color: "rgba(239,68,68,0.8)", marginBottom: 3, lineHeight: 1.4 }}>• {f}</div>)}
              </div>
            </div>
          </div>
        )}

        {/* Existing Obligations */}
        {report.existingObligations?.length > 0 && (
          <div style={{ marginBottom: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.12)", borderRadius: 8, padding: "11px 12px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Existing Obligations</div>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Lender", "Weekly", "Monthly", "Notes"].map(h => (
                    <th key={h} style={{ textAlign: "left" as const, padding: "3px 4px", color: "rgba(232,213,163,0.4)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.existingObligations.map((o: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "5px 4px", color: "#E8D5A3" }}>{o.lender}</td>
                    <td style={{ padding: "5px 4px", color: "#EF4444" }}>{fmtMoney(o.weeklyPayment)}</td>
                    <td style={{ padding: "5px 4px", color: "#EF4444" }}>{fmtMoney(o.monthlyBurden)}</td>
                    <td style={{ padding: "5px 4px", color: "rgba(232,213,163,0.45)", fontSize: 9 }}>{o.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* OnDeck Timeline */}
        {report.ondeckTimeline?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,213,163,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>OnDeck Timeline</div>
            {report.ondeckTimeline.map((ev: any, i: number) => {
              const evLower = (ev.event || "").toLowerCase();
              const isReturn = evLower.includes("return");
              const isCredit = ev.amount > 0 && (evLower.includes("fund") || evLower.includes("credit") || evLower.includes("advance"));
              const dotColor = isReturn ? "#F97316" : isCredit ? "#10B981" : "#EF4444";
              return (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, marginTop: 2 }} />
                    {i < report.ondeckTimeline.length - 1 && <div style={{ width: 1, height: 22, background: "rgba(200,146,42,0.2)", marginTop: 2 }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "rgba(232,213,163,0.38)" }}>{ev.date}</div>
                    <div style={{ fontSize: 10, color: "#E8D5A3", lineHeight: 1.4 }}>{ev.event}</div>
                    {ev.amount > 0 && <div style={{ fontSize: 9, color: dotColor, marginTop: 1 }}>{fmtMoney(ev.amount)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Zelle Payroll Map */}
        {report.zellePayroll?.length > 0 && (
          <div style={{ marginBottom: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.12)", borderRadius: 8, padding: "11px 12px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Zelle Payroll Map</div>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Recipient", "Frequency", "Avg Amount"].map(h => (
                    <th key={h} style={{ textAlign: "left" as const, padding: "3px 4px", color: "rgba(232,213,163,0.4)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.zellePayroll.map((z: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "5px 4px", color: "#E8D5A3" }}>{z.recipient}</td>
                    <td style={{ padding: "5px 4px", color: "rgba(232,213,163,0.55)" }}>{z.frequency}</td>
                    <td style={{ padding: "5px 4px", color: "#E8D5A3" }}>{fmtMoney(z.avgAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Verdict Rationale */}
        {report.verdictRationale && (
          <div style={{ marginBottom: 16, background: "rgba(200,146,42,0.06)", borderLeft: "3px solid #C8922A", borderRadius: "0 8px 8px 0", padding: "11px 13px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Verdict Rationale</div>
            <div style={{ fontSize: 11, color: "#E8D5A3", fontStyle: "italic", lineHeight: 1.7 }}>{report.verdictRationale}</div>
          </div>
        )}

        {/* Conditions */}
        {report.conditions?.length > 0 && (
          <div style={{ marginBottom: 12, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "11px 13px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Conditions</div>
            {report.conditions.map((c: string, i: number) => <div key={i} style={{ fontSize: 10, color: "rgba(245,158,11,0.85)", marginBottom: 4, lineHeight: 1.5 }}>• {c}</div>)}
          </div>
        )}

        {/* Revisit Triggers */}
        {report.revisitTriggers?.length > 0 && (
          <div style={{ marginBottom: 16, background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 8, padding: "11px 13px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#F97316", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Revisit Triggers</div>
            {report.revisitTriggers.map((t: string, i: number) => <div key={i} style={{ fontSize: 10, color: "rgba(249,115,22,0.85)", marginBottom: 4, lineHeight: 1.5 }}>• {t}</div>)}
          </div>
        )}

        {/* Export */}
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(report.dealName || "deal").replace(/\s+/g, "-")}-underwriting.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{ width: "100%", padding: "9px", borderRadius: 7, border: "1px solid rgba(200,146,42,0.3)", background: "rgba(200,146,42,0.08)", color: "#C8922A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          ↓ Export JSON
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Ready to underwrite. Drop the deal package in the left panel and hit Full Analysis — or ask me anything about the documents.",
};

export default function CICDashboard() {
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [dealName, setDealName] = useState("");
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [report, setReport] = useState<any>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [decision, setDecision] = useState<"funded" | "denied" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<"funded" | "denied" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type === "application/pdf");
    for (const file of arr) {
      const base64 = await toBase64(file);
      const docType = detectDocType(file.name);
      setDocuments(prev => [...prev, {
        id: Date.now() + Math.random() + "",
        name: file.name,
        base64,
        mediaType: "application/pdf",
        docType,
        size: file.size,
      }]);
    }
  }

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return;
    const userMsg: Message = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const allMessages = [...messages, userMsg];
      const res = await fetch("/api/cic/ai-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          documents: documents.map(d => ({ name: d.name, base64: d.base64, mediaType: d.mediaType })),
          dealContext: dealName,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply || "" }]);
        if (data.report && typeof data.report === "object") setReport(data.report);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setLoading(false);
  }

  function resetWorkspace() {
    setDocuments([]);
    setDealName("");
    setMessages([INITIAL_MESSAGE]);
    setReport(null);
    setInput("");
    setDecision(null);
    setDecisionNote("");
    setShowDecisionModal(false);
    setPendingDecision(null);
  }

  async function confirmDecision() {
    if (!pendingDecision || !report) return;
    setSaving(true);
    try {
      if (pendingDecision === "funded") {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("clients").insert({
          org_id: user?.id || "pending",
          business_name: report.dealName,
          invoice: `PENDING-${Date.now()}`,
          funded_date: new Date().toISOString().split("T")[0],
          funded: 0,
          payback: 0,
          paid: 0,
          balance: 0,
          payment: report.existingObligations?.find((o: any) => o.lender === "CFG")?.weeklyPayment || 0,
          payment_frequency: "weekly",
          payment_status: "active",
          status: "pending",
        });
        setToast("Deal added to CFG CRM — update invoice when ready");
      } else {
        await supabase.from("uw_denied").insert({
          deal_name: report.dealName,
          verdict: report.verdict,
          total_score: report.totalScore,
          red_flags: report.redFlags,
          report_json: report,
          notes: decisionNote || null,
          created_at: new Date().toISOString(),
        });
        setToast("Deal saved to denied library");
      }
      setDecision(pendingDecision);
      setShowDecisionModal(false);
      setDecisionNote("");
      setPendingDecision(null);
      setTimeout(resetWorkspace, 2000);
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    }
    setSaving(false);
  }

  // ── Verdict config ────────────────────────────────────────────────────────

  const verdictConfig: Record<string, { bg: string; border: string; color: string; label: string }> = {
    APPROVE:         { bg: "#0f3d20", border: "#10B981", color: "#10B981", label: "✓ APPROVED" },
    CONDITIONAL:     { bg: "#3d2a00", border: "#F59E0B", color: "#F59E0B", label: "⚠ CONDITIONAL" },
    DECLINE_REVISIT: { bg: "#3d1a00", border: "#F97316", color: "#F97316", label: "↻ DECLINE — REVISIT" },
    DECLINE:         { bg: "#3d0000", border: "#EF4444", color: "#EF4444", label: "✗ DECLINE" },
  };

  const panelBorder = "1px solid rgba(200,146,42,0.15)";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "calc(100vh - 62px)", background: "#0D1B2A", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>

      <style>{`
        @keyframes uwPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes uwDot { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }
      `}</style>

      {/* ══════════════════ LEFT PANEL — Documents ══════════════════ */}
      <div
        style={{
          width: "28%",
          borderRight: isDragging ? "2px dashed #C8922A" : panelBorder,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: isDragging ? "rgba(200,146,42,0.04)" : undefined,
          transition: "border 0.15s, background 0.15s",
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        {/* Header */}
        <div style={{ padding: "12px 14px", background: "#0a1520", borderBottom: panelBorder, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#C8922A", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Deal Documents</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #C8922A", background: "rgba(200,146,42,0.1)", color: "#C8922A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            + Upload PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            style={{ display: "none" }}
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {/* Deal name */}
        <div style={{ padding: "10px 14px", borderBottom: panelBorder, flexShrink: 0 }}>
          <input
            value={dealName}
            onChange={e => setDealName(e.target.value)}
            placeholder="Deal name (e.g. Long-Win Logistics LLC)"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#E8D5A3", outline: "none", boxSizing: "border-box" as const }}
          />
        </div>

        {/* Drop overlay */}
        {isDragging && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#C8922A", background: "rgba(13,27,42,0.9)", padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(200,146,42,0.4)" }}>
              Drop PDFs here
            </div>
          </div>
        )}

        {/* File list */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "8px 10px" }}>
          {documents.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "32px 16px", color: "rgba(232,213,163,0.3)" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 12 }}>Drop PDFs here or click Upload</div>
              <div style={{ fontSize: 10, marginTop: 6, lineHeight: 1.7 }}>Bank statements · DecisionLogic<br />Credit reports · Applications</div>
            </div>
          ) : documents.map(doc => {
            const { color, bg } = docTypeStyle(doc.docType);
            const truncName = doc.name.length > 28 ? doc.name.slice(0, 28) + "…" : doc.name;
            return (
              <div key={doc.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.1)", borderRadius: 7, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: bg, color, display: "inline-block", marginBottom: 4 }}>{doc.docType}</span>
                  <div style={{ fontSize: 12, color: "#fff", lineHeight: 1.3 }} title={doc.name}>{truncName}</div>
                  <div style={{ fontSize: 10, color: "rgba(232,213,163,0.35)", marginTop: 2 }}>{fmtBytes(doc.size)}</div>
                </div>
                <button
                  onClick={() => setDocuments(d => d.filter(x => x.id !== doc.id))}
                  style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 15, padding: "0 2px", flexShrink: 0, lineHeight: 1 }}>
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div style={{ padding: "8px 14px", borderTop: panelBorder, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "rgba(232,213,163,0.35)" }}>{documents.length} document{documents.length !== 1 ? "s" : ""}</span>
          {documents.length > 0 && (
            <button onClick={() => setDocuments([])} style={{ fontSize: 11, color: "#C8922A", background: "none", border: "none", cursor: "pointer" }}>Clear All</button>
          )}
        </div>
      </div>

      {/* ══════════════════ CENTER PANEL — Chat ══════════════════ */}
      <div style={{ width: "44%", borderRight: panelBorder, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", background: "#0a1520", borderBottom: panelBorder, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", animation: "uwPulse 2s infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#E8D5A3", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Underwriting Agent</span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m, i) => {
            const isLastAssistant = m.role === "assistant" && i === messages.length - 1;
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  {m.role === "user" ? (
                    <div style={{ maxWidth: "75%", background: "#C8922A", color: "#0D1B2A", borderRadius: "12px 12px 3px 12px", padding: "9px 14px", fontSize: 13, lineHeight: 1.55, fontWeight: 500 }}>
                      {m.content}
                    </div>
                  ) : (
                    <div style={{ maxWidth: "85%", background: "#1a2f45", border: "1px solid rgba(200,146,42,0.2)", borderRadius: "12px 12px 12px 3px", padding: "12px 16px", fontSize: 13, color: "#E8D5A3", lineHeight: 1.75 }}>
                      {renderAgentMessage(m.content)}
                    </div>
                  )}
                </div>

                {/* Decision buttons after last agent message when report is ready */}
                {isLastAssistant && report !== null && decision === null && !loading && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 2 }}>
                    <button
                      onClick={() => { setPendingDecision("funded"); setShowDecisionModal(true); }}
                      style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #10B981", background: "rgba(16,185,129,0.12)", color: "#10B981", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✓ Mark as Funded
                    </button>
                    <button
                      onClick={() => { setPendingDecision("denied"); setShowDecisionModal(true); }}
                      style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #EF4444", background: "rgba(239,68,68,0.12)", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✗ Mark as Denied
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ background: "#1a2f45", border: "1px solid rgba(200,146,42,0.2)", borderRadius: "12px 12px 12px 3px", padding: "13px 16px", display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8922A", animation: `uwDot 1.2s ${j * 0.15}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick chips */}
        <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexShrink: 0 }}>
          {["📊 Full Analysis", "🚩 Red Flags Only", "💵 Cash Flow"].map(chip => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              disabled={loading}
              style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(200,146,42,0.22)", background: "rgba(200,146,42,0.07)", color: "#E8D5A3", fontSize: 11, cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1 }}>
              {chip}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: "6px 14px 14px", display: "flex", gap: 8, flexShrink: 0 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask about this deal..."
            disabled={loading}
            rows={1}
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8D5A3", outline: "none", resize: "none" as const, fontFamily: "'DM Sans', sans-serif", minHeight: 40, maxHeight: 120, overflowY: "auto" as const }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: loading || !input.trim() ? "rgba(200,146,42,0.25)" : "#C8922A", color: "#0D1B2A", fontSize: 13, fontWeight: 700, cursor: loading || !input.trim() ? "default" : "pointer" }}>
            Send
          </button>
        </div>
      </div>

      {/* ══════════════════ RIGHT PANEL — Report ══════════════════ */}
      <div style={{ width: "28%", display: "flex", flexDirection: "column", overflowY: "auto" as const }}>

        {report === null ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", textAlign: "center" as const }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(200,146,42,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <div style={{ fontSize: 13, color: "rgba(232,213,163,0.3)", lineHeight: 1.7 }}>Run an analysis to see the<br />underwriting report</div>
          </div>
        ) : (
          <ReportPanel report={report} verdictConfig={verdictConfig} />
        )}
      </div>

      {/* ══════════════════ DECISION MODAL ══════════════════ */}
      {showDecisionModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1a2f45", border: "1px solid rgba(200,146,42,0.25)", borderRadius: 14, padding: "24px 28px", width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: pendingDecision === "funded" ? "#10B981" : "#EF4444", marginBottom: 16 }}>
              {pendingDecision === "funded" ? "Confirm Funding" : "Confirm Denial"}
            </div>
            <textarea
              value={decisionNote}
              onChange={e => setDecisionNote(e.target.value)}
              placeholder={pendingDecision === "funded"
                ? "Invoice number will be assigned later. Any notes?"
                : "Why denied? Override reason? (optional)"}
              rows={4}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8D5A3", outline: "none", resize: "vertical" as const, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" as const, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={confirmDecision}
                disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: pendingDecision === "funded" ? "#10B981" : "#EF4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Confirm"}
              </button>
              <button
                onClick={() => { setShowDecisionModal(false); setPendingDecision(null); setDecisionNote(""); }}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid rgba(200,146,42,0.2)", background: "transparent", color: "#E8D5A3", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TOAST ══════════════════ */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a2f45", border: "1px solid rgba(200,146,42,0.35)", borderRadius: 10, padding: "12px 20px", color: "#E8D5A3", fontSize: 13, fontWeight: 500, zIndex: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", whiteSpace: "nowrap" as const }}>
          {toast}
        </div>
      )}
    </div>
  );
}
