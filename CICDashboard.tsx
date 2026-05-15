"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface CICClient {
  id: string;
  full_name: string;
  business_name: string;
  industry: string;
  engagement_status: string;
  engagement_type: string;
  monthly_revenue_range: string;
  personal_credit_range: string;
  created_at: string;
  cic_audits?: CICAudit[];
  cic_retainers?: CICRetainer[];
}

interface CICAudit {
  id: string;
  avg_monthly_deposits: number;
  avg_daily_balance: number;
  nsf_count_6mo: number;
  negative_days_3mo: number;
  revenue_trend: string;
  total_active_positions: number;
  total_remaining_balance: number;
  total_daily_obligation: number;
  debt_service_ratio: number;
  readiness_score: number;
  readiness_grade: string;
  findings: Finding[];
  advisor_notes: string;
  audit_date: string;
}

interface CICRetainer {
  id: string;
  status: string;
  monthly_fee: number;
  next_checkin_date: string;
}

interface Finding {
  type: "green" | "amber" | "red";
  icon: string;
  title: string;
  body: string;
}

const fmt = (n: number) =>
  "$" + Math.round(n).toLocaleString();

const pct = (n: number) => (n * 100).toFixed(1) + "%";

export default function CICDashboard() {
  const [clients, setClients] = useState<CICClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "new-client" | "audit" | "client-detail">("list");
  const [selectedClient, setSelectedClient] = useState<CICClient | null>(null);

  // New client form
  const [form, setForm] = useState({
    full_name: "",
    business_name: "",
    business_type: "",
    industry: "",
    state: "",
    years_in_business: "",
    phone: "",
    email: "",
    monthly_revenue_range: "",
    personal_credit_range: "",
    engagement_type: "roadmap",
    notes: "",
  });

  // Audit form
  const [auditForm, setAuditForm] = useState({
    avg_monthly_deposits: "",
    avg_daily_balance: "",
    nsf_count_6mo: "0",
    negative_days_3mo: "0",
    revenue_trend: "stable",
    advisor_notes: "",
    positions: [] as { lender: string; remaining_balance: string; daily_payment: string }[],
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cic_clients")
      .select(`*, cic_audits(*), cic_retainers(*)`)
      .order("created_at", { ascending: false });
    if (!error) setClients(data || []);
    setLoading(false);
  }

  async function createClient() {
    if (!form.full_name || !form.business_name) {
      alert("Full name and business name are required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("cic_clients").insert({
      ...form,
      engagement_status: "intake",
    });
    if (error) { alert(error.message); setSaving(false); return; }
    setSaveMsg("Client created!");
    setTimeout(() => setSaveMsg(""), 3000);
    setSaving(false);
    setForm({
      full_name: "", business_name: "", business_type: "", industry: "",
      state: "", years_in_business: "", phone: "", email: "",
      monthly_revenue_range: "", personal_credit_range: "",
      engagement_type: "roadmap", notes: "",
    });
    await fetchClients();
    setView("list");
  }

  async function saveAudit() {
    if (!selectedClient) return;
    setSaving(true);

    const deposits = parseFloat(auditForm.avg_monthly_deposits) || 0;
    const adb = parseFloat(auditForm.avg_daily_balance) || 0;
    const positions = auditForm.positions;

    const totalRemaining = positions.reduce(
      (s, p) => s + (parseFloat(p.remaining_balance) || 0), 0
    );
    const totalDaily = positions.reduce(
      (s, p) => s + (parseFloat(p.daily_payment) || 0), 0
    );
    const monthlyDebt = totalDaily * 21;
    const debtRatio = deposits > 0 ? monthlyDebt / deposits : 0;

    // Auto-generate findings
    const findings: Finding[] = [];

    const nsf = parseInt(auditForm.nsf_count_6mo) || 0;
    if (nsf === 0) findings.push({ type: "green", icon: "✓", title: "No NSF Activity", body: "Zero NSF occurrences — strong cash management signal." });
    else if (nsf <= 2) findings.push({ type: "amber", icon: "⚠", title: "Minor NSF Activity", body: `${nsf} NSF occurrence(s) — minor concern. Monitor before applying.` });
    else findings.push({ type: "red", icon: "✗", title: "NSF Activity — Significant", body: `${nsf} NSFs — significant underwriting concern. Must resolve before pursuing financing.` });

    const negDays = parseInt(auditForm.negative_days_3mo) || 0;
    if (negDays === 0) findings.push({ type: "green", icon: "✓", title: "No Negative Balance Days", body: "Zero negative balance days — excellent cash discipline." });
    else findings.push({ type: negDays <= 2 ? "amber" : "red", icon: negDays <= 2 ? "⚠" : "✗", title: "Negative Balance Days Present", body: `${negDays} negative day(s) — address before applying to any lender.` });

    if (adb >= 15000) findings.push({ type: "green", icon: "✓", title: "Strong Average Daily Balance", body: `${fmt(adb)} — healthy reserve. Favorable signal to all lenders.` });
    else if (adb >= 5000) findings.push({ type: "amber", icon: "⚠", title: "Moderate Average Daily Balance", body: `${fmt(adb)} — acceptable but building higher will improve offer quality.` });
    else findings.push({ type: "red", icon: "✗", title: "Low Average Daily Balance", body: `${fmt(adb)} — below threshold most lenders prefer. Focus on building before applying.` });

    const debtPct = debtRatio * 100;
    if (debtPct === 0) findings.push({ type: "green", icon: "✓", title: "No Active Debt Positions", body: "Clean position — maximum flexibility and best possible offers." });
    else if (debtPct < 15) findings.push({ type: "green", icon: "✓", title: "Healthy Debt Service Ratio", body: `${debtPct.toFixed(1)}% of monthly revenue — manageable. Room for strategic capital.` });
    else if (debtPct < 30) findings.push({ type: "amber", icon: "⚠", title: "Elevated Debt Service Ratio", body: `${debtPct.toFixed(1)}% of revenue — any new capital needs a clear high-return purpose.` });
    else findings.push({ type: "red", icon: "✗", title: "Critical Debt Service Ratio", body: `${debtPct.toFixed(1)}% of revenue — unsustainable. Restructuring conversation needed first.` });

    if (auditForm.revenue_trend === "growing") findings.push({ type: "green", icon: "✓", title: "Revenue Trend: Growing", body: "Month-over-month growth — the most favorable signal for all lender categories." });
    else if (auditForm.revenue_trend === "stable") findings.push({ type: "green", icon: "✓", title: "Revenue Trend: Stable", body: "Consistent, predictable revenue — strong signal of business reliability." });
    else if (auditForm.revenue_trend === "seasonal") findings.push({ type: "amber", icon: "⚠", title: "Revenue Trend: Seasonal", body: "Seasonal variation — time the application to a strong revenue period." });
    else findings.push({ type: "red", icon: "✗", title: "Revenue Trend: Declining", body: "Declining revenue — address the underlying cause before pursuing capital." });

    // Simple readiness score
    let score = 0;
    if (nsf === 0) score += 8; else if (nsf <= 2) score += 5; else score += 1;
    if (negDays === 0) score += 8; else if (negDays <= 2) score += 4;
    if (adb >= 15000) score += 8; else if (adb >= 5000) score += 5; else score += 1;
    if (debtPct < 15) score += 8; else if (debtPct < 30) score += 4; else score += 1;
    if (auditForm.revenue_trend === "growing") score += 8;
    else if (auditForm.revenue_trend === "stable") score += 7;
    else if (auditForm.revenue_trend === "seasonal") score += 4;
    else score += 1;

    const grade =
      score >= 35 ? "Capital Ready" :
      score >= 25 ? "Approaching Ready" :
      score >= 15 ? "Building Readiness" :
      "Foundations First";

    const { error } = await supabase.from("cic_audits").upsert(
      {
        client_id: selectedClient.id,
        avg_monthly_deposits: deposits,
        avg_daily_balance: adb,
        nsf_count_6mo: nsf,
        negative_days_3mo: negDays,
        revenue_trend: auditForm.revenue_trend,
        total_active_positions: positions.length,
        total_remaining_balance: totalRemaining,
        total_daily_obligation: totalDaily,
        debt_service_ratio: debtRatio,
        readiness_score: score,
        readiness_grade: grade,
        findings,
        advisor_notes: auditForm.advisor_notes,
        audit_date: new Date().toISOString().split("T")[0],
      },
      { onConflict: "client_id" }
    );

    if (error) { alert(error.message); setSaving(false); return; }

    // Update client status
    await supabase
      .from("cic_clients")
      .update({ engagement_status: "active" })
      .eq("id", selectedClient.id);

    setSaveMsg("Audit saved!");
    setTimeout(() => setSaveMsg(""), 3000);
    setSaving(false);
    await fetchClients();
    setView("list");
  }

  // ── STYLES ──────────────────────────────
  const S = {
    container: { padding: "32px", maxWidth: 1100, margin: "0 auto" } as React.CSSProperties,
    header: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 } as React.CSSProperties,
    sub: { fontSize: 12, color: "var(--ink-4)", marginBottom: 24 } as React.CSSProperties,
    btn: { padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(200,146,42,0.3)", background: "rgba(200,146,42,0.08)", color: "#8B6340", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties,
    btnPrimary: { padding: "9px 22px", borderRadius: 8, border: "1px solid rgba(200,146,42,0.5)", background: "#C8922A", color: "#0D1B2A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties,
    btnBack: { padding: "6px 14px", borderRadius: 7, border: "1px solid var(--border-mid)", background: "transparent", color: "var(--ink-4)", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 20 } as React.CSSProperties,
    card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", boxShadow: "0 2px 12px rgba(30,16,4,0.06)" } as React.CSSProperties,
    label: { display: "block", fontSize: 10, fontWeight: 700, color: "var(--ink-4)", marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.08em" },
    input: { width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties,
    select: { width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "9px 12px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties,
    metricCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px" } as React.CSSProperties,
    metricLabel: { fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 6 },
    metricVal: { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: "#C8922A" },
    metricSub: { fontSize: 10, color: "var(--ink-4)", marginTop: 2 },
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      intake: "#3B82F6", active: "#F59E0B",
      complete: "#10B981", retainer: "#C8922A",
    };
    return map[status] || "#6B7280";
  };

  const findingBg = (type: string) => {
    if (type === "green") return { bg: "#F0FDF4", border: "#86EFAC", color: "#166534" };
    if (type === "amber") return { bg: "#FFFBEB", border: "#FCD34D", color: "#92400E" };
    return { bg: "#FFF1F2", border: "#FCA5A5", color: "#991B1B" };
  };

  // ── METRICS ─────────────────────────────
  const totalClients = clients.length;
  const activeRetainers = clients.filter(c => c.cic_retainers?.[0]?.status === "active").length;
  const mrr = activeRetainers * 397;
  const auditsComplete = clients.filter(c => c.cic_audits && c.cic_audits.length > 0).length;

  // ── RENDER ───────────────────────────────

  // ── NEW CLIENT FORM ─────────────────────
  if (view === "new-client") {
    return (
      <div style={S.container}>
        <button onClick={() => setView("list")} style={S.btnBack}>← Back to clients</button>
        <div style={S.header}>New CIC Client</div>
        <div style={S.sub}>Create a new advisory engagement</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 700 }}>
          {[
            { key: "full_name", label: "Owner Full Name *" },
            { key: "business_name", label: "Business Name *" },
            { key: "email", label: "Email Address" },
            { key: "phone", label: "Phone Number" },
            { key: "industry", label: "Industry" },
            { key: "state", label: "State" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label style={S.label}>{label}</label>
              <input
                style={S.input}
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}

          <div>
            <label style={S.label}>Years in Business</label>
            <select style={S.select} value={form.years_in_business} onChange={e => setForm(f => ({ ...f, years_in_business: e.target.value }))}>
              <option value="">Select...</option>
              {["Under 1 year", "1–2 years", "2–3 years", "3–5 years", "5–10 years", "10+ years"].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={S.label}>Monthly Revenue Range</label>
            <select style={S.select} value={form.monthly_revenue_range} onChange={e => setForm(f => ({ ...f, monthly_revenue_range: e.target.value }))}>
              <option value="">Select...</option>
              {["Under $10K", "$10K–$30K", "$30K–$75K", "$75K–$150K", "$150K–$300K", "Above $300K"].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={S.label}>Personal Credit Range</label>
            <select style={S.select} value={form.personal_credit_range} onChange={e => setForm(f => ({ ...f, personal_credit_range: e.target.value }))}>
              <option value="">Select...</option>
              {["720+", "680–719", "640–679", "600–639", "Below 600", "Unknown"].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={S.label}>Engagement Type</label>
            <select style={S.select} value={form.engagement_type} onChange={e => setForm(f => ({ ...f, engagement_type: e.target.value }))}>
              <option value="audit">Capital Clarity Audit — $497</option>
              <option value="roadmap">Capital Road Map — $1,200</option>
              <option value="retainer">Advisory Retainer — $397/mo</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 16, maxWidth: 700 }}>
          <label style={S.label}>Notes</label>
          <textarea
            style={{ ...S.input, minHeight: 80, resize: "vertical" as const }}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Initial context, referral source, specific concerns..."
          />
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={createClient} style={S.btnPrimary} disabled={saving}>
            {saving ? "Saving..." : "Create Client"}
          </button>
          <button onClick={() => setView("list")} style={S.btn}>Cancel</button>
          {saveMsg && <span style={{ fontSize: 12, color: "#10B981" }}>{saveMsg}</span>}
        </div>
      </div>
    );
  }

  // ── AUDIT FORM ──────────────────────────
  if (view === "audit" && selectedClient) {
    return (
      <div style={S.container}>
        <button onClick={() => setView("list")} style={S.btnBack}>← Back to clients</button>
        <div style={S.header}>Financial Audit — {selectedClient.business_name}</div>
        <div style={S.sub}>Enter banking data to generate the financial analysis</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 800, marginBottom: 24 }}>
          {[
            { key: "avg_monthly_deposits", label: "Avg Monthly Deposits (3 Mo)", prefix: "$" },
            { key: "avg_daily_balance", label: "Avg Daily Balance (3 Mo)", prefix: "$" },
            { key: "nsf_count_6mo", label: "NSF Count (Last 6 Mo)" },
            { key: "negative_days_3mo", label: "Negative Balance Days (3 Mo)" },
          ].map(({ key, label, prefix }) => (
            <div key={key}>
              <label style={S.label}>{prefix}{label}</label>
              <input
                style={S.input}
                type="number"
                value={(auditForm as any)[key]}
                onChange={e => setAuditForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}

          <div>
            <label style={S.label}>Revenue Trend</label>
            <select style={S.select} value={auditForm.revenue_trend} onChange={e => setAuditForm(f => ({ ...f, revenue_trend: e.target.value }))}>
              <option value="growing">Growing</option>
              <option value="stable">Stable</option>
              <option value="seasonal">Seasonal</option>
              <option value="declining">Declining</option>
            </select>
          </div>
        </div>

        {/* Positions */}
        <div style={{ marginBottom: 20, maxWidth: 800 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 }}>
            Active Financing Positions
          </div>
          {auditForm.positions.map((pos, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 36px", gap: 10, marginBottom: 8, alignItems: "end" }}>
              <div>
                {i === 0 && <label style={S.label}>Lender / Type</label>}
                <input style={S.input} placeholder="e.g. Fundbox MCA" value={pos.lender}
                  onChange={e => setAuditForm(f => ({ ...f, positions: f.positions.map((p, j) => j === i ? { ...p, lender: e.target.value } : p) }))} />
              </div>
              <div>
                {i === 0 && <label style={S.label}>Remaining Balance</label>}
                <input style={S.input} placeholder="$" type="number" value={pos.remaining_balance}
                  onChange={e => setAuditForm(f => ({ ...f, positions: f.positions.map((p, j) => j === i ? { ...p, remaining_balance: e.target.value } : p) }))} />
              </div>
              <div>
                {i === 0 && <label style={S.label}>Daily Payment</label>}
                <input style={S.input} placeholder="$" type="number" value={pos.daily_payment}
                  onChange={e => setAuditForm(f => ({ ...f, positions: f.positions.map((p, j) => j === i ? { ...p, daily_payment: e.target.value } : p) }))} />
              </div>
              <button onClick={() => setAuditForm(f => ({ ...f, positions: f.positions.filter((_, j) => j !== i) }))}
                style={{ height: 36, borderRadius: 7, border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#991B1B", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          ))}
          <button onClick={() => setAuditForm(f => ({ ...f, positions: [...f.positions, { lender: "", remaining_balance: "", daily_payment: "" }] }))}
            style={{ ...S.btn, marginTop: 6 }}>+ Add Position</button>
        </div>

        <div style={{ maxWidth: 800, marginBottom: 20 }}>
          <label style={S.label}>Advisor Notes</label>
          <textarea style={{ ...S.input, minHeight: 80, resize: "vertical" as const }}
            value={auditForm.advisor_notes}
            onChange={e => setAuditForm(f => ({ ...f, advisor_notes: e.target.value }))}
            placeholder="Key observations, context, and recommendations..." />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={saveAudit} style={S.btnPrimary} disabled={saving}>
            {saving ? "Saving..." : "Save Audit"}
          </button>
          <button onClick={() => setView("list")} style={S.btn}>Cancel</button>
          {saveMsg && <span style={{ fontSize: 12, color: "#10B981" }}>{saveMsg}</span>}
        </div>
      </div>
    );
  }

  // ── CLIENT DETAIL ────────────────────────
  if (view === "client-detail" && selectedClient) {
    const audit = selectedClient.cic_audits?.[0];
    const retainer = selectedClient.cic_retainers?.[0];

    return (
      <div style={S.container}>
        <button onClick={() => setView("list")} style={S.btnBack}>← Back to clients</button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={S.header}>{selectedClient.business_name}</div>
            <div style={S.sub}>{selectedClient.full_name} · {selectedClient.industry}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => {
              setAuditForm({
                avg_monthly_deposits: audit?.avg_monthly_deposits?.toString() || "",
                avg_daily_balance: audit?.avg_daily_balance?.toString() || "",
                nsf_count_6mo: audit?.nsf_count_6mo?.toString() || "0",
                negative_days_3mo: audit?.negative_days_3mo?.toString() || "0",
                revenue_trend: audit?.revenue_trend || "stable",
                advisor_notes: audit?.advisor_notes || "",
                positions: [],
              });
              setView("audit");
            }} style={S.btnPrimary}>
              {audit ? "Update Audit" : "Run Audit"}
            </button>
          </div>
        </div>

        {/* Status row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" as const }}>
          {[
            { label: "Status", value: selectedClient.engagement_status },
            { label: "Type", value: selectedClient.engagement_type },
            { label: "Revenue", value: selectedClient.monthly_revenue_range || "—" },
            { label: "Credit", value: selectedClient.personal_credit_range || "—" },
            retainer ? { label: "Retainer", value: retainer.status } : null,
          ].filter(Boolean).map((item: any) => (
            <div key={item.label} style={{ background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
              <span style={{ fontSize: 9, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{item.label}: </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>{item.value}</span>
            </div>
          ))}
        </div>

        {audit ? (
          <>
            {/* Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <div style={S.metricCard}><div style={S.metricLabel}>Monthly Revenue</div><div style={S.metricVal}>{fmt(audit.avg_monthly_deposits)}</div><div style={S.metricSub}>3-month average</div></div>
              <div style={S.metricCard}><div style={S.metricLabel}>Avg Daily Balance</div><div style={{ ...S.metricVal, color: audit.avg_daily_balance >= 10000 ? "#10B981" : audit.avg_daily_balance >= 3000 ? "#F59E0B" : "#EF4444" }}>{fmt(audit.avg_daily_balance)}</div><div style={S.metricSub}>3-month average</div></div>
              <div style={S.metricCard}><div style={S.metricLabel}>Monthly Debt</div><div style={{ ...S.metricVal, color: audit.debt_service_ratio < 0.15 ? "#10B981" : audit.debt_service_ratio < 0.30 ? "#F59E0B" : "#EF4444" }}>{fmt(audit.total_daily_obligation * 21)}</div><div style={S.metricSub}>{pct(audit.debt_service_ratio)} of revenue</div></div>
              <div style={S.metricCard}><div style={S.metricLabel}>Readiness Score</div><div style={S.metricVal}>{audit.readiness_score}/40</div><div style={S.metricSub}>{audit.readiness_grade}</div></div>
            </div>

            {/* Findings */}
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 12 }}>Audit Findings</div>
              {audit.findings?.map((f, i) => {
                const colors = findingBg(f.type);
                return (
                  <div key={i} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 8, borderLeft: `3px solid ${colors.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.color, marginBottom: 2 }}>{f.icon} {f.title}</div>
                    <div style={{ fontSize: 11, color: colors.color, opacity: 0.85 }}>{f.body}</div>
                  </div>
                );
              })}
            </div>

            {audit.advisor_notes && (
              <div style={S.card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Advisor Notes</div>
                <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>{audit.advisor_notes}</p>
              </div>
            )}
          </>
        ) : (
          <div style={{ ...S.card, textAlign: "center" as const, padding: 40 }}>
            <div style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 16 }}>No audit completed yet for this client.</div>
            <button onClick={() => setView("audit")} style={S.btnPrimary}>Run Financial Audit</button>
          </div>
        )}
      </div>
    );
  }

  // ── CLIENT LIST (default) ────────────────
  return (
    <div style={S.container}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={S.header}>Capital Intelligence</div>
          <div style={S.sub}>Advisory client management</div>
        </div>
        <button onClick={() => setView("new-client")} style={S.btnPrimary}>+ New Client</button>
      </div>

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <div style={S.metricCard}><div style={S.metricLabel}>Total Clients</div><div style={S.metricVal}>{totalClients}</div><div style={S.metricSub}>All engagements</div></div>
        <div style={S.metricCard}><div style={S.metricLabel}>Active Retainers</div><div style={S.metricVal}>{activeRetainers}</div><div style={S.metricSub}>${mrr.toLocaleString()}/month MRR</div></div>
        <div style={S.metricCard}><div style={S.metricLabel}>Audits Complete</div><div style={S.metricVal}>{auditsComplete}</div><div style={S.metricSub}>of {totalClients} clients</div></div>
        <div style={S.metricCard}><div style={S.metricLabel}>Monthly Revenue</div><div style={S.metricVal}>${mrr.toLocaleString()}</div><div style={S.metricSub}>Retainer base</div></div>
      </div>

      {/* Client table */}
      <div style={S.card}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
          {["Business", "Owner / Industry", "Status", "Audit", "Retainer"].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center" as const, color: "var(--ink-4)", fontSize: 13 }}>Loading clients...</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" as const }}>
            <div style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 12 }}>No CIC clients yet.</div>
            <button onClick={() => setView("new-client")} style={S.btnPrimary}>Add your first client</button>
          </div>
        ) : (
          clients.map(client => (
            <div
              key={client.id}
              onClick={() => { setSelectedClient(client); setView("client-detail"); }}
              style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--parchment-2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>{client.business_name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-4)" }}>{client.monthly_revenue_range || "Revenue not set"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{client.full_name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-4)" }}>{client.industry || "—"}</div>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: `${statusColor(client.engagement_status)}18`, color: statusColor(client.engagement_status) }}>
                  {client.engagement_status}
                </span>
              </div>
              <div>
                {client.cic_audits && client.cic_audits.length > 0 ? (
                  <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>
                    ✓ {client.cic_audits[0].readiness_grade}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Pending</span>
                )}
              </div>
              <div>
                {client.cic_retainers?.[0] ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: client.cic_retainers[0].status === "active" ? "#F0FDF4" : "#FFF1F2", color: client.cic_retainers[0].status === "active" ? "#166534" : "#991B1B" }}>
                    {client.cic_retainers[0].status}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
