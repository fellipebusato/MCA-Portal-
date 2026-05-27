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

interface DealTerms {
  fundingAmount: string;
  payback: string;
  fees: string;
  paymentFrequency: "Daily" | "Weekly" | "";
  paymentAmount: string;
  termPayments: string;
  position: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_ABBREVS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function detectDocType(name: string): string {
  const n = name.toLowerCase();
  const hasMonth = MONTH_ABBREVS.some(m => n.includes(m));
  if (hasMonth || n.includes("statement") || n.includes("bank")) return "Bank Statement";
  if (n.includes("decision") || n.includes("dl") || n.includes("plaid")) return "DecisionLogic";
  if (n.includes("business-") || n.includes("premier") || n.includes("intelliscore")) return "Business Credit";
  if (n.includes("owner-") || n.includes("experian") || n.includes("credit") || n.includes("profile")) return "Credit Report";
  if (n.includes("application") || n.includes("signed") || n.includes(" app") || n.includes("opf")) return "Application";
  return "Other";
}

function docTypeStyle(type: string): { color: string; bg: string } {
  switch (type) {
    case "Bank Statement":   return { color: "#3B82F6", bg: "rgba(59,130,246,0.15)" };
    case "DecisionLogic":    return { color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" };
    case "Credit Report":    return { color: "#F59E0B", bg: "rgba(245,158,11,0.15)" };
    case "Business Credit":  return { color: "#EAB308", bg: "rgba(234,179,8,0.15)" };
    case "Application":      return { color: "#10B981", bg: "rgba(16,185,129,0.15)" };
    default:                 return { color: "#6B7280", bg: "rgba(107,114,128,0.15)" };
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

function num(s: string): number {
  const cleaned = (s || "").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
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
        {isBullet && <span style={{ color: "#C8922A", flexShrink: 0, marginTop: 1, fontFeatureSettings: "'zero' 0" }}>•</span>}
        <span style={{ fontFeatureSettings: "'zero' 0" }} dangerouslySetInnerHTML={{ __html: processed || "&nbsp;" }} />
      </div>
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Ready to underwrite. Drop the deal package in the left panel, fill in the deal terms, and hit Full Analysis — or ask me anything about the documents.",
};

const EMPTY_DEAL_TERMS: DealTerms = {
  fundingAmount: "",
  payback: "",
  fees: "",
  paymentFrequency: "",
  paymentAmount: "",
  termPayments: "",
  position: "",
};

export default function CICDashboard() {
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [dealName, setDealName] = useState("");
  const [dealTerms, setDealTerms] = useState<DealTerms>(EMPTY_DEAL_TERMS);
  const [uwContext, setUwContext] = useState("");
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

  // Auto-derived factor rate from funding + payback
  const factorRate = (() => {
    const f = num(dealTerms.fundingAmount);
    const p = num(dealTerms.payback);
    if (f > 0 && p > 0) return (p / f).toFixed(3);
    return "—";
  })();

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
    const newMessages = [...messages, userMsg];

    // Build structured deal terms payload (numbers where applicable)
    const dealTermsPayload = {
      fundingAmount: num(dealTerms.fundingAmount),
      payback: num(dealTerms.payback),
      fees: dealTerms.fees,
      paymentFrequency: dealTerms.paymentFrequency,
      paymentAmount: num(dealTerms.paymentAmount),
      termPayments: num(dealTerms.termPayments),
      position: dealTerms.position,
    };

    try {
      const res = await fetch('/api/cic/ai-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          // Send full base64 — never truncate (truncating corrupts the PDF)
          documents: documents.map(d => ({
            name: d.name,
            base64: d.base64,
            mediaType: d.mediaType,
          })),
          dealContext: dealName,
          dealTerms: dealTermsPayload,
          underwriterContext: uwContext,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + data.error }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '' }]);
        if (data.report && data.report.verdict) {
          setReport(data.report);
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error: ' + (e?.message || 'Please try again.') }]);
    }
    setLoading(false);
  }

  function resetWorkspace() {
    setDocuments([]);
    setDealName("");
    setDealTerms(EMPTY_DEAL_TERMS);
    setUwContext("");
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
          business_name: report.dealName || dealName,
          invoice: `PENDING-${Date.now()}`,
          funded_date: new Date().toISOString().split("T")[0],
          funded: num(dealTerms.fundingAmount),
          payback: num(dealTerms.payback),
          paid: 0,
          balance: num(dealTerms.payback),
          payment: num(dealTerms.paymentAmount),
          status: "active",
          underwriting_score: report.totalScore,
          underwriting_verdict: report.verdict,
          underwriting_note: decisionNote,
        });
        setToast(`✓ ${report.dealName || dealName} marked as funded`);
      } else {
        setToast(`✗ ${report.dealName || dealName} marked as denied`);
      }
      setDecision(pendingDecision);
      setShowDecisionModal(false);
      setDecisionNote("");
      setPendingDecision(null);
      setTimeout(resetWorkspace, 2000);
    } catch (e: any) {
      setToast(`Error: ${e?.message || "Save failed"}`);
    }
    setSaving(false);
  }

  // ── Verdict config ────────────────────────────────────────────────────────

  const verdictColor = (v: string) =>
    v === 'APPROVE' ? '#10B981' :
    v === 'CONDITIONAL' ? '#F59E0B' :
    v === 'DECLINE_REVISIT' ? '#F97316' : '#EF4444';

  const verdictLabel = (v: string) =>
    v === 'APPROVE' ? '✓ APPROVED' :
    v === 'CONDITIONAL' ? '⚠ CONDITIONAL' :
    v === 'DECLINE_REVISIT' ? '↻ DECLINE — REVISIT' : '✗ DECLINE';

  const verdictBg = (v: string) =>
    v === 'APPROVE' ? '#0f3d20' :
    v === 'CONDITIONAL' ? '#3d2a00' :
    v === 'DECLINE_REVISIT' ? '#3d1a00' : '#3d0000';

  const panelBorder = "1px solid rgba(200,146,42,0.15)";

  // Shared input style (DM Mono numerics with slashed-zero off)
  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(200,146,42,0.2)",
    borderRadius: 6,
    padding: "6px 9px",
    fontSize: 11,
    color: "#E8D5A3",
    outline: "none",
    boxSizing: "border-box",
    fontFeatureSettings: "'zero' 0",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 8,
    fontWeight: 700,
    color: "rgba(200,146,42,0.7)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 3,
    display: "block",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "calc(100vh - 62px)", background: "#0D1B2A", overflow: "hidden", fontFamily: "'DM Sans', sans-serif", fontFeatureSettings: "'zero' 0" }}>

      <style>{`
        @keyframes uwPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes uwDot { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }
        .cic-scroll::-webkit-scrollbar { width: 8px; }
        .cic-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .cic-scroll::-webkit-scrollbar-thumb { background: rgba(200,146,42,0.25); border-radius: 4px; }
        .cic-scroll::-webkit-scrollbar-thumb:hover { background: rgba(200,146,42,0.4); }
      `}</style>

      {/* ══════════════════ LEFT PANEL — Documents + Deal Inputs ══════════════════ */}
      <div
        style={{
          width: "22%",
          minWidth: 280,
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
        <div style={{ padding: "10px 12px", background: "#0a1520", borderBottom: panelBorder, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#C8922A", letterSpacing: "0.08em", textTransform: "uppercase" }}>Deal Package</span>
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

        {/* Scrollable input region */}
        <div className="cic-scroll" style={{ flex: 1, overflowY: "auto" }}>

          {/* Deal name */}
          <div style={{ padding: "10px 10px", borderBottom: panelBorder }}>
            <label style={labelStyle}>Deal Name</label>
            <input
              value={dealName}
              onChange={e => setDealName(e.target.value)}
              placeholder="e.g. 360 Boutique LLC"
              style={inputStyle}
            />
          </div>

          {/* Deal Terms — STRUCTURED */}
          <div style={{ padding: "10px 10px", borderBottom: panelBorder, background: "rgba(200,146,42,0.03)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Deal Terms — The Offer
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={labelStyle}>Funded $</label>
                <input
                  value={dealTerms.fundingAmount}
                  onChange={e => setDealTerms(d => ({ ...d, fundingAmount: e.target.value }))}
                  placeholder="7000"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Payback $</label>
                <input
                  value={dealTerms.payback}
                  onChange={e => setDealTerms(d => ({ ...d, payback: e.target.value }))}
                  placeholder="10703"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={labelStyle}>Fees</label>
                <input
                  value={dealTerms.fees}
                  onChange={e => setDealTerms(d => ({ ...d, fees: e.target.value }))}
                  placeholder="5% or $350"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Factor (auto)</label>
                <div style={{ ...inputStyle, background: "rgba(200,146,42,0.06)", color: factorRate === "—" ? "rgba(232,213,163,0.4)" : "#C8922A", fontWeight: 700 }}>
                  {factorRate}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={labelStyle}>Frequency</label>
                <select
                  value={dealTerms.paymentFrequency}
                  onChange={e => setDealTerms(d => ({ ...d, paymentFrequency: e.target.value as DealTerms["paymentFrequency"] }))}
                  style={{ ...inputStyle, appearance: "auto" }}
                >
                  <option value="">—</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Payment $</label>
                <input
                  value={dealTerms.paymentAmount}
                  onChange={e => setDealTerms(d => ({ ...d, paymentAmount: e.target.value }))}
                  placeholder="108"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={labelStyle}># Payments</label>
                <input
                  value={dealTerms.termPayments}
                  onChange={e => setDealTerms(d => ({ ...d, termPayments: e.target.value }))}
                  placeholder="99"
                  inputMode="numeric"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Position</label>
                <select
                  value={dealTerms.position}
                  onChange={e => setDealTerms(d => ({ ...d, position: e.target.value }))}
                  style={{ ...inputStyle, appearance: "auto" }}
                >
                  <option value="">—</option>
                  <option value="1st">1st</option>
                  <option value="2nd">2nd</option>
                  <option value="3rd">3rd</option>
                  <option value="4th+">4th+</option>
                </select>
              </div>
            </div>
          </div>

          {/* Underwriter Notes */}
          <div style={{ padding: "10px 10px", borderBottom: panelBorder }}>
            <label style={labelStyle}>Underwriter Notes</label>
            <textarea
              value={uwContext}
              onChange={e => setUwContext(e.target.value)}
              placeholder="What the docs can't show — client conversation, MTD pace, owner explanations, override rationale..."
              rows={4}
              style={{ ...inputStyle, fontSize: 11, resize: "vertical", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}
            />
          </div>

          {/* File list */}
          <div style={{ padding: "10px 10px" }}>
            <label style={labelStyle}>
              Documents ({documents.length})
            </label>
            {documents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 10px", color: "rgba(232,213,163,0.3)" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
                <div style={{ fontSize: 11 }}>Drop PDFs here or click Upload</div>
                <div style={{ fontSize: 9, marginTop: 4, lineHeight: 1.6 }}>
                  Bank statements · DecisionLogic<br />
                  Credit reports · Application
                </div>
              </div>
            ) : documents.map(doc => {
              const { color, bg } = docTypeStyle(doc.docType);
              const truncName = doc.name.length > 32 ? doc.name.slice(0, 32) + "…" : doc.name;
              return (
                <div key={doc.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,146,42,0.1)", borderRadius: 7, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: bg, color, display: "inline-block", marginBottom: 4 }}>{doc.docType}</span>
                    <div style={{ fontSize: 10, color: "#fff", lineHeight: 1.3, wordBreak: "break-word" }} title={doc.name}>{truncName}</div>
                    <div style={{ fontSize: 10, color: "rgba(232,213,163,0.35)", marginTop: 2, fontFeatureSettings: "'zero' 0" }}>{fmtBytes(doc.size)}</div>
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
        </div>

        {/* Drop overlay */}
        {isDragging && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#C8922A", background: "rgba(13,27,42,0.9)", padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(200,146,42,0.4)" }}>
              Drop PDFs here
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div style={{ padding: "8px 10px", borderTop: panelBorder, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#0a1520" }}>
          <span style={{ fontSize: 11, color: "rgba(232,213,163,0.45)" }}>
            {documents.length} doc{documents.length !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {documents.length > 0 && (
              <button onClick={() => setDocuments([])} style={{ fontSize: 10, color: "#C8922A", background: "none", border: "none", cursor: "pointer" }}>Clear Docs</button>
            )}
            <button onClick={resetWorkspace} style={{ fontSize: 10, color: "rgba(232,213,163,0.6)", background: "none", border: "1px solid rgba(232,213,163,0.2)", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>Reset All</button>
          </div>
        </div>
      </div>

      {/* ══════════════════ CENTER PANEL — Chat ══════════════════ */}
      <div style={{ width: "40%", borderRight: panelBorder, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", background: "#0a1520", borderBottom: panelBorder, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", animation: "uwPulse 2s infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#E8D5A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>Underwriting Agent</span>
        </div>

        {/* Messages */}
        <div className="cic-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
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

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start", flexDirection: "column", gap: 6 }}>
              <div style={{ background: "#1a2f45", border: "1px solid rgba(200,146,42,0.2)", borderRadius: "12px 12px 12px 3px", padding: "13px 16px", display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8922A", animation: `uwDot 1.2s ${j * 0.15}s ease-in-out infinite` }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: "rgba(232,213,163,0.35)", paddingLeft: 4 }}>
                Underwriting deal — large packages with multiple PDFs may take 60–120 seconds. Do not close this tab...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick chips */}
        <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
          {["📊 Full Analysis", "🚩 Red Flags Only", "💵 Cash Flow", "💳 Existing Stack"].map(chip => (
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
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8D5A3", outline: "none", resize: "none", fontFamily: "'DM Sans', sans-serif", minHeight: 40, maxHeight: 120, overflowY: "auto" }}
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
      <div className="cic-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {report === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(200,146,42,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <div style={{ color: '#4a6080', fontSize: 13 }}>Run an analysis to see the underwriting report</div>
          </div>
        ) : (
          <div style={{ padding: 16 }}>

            {/* VERDICT BANNER */}
            <div style={{
              padding: '12px 16px',
              marginBottom: 16,
              borderRadius: 8,
              borderLeft: `4px solid ${verdictColor(report.verdict)}`,
              background: verdictBg(report.verdict),
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: verdictColor(report.verdict) }}>
                {verdictLabel(report.verdict)}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'white', fontFeatureSettings: "'zero' 0" }}>
                {report.totalScore}
                <span style={{ fontSize: 13, color: '#8899aa' }}> / {report.maxScore || 100}</span>
              </div>
            </div>

            {/* OFFER ASSESSMENT */}
            {report.offerAssessment && (
              <div style={{ marginBottom: 16, padding: 11, background: "rgba(200,146,42,0.04)", border: "1px solid rgba(200,146,42,0.15)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Offer Assessment</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, fontFeatureSettings: "'zero' 0" }}>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Funding</div>
                  <div style={{ color: "#E8D5A3", textAlign: "right" }}>{fmtMoney(report.offerAssessment.fundingAmount)}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Payback</div>
                  <div style={{ color: "#E8D5A3", textAlign: "right" }}>{fmtMoney(report.offerAssessment.payback)}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Factor</div>
                  <div style={{ color: "#C8922A", textAlign: "right", fontWeight: 700 }}>{report.offerAssessment.factorRate?.toFixed?.(3) ?? report.offerAssessment.factorRate}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Daily Payment</div>
                  <div style={{ color: "#E8D5A3", textAlign: "right" }}>{fmtMoney(report.offerAssessment.dailyPayment)}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Term</div>
                  <div style={{ color: "#E8D5A3", textAlign: "right" }}>{report.offerAssessment.termDays} payments</div>
                  {report.offerAssessment.paymentVsAvgBalance && (
                    <>
                      <div style={{ color: "rgba(232,213,163,0.55)" }}>Pmt vs Avg Bal</div>
                      <div style={{ color: "#E8D5A3", textAlign: "right" }}>{report.offerAssessment.paymentVsAvgBalance}</div>
                    </>
                  )}
                </div>
                {report.offerAssessment.verdictOnOffer && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "#E8D5A3", lineHeight: 1.5, fontStyle: "italic", paddingTop: 8, borderTop: "1px solid rgba(200,146,42,0.15)" }}>
                    {report.offerAssessment.verdictOnOffer}
                  </div>
                )}
              </div>
            )}

            {/* COUNTER OFFER (if proposed) */}
            {report.counterOffer?.proposed && (
              <div style={{ marginBottom: 16, padding: 11, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>↻ Recommended Counter-Offer</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, fontFeatureSettings: "'zero' 0" }}>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Funding</div>
                  <div style={{ color: "#F59E0B", textAlign: "right", fontWeight: 700 }}>{fmtMoney(report.counterOffer.fundingAmount)}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Payback</div>
                  <div style={{ color: "#F59E0B", textAlign: "right", fontWeight: 700 }}>{fmtMoney(report.counterOffer.payback)}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Daily Payment</div>
                  <div style={{ color: "#F59E0B", textAlign: "right", fontWeight: 700 }}>{fmtMoney(report.counterOffer.dailyPayment)}</div>
                  <div style={{ color: "rgba(232,213,163,0.55)" }}>Term</div>
                  <div style={{ color: "#F59E0B", textAlign: "right", fontWeight: 700 }}>{report.counterOffer.termDays} payments</div>
                </div>
                {report.counterOffer.rationale && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "#F59E0B", lineHeight: 1.5, paddingTop: 8, borderTop: "1px solid rgba(245,158,11,0.2)" }}>
                    {report.counterOffer.rationale}
                  </div>
                )}
              </div>
            )}

            {/* DOCUMENT INVENTORY */}
            {report.documentInventory && (report.documentInventory.missing?.length > 0 || report.documentInventory.confidenceImpact) && (
              <div style={{ marginBottom: 16, padding: 11, background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Document Inventory</div>
                {report.documentInventory.missing?.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 9, color: "rgba(232,213,163,0.55)", marginBottom: 3 }}>Missing:</div>
                    {report.documentInventory.missing.map((m: string, i: number) => (
                      <div key={i} style={{ fontSize: 10, color: "#3B82F6", marginBottom: 2 }}>• {m}</div>
                    ))}
                  </div>
                )}
                {report.documentInventory.confidenceImpact && (
                  <div style={{ fontSize: 10, color: "#E8D5A3", fontStyle: "italic", lineHeight: 1.4 }}>
                    {report.documentInventory.confidenceImpact}
                  </div>
                )}
              </div>
            )}

            {/* SCORE BREAKDOWN */}
            {report.categoryScores?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#C8922A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Score Breakdown</div>
                {report.categoryScores.map((cat: any, i: number) => {
                  const pct = cat.max > 0 ? cat.score / cat.max : 0;
                  const barColor = pct > 0.7 ? '#10B981' : pct > 0.4 ? '#F59E0B' : '#EF4444';
                  return (
                    <div key={i} style={{ marginBottom: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: '#c8d8e8' }}>{cat.name}</span>
                        <span style={{ fontSize: 10, color: '#8899aa', fontFeatureSettings: "'zero' 0" }}>{cat.score}/{cat.max}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 5 }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                      {cat.notes && <div style={{ fontSize: 9, color: '#6a8a9a', marginTop: 2, lineHeight: 1.4 }}>{cat.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* TRUE REVENUE TABLE */}
            {report.trueMonthlyRevenue?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#C8922A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>True Revenue Analysis</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFeatureSettings: "'zero' 0" }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(200,146,42,0.2)' }}>
                      {['Month', 'Gross', 'Adjusted', 'Diff'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: '#8899aa', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.trueMonthlyRevenue.map((row: any, i: number) => {
                      const diff = (row.adjusted || 0) - (row.gross || 0);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '4px 6px', color: '#c8d8e8' }}>{row.month}</td>
                          <td style={{ padding: '4px 6px', color: '#c8d8e8' }}>{fmtMoney(row.gross)}</td>
                          <td style={{ padding: '4px 6px', color: '#10B981' }}>{fmtMoney(row.adjusted)}</td>
                          <td style={{ padding: '4px 6px', color: diff >= 0 ? '#10B981' : '#EF4444' }}>{diff >= 0 ? '+' : '-'}{fmtMoney(Math.abs(diff))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {report.trueMonthlyRevenue.some((r: any) => r.excluded?.length > 0) && (
                  <div style={{ marginTop: 6, fontSize: 9, color: 'rgba(232,213,163,0.5)', lineHeight: 1.5 }}>
                    {report.trueMonthlyRevenue.map((r: any, i: number) =>
                      r.excluded?.length > 0 ? <div key={i}>{r.month}: excluded {r.excluded.join(", ")}</div> : null
                    )}
                  </div>
                )}
              </div>
            )}

            {/* FLAGS */}
            {(report.greenFlags?.length > 0 || report.yellowFlags?.length > 0 || report.redFlags?.length > 0) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#C8922A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Risk Flags</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#10B981', marginBottom: 5 }}>✓ Green ({report.greenFlags?.length || 0})</div>
                    {report.greenFlags?.map((f: string, i: number) => (
                      <div key={i} style={{ fontSize: 9, color: 'rgba(16,185,129,0.85)', marginBottom: 4, lineHeight: 1.45 }}>• {f}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#F59E0B', marginBottom: 5 }}>⚠ Yellow ({report.yellowFlags?.length || 0})</div>
                    {report.yellowFlags?.map((f: string, i: number) => (
                      <div key={i} style={{ fontSize: 9, color: 'rgba(245,158,11,0.85)', marginBottom: 4, lineHeight: 1.45 }}>• {f}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#EF4444', marginBottom: 5 }}>✗ Red ({report.redFlags?.length || 0})</div>
                    {report.redFlags?.map((f: string, i: number) => (
                      <div key={i} style={{ fontSize: 9, color: 'rgba(239,68,68,0.85)', marginBottom: 4, lineHeight: 1.45 }}>• {f}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* EXISTING OBLIGATIONS */}
            {report.existingObligations?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#C8922A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Existing Obligations</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFeatureSettings: "'zero' 0" }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(200,146,42,0.2)' }}>
                      {['Lender', 'Weekly', 'Monthly', 'Notes'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: '#8899aa', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.existingObligations.map((o: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '4px 6px', color: '#c8d8e8' }}>{o.lender}</td>
                        <td style={{ padding: '4px 6px', color: '#EF4444' }}>{fmtMoney(o.weeklyPayment)}</td>
                        <td style={{ padding: '4px 6px', color: '#EF4444' }}>{fmtMoney(o.monthlyBurden)}</td>
                        <td style={{ padding: '4px 6px', color: 'rgba(232,213,163,0.55)', fontSize: 9 }}>{o.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* CREDIT PROFILE */}
            {report.creditProfile?.owners?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#C8922A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Credit Profile</div>
                {report.creditProfile.owners.map((o: any, i: number) => (
                  <div key={i} style={{ marginBottom: 6, padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 6, fontSize: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ color: "#E8D5A3", fontWeight: 600 }}>{o.name}</span>
                      <span style={{ color: o.score >= 680 ? "#10B981" : o.score >= 600 ? "#F59E0B" : "#EF4444", fontFeatureSettings: "'zero' 0", fontWeight: 700 }}>
                        {o.score} ({o.tier})
                      </span>
                    </div>
                    {o.notes && <div style={{ color: "rgba(232,213,163,0.55)", fontSize: 9, lineHeight: 1.4 }}>{o.notes}</div>}
                  </div>
                ))}
                {report.creditProfile.business && (
                  <div style={{ marginTop: 4, padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 6, fontSize: 10 }}>
                    <div style={{ color: "#E8D5A3", fontWeight: 600, marginBottom: 3 }}>Business</div>
                    <div style={{ color: "rgba(232,213,163,0.7)", fontFeatureSettings: "'zero' 0" }}>
                      Intelliscore: {report.creditProfile.business.intelliscore || "N/A"} · Fin Stability: {report.creditProfile.business.financialStability || "N/A"} · File age: {report.creditProfile.business.fileAge || "—"}
                    </div>
                    {report.creditProfile.business.notes && (
                      <div style={{ color: "rgba(232,213,163,0.55)", fontSize: 9, lineHeight: 1.4, marginTop: 3 }}>{report.creditProfile.business.notes}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* VERDICT RATIONALE */}
            {report.verdictRationale && (
              <div style={{ marginBottom: 16, padding: 12, borderLeft: '3px solid rgba(200,146,42,0.4)', background: 'rgba(200,146,42,0.05)', borderRadius: '0 6px 6px 0' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#C8922A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Verdict Rationale</div>
                <div style={{ fontSize: 11, color: '#E8D5A3', lineHeight: 1.6 }}>{report.verdictRationale}</div>
              </div>
            )}

            {/* CONDITIONS */}
            {report.conditions?.length > 0 && (
              <div style={{ marginBottom: 16, padding: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Conditions to Fund</div>
                {report.conditions.map((c: string, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: '#F59E0B', marginBottom: 4, lineHeight: 1.45 }}>• {c}</div>
                ))}
              </div>
            )}

            {/* EXPORT */}
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${(report.dealName || dealName || 'deal').replace(/\s+/g, '-')}-underwriting.json`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid rgba(200,146,42,0.3)', background: 'transparent', color: '#C8922A', fontSize: 11, cursor: 'pointer', marginTop: 8 }}
            >↓ Export Report JSON</button>
          </div>
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
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,146,42,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8D5A3", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", marginBottom: 16 }}
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
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a2f45", border: "1px solid rgba(200,146,42,0.35)", borderRadius: 10, padding: "12px 20px", color: "#E8D5A3", fontSize: 13, fontWeight: 500, zIndex: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}