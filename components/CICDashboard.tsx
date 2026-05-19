"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── TYPES ────────────────────────────────────────────────────────────────────

interface CICClient {
  id: string;
  full_name: string;
  business_name: string;
  industry: string;
  engagement_status: string;
  engagement_type: string;
  monthly_revenue_range: string;
  personal_credit_range: string;
  phone: string;
  email: string;
  state: string;
  years_in_business: string;
  notes: string;
  created_at: string;
  cic_audits?: CICAudit[];
  cic_retainers?: CICRetainer[];
  cic_roadmaps?: CICRoadmap[];
  cic_health_reports?: CICHealthReport[];
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
  touchpoints: Touchpoint[];
}

interface CICRoadmap {
  id: string;
  phase_1_items: RoadmapItem[];
  phase_2_items: RoadmapItem[];
  phase_3_items: RoadmapItem[];
  phase_4_items: RoadmapItem[];
  recommended_product: string;
  recommended_amount_range: string;
  capital_timing: string;
  current_phase: number;
  next_milestone: string;
  advisor_strategy_notes: string;
}

interface CICHealthReport {
  id: string;
  report_month: string;
  monthly_revenue: number;
  avg_daily_balance: number;
  nsf_count: number;
  debt_payments: number;
  debt_ratio: number;
  personal_credit_score: number;
  business_credit_score: number;
  trade_lines_count: number;
  health_score: number;
  score_change: number;
  highlights: Highlight[];
  advisor_summary: string;
  next_steps: NextStep[];
}

interface Finding { type: "green" | "amber" | "red"; icon: string; title: string; body: string; }
interface RoadmapItem { id: string; task: string; status: "pending" | "in_progress" | "complete"; due_date?: string; priority: "high" | "medium" | "low"; }
interface Touchpoint { date: string; type: string; notes: string; completed: boolean; }
interface Highlight { type: "good" | "warn" | "alert"; text: string; }
interface NextStep { action: string; priority: "high" | "medium" | "low"; }
interface DocItem { name: string; required: boolean; received: boolean; notes: string; }

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const REQUIRED_DOCS: DocItem[] = [
  { name: "3 months bank statements", required: true, received: false, notes: "" },
  { name: "6 months bank statements", required: false, received: false, notes: "" },
  { name: "Business tax return (most recent)", required: true, received: false, notes: "" },
  { name: "Personal tax return (most recent)", required: false, received: false, notes: "" },
  { name: "Government-issued ID", required: true, received: false, notes: "" },
  { name: "Articles of Incorporation / LLC Agreement", required: true, received: false, notes: "" },
  { name: "EIN Confirmation Letter (CP-575)", required: true, received: false, notes: "" },
  { name: "Voided business check", required: false, received: false, notes: "" },
  { name: "Existing MCA agreements (all active)", required: false, received: false, notes: "" },
  { name: "Business credit report (if available)", required: false, received: false, notes: "" },
];

const PHASE_LABELS = [
  "Phase 1 — Immediate Actions (0–30 days)",
  "Phase 2 — Foundation Building (30–90 days)",
  "Phase 3 — Capital Strategy (90–180 days)",
  "Phase 4 — Long-Term Health (180+ days)",
];

const DEFAULT_PHASES: RoadmapItem[][] = [
  [
    { id: "p1-1", task: "Open dedicated business bank account", status: "pending", priority: "high" },
    { id: "p1-2", task: "Register business with Dun & Bradstreet (DUNS number)", status: "pending", priority: "high" },
    { id: "p1-3", task: "Separate all personal and business expenses immediately", status: "pending", priority: "high" },
    { id: "p1-4", task: "Eliminate NSF occurrences — build cash buffer", status: "pending", priority: "high" },
  ],
  [
    { id: "p2-1", task: "Open 3–5 vendor trade lines that report to business bureaus", status: "pending", priority: "high" },
    { id: "p2-2", task: "Build average daily balance to $10,000+", status: "pending", priority: "high" },
    { id: "p2-3", task: "Apply for business credit card", status: "pending", priority: "medium" },
    { id: "p2-4", task: "Dispute any inaccurate personal credit items", status: "pending", priority: "medium" },
  ],
  [
    { id: "p3-1", task: "Review financing options — identify best product match", status: "pending", priority: "high" },
    { id: "p3-2", task: "Prepare application package with advisor guidance", status: "pending", priority: "high" },
    { id: "p3-3", task: "Review and understand agreement before signing", status: "pending", priority: "high" },
    { id: "p3-4", task: "Execute capital deployment plan", status: "pending", priority: "medium" },
  ],
  [
    { id: "p4-1", task: "Maintain clean banking profile — no NSFs, growing balance", status: "pending", priority: "medium" },
    { id: "p4-2", task: "Continue building business credit — target Paydex 80+", status: "pending", priority: "medium" },
    { id: "p4-3", task: "Annual financial review with advisor", status: "pending", priority: "low" },
    { id: "p4-4", task: "Evaluate SBA eligibility at 12-month mark", status: "pending", priority: "low" },
  ],
];

const TOUCHPOINT_SCHEDULE = [
  { type: "24-Hour Summary", label: "24-Hour Engagement Summary", description: "Email summary of findings, road map, and next steps" },
  { type: "Week 2 Check-In", label: "Week 2 Check-In Call", description: "Confirm Phase 1 actions started, remove obstacles" },
  { type: "Month 1 Report", label: "Month 1 Health Report", description: "Banking trends, credit activity, action item status" },
  { type: "Quarter 1 Review", label: "Quarterly Strategy Review", description: "Road map reassessment, capital timing evaluation" },
  { type: "Month 6 Update", label: "6-Month Mid-Year Update", description: "Credit pull, new options, capital deployed review" },
  { type: "Annual Review", label: "12-Month Annual Review", description: "Year-over-year comparison, referral ask" },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => "$" + Math.round(n || 0).toLocaleString();
const pct = (n: number) => ((n || 0) * 100).toFixed(1) + "%";
const statusColor = (s: string) => ({ intake: "#3B82F6", active: "#F59E0B", complete: "#10B981", retainer: "#C8922A" }[s] || "#6B7280");
const findingBg = (t: string) => t === "green" ? { bg: "#F0FDF4", border: "#86EFAC", color: "#166534" } : t === "amber" ? { bg: "#FFFBEB", border: "#FCD34D", color: "#92400E" } : { bg: "#FFF1F2", border: "#FCA5A5", color: "#991B1B" };

const S = {
  wrap: { padding: "28px 32px", maxWidth: 1100, margin: "0 auto" } as React.CSSProperties,
  h1: { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: "var(--ink-1)", marginBottom: 3 } as React.CSSProperties,
  sub: { fontSize: 12, color: "var(--ink-4)", marginBottom: 18 } as React.CSSProperties,
  btn: { padding: "7px 15px", borderRadius: 7, border: "1px solid rgba(200,146,42,0.3)", background: "rgba(200,146,42,0.08)", color: "#8B6340", fontSize: 12, fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  btnP: { padding: "8px 20px", borderRadius: 7, border: "1px solid rgba(200,146,42,0.5)", background: "#C8922A", color: "#0D1B2A", fontSize: 13, fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
  btnBack: { padding: "5px 11px", borderRadius: 6, border: "1px solid var(--border-mid)", background: "transparent", color: "var(--ink-4)", fontSize: 11, cursor: "pointer", marginBottom: 14 } as React.CSSProperties,
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", boxShadow: "0 2px 8px rgba(30,16,4,0.05)" } as React.CSSProperties,
  lbl: { display: "block", fontSize: 9, fontWeight: 700, color: "var(--ink-4)", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" },
  inp: { width: "100%", borderRadius: 7, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "7px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none" } as React.CSSProperties,
  sel: { width: "100%", borderRadius: 7, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "7px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none" } as React.CSSProperties,
  ta: { width: "100%", borderRadius: 7, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "7px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", resize: "vertical" as const, minHeight: 80 } as React.CSSProperties,
  mc: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "12px 14px" } as React.CSSProperties,
  ml: { fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 },
  mv: { fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "#C8922A" },
  ms: { fontSize: 10, color: "var(--ink-4)", marginTop: 2 },
  tab: (a: boolean) => ({ padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: a ? "#C8922A" : "transparent", color: a ? "#0D1B2A" : "var(--ink-4)", transition: "all 0.15s" } as React.CSSProperties),
  secHd: { fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 },
};

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function CICDashboard() {
  const [clients, setClients] = useState<CICClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [client, setClient] = useState<CICClient | null>(null);
  const [tab, setTab] = useState<"overview" | "audit" | "roadmap" | "docs" | "followup" | "reports" | "ai">("overview");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOut, setAiOut] = useState("");

  const [form, setForm] = useState({ full_name: "", business_name: "", business_type: "", industry: "", state: "", years_in_business: "", phone: "", email: "", monthly_revenue_range: "", personal_credit_range: "", engagement_type: "roadmap", notes: "" });
  const [aForm, setAForm] = useState({ avg_monthly_deposits: "", avg_daily_balance: "", nsf_count_6mo: "0", negative_days_3mo: "0", revenue_trend: "stable", advisor_notes: "", positions: [] as { lender: string; remaining_balance: string; daily_payment: string }[] });
  const [rm, setRm] = useState<{ phases: RoadmapItem[][]; recommended_product: string; recommended_amount_range: string; capital_timing: string; current_phase: number; next_milestone: string; advisor_strategy_notes: string }>({ phases: DEFAULT_PHASES.map(p => p.map(i => ({ ...i }))), recommended_product: "", recommended_amount_range: "", capital_timing: "not-yet", current_phase: 1, next_milestone: "", advisor_strategy_notes: "" });
  const [docs, setDocs] = useState<DocItem[]>(REQUIRED_DOCS.map(d => ({ ...d })));
  const [tps, setTps] = useState<Touchpoint[]>(TOUCHPOINT_SCHEDULE.map(t => ({ date: "", type: t.type, notes: "", completed: false })));
  const [rptForm, setRptForm] = useState({ report_month: new Date().toISOString().slice(0, 7), monthly_revenue: "", avg_daily_balance: "", nsf_count: "0", debt_payments: "", personal_credit_score: "", business_credit_score: "", trade_lines_count: "0", health_score: "", score_change: "0", advisor_summary: "", highlights: [{ type: "good" as const, text: "" }], next_steps: [{ action: "", priority: "high" as const }] });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: cd } = await supabase.from("cic_clients").select("*").order("created_at", { ascending: false });
    if (!cd) { setLoading(false); return; }
    const [{ data: ad }, { data: rd }, { data: rmd }, { data: rpd }] = await Promise.all([
      supabase.from("cic_audits").select("*"),
      supabase.from("cic_retainers").select("*"),
      supabase.from("cic_roadmaps").select("*"),
      supabase.from("cic_health_reports").select("*").order("report_month", { ascending: false }),
    ]);
    setClients(cd.map((c: any) => ({ ...c, cic_audits: ad?.filter((a: any) => a.client_id === c.id) || [], cic_retainers: rd?.filter((r: any) => r.client_id === c.id) || [], cic_roadmaps: rmd?.filter((r: any) => r.client_id === c.id) || [], cic_health_reports: rpd?.filter((r: any) => r.client_id === c.id) || [] })));
    setLoading(false);
  }

  function ok(m: string) { setMsg(m); setTimeout(() => setMsg(""), 3000); }

  async function createClient() {
    if (!form.full_name || !form.business_name) { alert("Name and business name required."); return; }
    setSaving(true);
    const { error } = await supabase.from("cic_clients").insert({ ...form, engagement_status: "intake" });
    if (error) { alert(error.message); setSaving(false); return; }
    ok("Client created!"); setSaving(false);
    setForm({ full_name: "", business_name: "", business_type: "", industry: "", state: "", years_in_business: "", phone: "", email: "", monthly_revenue_range: "", personal_credit_range: "", engagement_type: "roadmap", notes: "" });
    await load(); setView("list");
  }

  async function saveAudit() {
    if (!client) return;
    setSaving(true);
    const dep = parseFloat(aForm.avg_monthly_deposits) || 0;
    const adb = parseFloat(aForm.avg_daily_balance) || 0;
    const pos = aForm.positions;
    const totRem = pos.reduce((s, p) => s + (parseFloat(p.remaining_balance) || 0), 0);
    const totDay = pos.reduce((s, p) => s + (parseFloat(p.daily_payment) || 0), 0);
    const dr = dep > 0 ? (totDay * 21) / dep : 0;
    const nsf = parseInt(aForm.nsf_count_6mo) || 0;
    const neg = parseInt(aForm.negative_days_3mo) || 0;
    const dp = dr * 100;
    const findings: Finding[] = [];
    if (nsf === 0) findings.push({ type: "green", icon: "✓", title: "No NSF Activity", body: "Zero NSF occurrences — strong cash management signal." });
    else if (nsf <= 2) findings.push({ type: "amber", icon: "⚠", title: "Minor NSF Activity", body: `${nsf} NSF occurrence(s) — monitor before applying.` });
    else findings.push({ type: "red", icon: "✗", title: "NSF Activity — Significant", body: `${nsf} NSFs — must resolve before pursuing financing.` });
    if (neg === 0) findings.push({ type: "green", icon: "✓", title: "No Negative Balance Days", body: "Zero negative balance days — excellent cash discipline." });
    else findings.push({ type: neg <= 2 ? "amber" : "red", icon: neg <= 2 ? "⚠" : "✗", title: "Negative Balance Days Present", body: `${neg} negative day(s).` });
    if (adb >= 15000) findings.push({ type: "green", icon: "✓", title: "Strong Average Daily Balance", body: `${fmt(adb)} — healthy reserve.` });
    else if (adb >= 5000) findings.push({ type: "amber", icon: "⚠", title: "Moderate Average Daily Balance", body: `${fmt(adb)} — building higher will improve offers.` });
    else findings.push({ type: "red", icon: "✗", title: "Low Average Daily Balance", body: `${fmt(adb)} — below lender thresholds.` });
    if (dp === 0) findings.push({ type: "green", icon: "✓", title: "No Active Debt Positions", body: "Clean position — maximum flexibility." });
    else if (dp < 15) findings.push({ type: "green", icon: "✓", title: "Healthy Debt Service Ratio", body: `${dp.toFixed(1)}% of revenue — manageable.` });
    else if (dp < 30) findings.push({ type: "amber", icon: "⚠", title: "Elevated Debt Service Ratio", body: `${dp.toFixed(1)}% — new capital needs clear ROI.` });
    else findings.push({ type: "red", icon: "✗", title: "Critical Debt Service Ratio", body: `${dp.toFixed(1)}% — restructuring needed first.` });
    const trends: Record<string, Finding> = { growing: { type: "green", icon: "✓", title: "Revenue Trend: Growing", body: "Month-over-month growth — most favorable lender signal." }, stable: { type: "green", icon: "✓", title: "Revenue Trend: Stable", body: "Consistent revenue — strong reliability signal." }, seasonal: { type: "amber", icon: "⚠", title: "Revenue Trend: Seasonal", body: "Time application to a strong revenue period." }, declining: { type: "red", icon: "✗", title: "Revenue Trend: Declining", body: "Address root cause before pursuing capital." } };
    findings.push(trends[aForm.revenue_trend]);
    let score = 0;
    if (nsf === 0) score += 8; else if (nsf <= 2) score += 5; else score += 1;
    if (neg === 0) score += 8; else if (neg <= 2) score += 4;
    if (adb >= 15000) score += 8; else if (adb >= 5000) score += 5; else score += 1;
    if (dp < 15) score += 8; else if (dp < 30) score += 4; else score += 1;
    score += aForm.revenue_trend === "growing" ? 8 : aForm.revenue_trend === "stable" ? 7 : aForm.revenue_trend === "seasonal" ? 4 : 1;
    const grade = score >= 35 ? "Capital Ready" : score >= 25 ? "Approaching Ready" : score >= 15 ? "Building Readiness" : "Foundations First";
    const payload = { client_id: client.id, avg_monthly_deposits: dep, avg_daily_balance: adb, nsf_count_6mo: nsf, negative_days_3mo: neg, revenue_trend: aForm.revenue_trend, total_active_positions: pos.length, total_remaining_balance: totRem, total_daily_obligation: totDay, debt_service_ratio: dr, readiness_score: score, readiness_grade: grade, findings, advisor_notes: aForm.advisor_notes, audit_date: new Date().toISOString().split("T")[0] };
    const { data: ex } = await supabase.from("cic_audits").select("id").eq("client_id", client.id).single();
    const { error } = ex ? await supabase.from("cic_audits").update(payload).eq("client_id", client.id) : await supabase.from("cic_audits").insert(payload);
    if (error) { alert(error.message); setSaving(false); return; }
    await supabase.from("cic_clients").update({ engagement_status: "active" }).eq("id", client.id);
    ok("Audit saved!"); setSaving(false); await load(); setTab("overview");
  }

  async function saveRoadmap() {
    if (!client) return;
    setSaving(true);
    const payload = { client_id: client.id, phase_1_items: rm.phases[0], phase_2_items: rm.phases[1], phase_3_items: rm.phases[2], phase_4_items: rm.phases[3], recommended_product: rm.recommended_product, recommended_amount_range: rm.recommended_amount_range, capital_timing: rm.capital_timing, current_phase: rm.current_phase, next_milestone: rm.next_milestone, advisor_strategy_notes: rm.advisor_strategy_notes };
    const { data: ex } = await supabase.from("cic_roadmaps").select("id").eq("client_id", client.id).single();
    const { error } = ex ? await supabase.from("cic_roadmaps").update(payload).eq("client_id", client.id) : await supabase.from("cic_roadmaps").insert(payload);
    if (error) { alert(error.message); setSaving(false); return; }
    ok("Road map saved!"); setSaving(false); await load();
  }

  async function saveTouchpoints() {
    if (!client) return;
    setSaving(true);
    const { data: ex } = await supabase.from("cic_retainers").select("id").eq("client_id", client.id).single();
    const { error } = ex ? await supabase.from("cic_retainers").update({ touchpoints: tps }).eq("client_id", client.id) : await supabase.from("cic_retainers").insert({ client_id: client.id, touchpoints: tps, status: "active", start_date: new Date().toISOString().split("T")[0] });
    if (error) { alert(error.message); setSaving(false); return; }
    ok("Touchpoints saved!"); setSaving(false); await load();
  }

  async function saveReport() {
    if (!client) return;
    setSaving(true);
    const rev = parseFloat(rptForm.monthly_revenue) || 0;
    const payload = { client_id: client.id, report_month: rptForm.report_month + "-01", monthly_revenue: rev, avg_daily_balance: parseFloat(rptForm.avg_daily_balance) || 0, nsf_count: parseInt(rptForm.nsf_count) || 0, debt_payments: parseFloat(rptForm.debt_payments) || 0, debt_ratio: rev ? (parseFloat(rptForm.debt_payments) || 0) / rev : 0, personal_credit_score: parseInt(rptForm.personal_credit_score) || null, business_credit_score: parseInt(rptForm.business_credit_score) || null, trade_lines_count: parseInt(rptForm.trade_lines_count) || 0, health_score: parseInt(rptForm.health_score) || null, score_change: parseInt(rptForm.score_change) || 0, advisor_summary: rptForm.advisor_summary, highlights: rptForm.highlights.filter(h => h.text), next_steps: rptForm.next_steps.filter(s => s.action) };
    const { error } = await supabase.from("cic_health_reports").upsert(payload, { onConflict: "client_id,report_month" });
    if (error) { alert(error.message); setSaving(false); return; }
    ok("Report saved!"); setSaving(false); await load(); setTab("reports");
  }

  async function runAI() {
    if (!client) return;
    setAiLoading(true); setAiOut("");
    const audit = client.cic_audits?.[0];
    const roadmap = client.cic_roadmaps?.[0];
    const prompt = `You are a senior business capital advisor at Capital Intelligence Consulting. Analyze this client and produce a specific, actionable advisory strategy.

CLIENT: ${client.business_name} (${client.industry}) — Owner: ${client.full_name}
Years in Business: ${client.years_in_business} | Revenue: ${client.monthly_revenue_range} | Credit: ${client.personal_credit_range}

${audit ? `AUDIT: Avg Monthly Deposits: ${fmt(audit.avg_monthly_deposits)} | Avg Daily Balance: ${fmt(audit.avg_daily_balance)} | NSFs (6mo): ${audit.nsf_count_6mo} | Negative Days: ${audit.negative_days_3mo} | Revenue Trend: ${audit.revenue_trend} | Active Positions: ${audit.total_active_positions} | Monthly Debt: ${fmt(audit.total_daily_obligation * 21)} | Debt Ratio: ${pct(audit.debt_service_ratio)} | Readiness: ${audit.readiness_score}/40 — ${audit.readiness_grade}` : "No audit completed yet."}
${roadmap ? `ROAD MAP: Phase ${roadmap.current_phase} | Capital Timing: ${roadmap.capital_timing} | Product: ${roadmap.recommended_product} | Next Milestone: ${roadmap.next_milestone}` : "No road map yet."}

Produce a comprehensive strategy with these sections:
1. SITUATION SUMMARY (2-3 honest sentences)
2. PRIORITY ACTIONS (top 3-5 numbered specific actions with rationale)
3. CAPITAL STRATEGY (right product, amount, timing — or why NOT now)
4. CREDIT BUILDING PLAN (personal + business, sequenced by impact)
5. BANKING PROFILE IMPROVEMENTS (specific changes)
6. TIMELINE (30/60/90/180-day milestones for this client)
7. RED FLAGS (immediate concerns or elevated risks)
8. ADVISOR NOTES (watch items, questions to ask, relationship observations)

Be specific. Use actual numbers. Write in plain English. Flag anything requiring human judgment.`;

    try {
      const res = await fetch("/api/cic/ai-strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, clientId: client.id }) });
      const data = await res.json();
      setAiOut(data.strategy || "Error generating strategy. Please try again.");
    } catch { setAiOut("Connection error. Please try again."); }
    setAiLoading(false);
  }

  function openClient(c: CICClient) {
    setClient(c); setTab("overview"); setAiOut("");
    const existRM = c.cic_roadmaps?.[0];
    setRm(existRM ? { phases: [existRM.phase_1_items || DEFAULT_PHASES[0], existRM.phase_2_items || DEFAULT_PHASES[1], existRM.phase_3_items || DEFAULT_PHASES[2], existRM.phase_4_items || DEFAULT_PHASES[3]], recommended_product: existRM.recommended_product || "", recommended_amount_range: existRM.recommended_amount_range || "", capital_timing: existRM.capital_timing || "not-yet", current_phase: existRM.current_phase || 1, next_milestone: existRM.next_milestone || "", advisor_strategy_notes: existRM.advisor_strategy_notes || "" } : { phases: DEFAULT_PHASES.map(p => p.map(i => ({ ...i }))), recommended_product: "", recommended_amount_range: "", capital_timing: "not-yet", current_phase: 1, next_milestone: "", advisor_strategy_notes: "" });
    const existRetainer = c.cic_retainers?.[0];
    setTps(existRetainer?.touchpoints?.length ? existRetainer.touchpoints : TOUCHPOINT_SCHEDULE.map(t => ({ date: "", type: t.type, notes: "", completed: false })));
    const audit = c.cic_audits?.[0];
    if (audit) setAForm({ avg_monthly_deposits: audit.avg_monthly_deposits?.toString() || "", avg_daily_balance: audit.avg_daily_balance?.toString() || "", nsf_count_6mo: audit.nsf_count_6mo?.toString() || "0", negative_days_3mo: audit.negative_days_3mo?.toString() || "0", revenue_trend: audit.revenue_trend || "stable", advisor_notes: audit.advisor_notes || "", positions: [] });
    setView("detail");
  }

  const totalClients = clients.length;
  const activeRetainers = clients.filter(c => c.cic_retainers?.[0]?.status === "active").length;
  const mrr = activeRetainers * 397;
  const auditsComplete = clients.filter(c => (c.cic_audits?.length || 0) > 0).length;
  const roadmapsBuilt = clients.filter(c => (c.cic_roadmaps?.length || 0) > 0).length;

  // ── NEW CLIENT ───────────────────────────────────────────────────────────

  if (view === "new") return (
    <div style={S.wrap}>
      <button onClick={() => setView("list")} style={S.btnBack}>← Back</button>
      <div style={S.h1}>New CIC Client</div>
      <div style={S.sub}>Create a new advisory engagement</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 660 }}>
        {[["full_name", "Owner Full Name *"], ["business_name", "Business Name *"], ["email", "Email Address"], ["phone", "Phone Number"], ["industry", "Industry"], ["state", "State"]].map(([k, l]) => (
          <div key={k}><label style={S.lbl}>{l}</label><input style={S.inp} value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>
        ))}
        <div><label style={S.lbl}>Years in Business</label><select style={S.sel} value={form.years_in_business} onChange={e => setForm(f => ({ ...f, years_in_business: e.target.value }))}><option value="">Select...</option>{["Under 1 year", "1–2 years", "2–3 years", "3–5 years", "5–10 years", "10+ years"].map(o => <option key={o}>{o}</option>)}</select></div>
        <div><label style={S.lbl}>Monthly Revenue Range</label><select style={S.sel} value={form.monthly_revenue_range} onChange={e => setForm(f => ({ ...f, monthly_revenue_range: e.target.value }))}><option value="">Select...</option>{["Under $10K", "$10K–$30K", "$30K–$75K", "$75K–$150K", "$150K–$300K", "Above $300K"].map(o => <option key={o}>{o}</option>)}</select></div>
        <div><label style={S.lbl}>Personal Credit Range</label><select style={S.sel} value={form.personal_credit_range} onChange={e => setForm(f => ({ ...f, personal_credit_range: e.target.value }))}><option value="">Select...</option>{["720+", "680–719", "640–679", "600–639", "Below 600", "Unknown"].map(o => <option key={o}>{o}</option>)}</select></div>
        <div><label style={S.lbl}>Engagement Type</label><select style={S.sel} value={form.engagement_type} onChange={e => setForm(f => ({ ...f, engagement_type: e.target.value }))}><option value="audit">Capital Clarity Audit — $497</option><option value="roadmap">Capital Road Map — $1,200</option><option value="retainer">Advisory Retainer — $397/mo</option></select></div>
      </div>
      <div style={{ marginTop: 12, maxWidth: 660 }}><label style={S.lbl}>Notes</label><textarea style={S.ta} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Referral source, context, concerns..." /></div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={createClient} style={S.btnP} disabled={saving}>{saving ? "Saving..." : "Create Client"}</button>
        <button onClick={() => setView("list")} style={S.btn}>Cancel</button>
        {msg && <span style={{ fontSize: 12, color: "#10B981" }}>{msg}</span>}
      </div>
    </div>
  );

  // ── CLIENT DETAIL ────────────────────────────────────────────────────────

  if (view === "detail" && client) {
    const audit = client.cic_audits?.[0];
    const reports = client.cic_health_reports || [];
    const TABS = [{ k: "overview", l: "Overview" }, { k: "audit", l: "Audit" }, { k: "roadmap", l: "Road Map" }, { k: "docs", l: "Documents" }, { k: "followup", l: "Follow-Up" }, { k: "reports", l: "Reports" }, { k: "ai", l: "✦ AI Strategy" }];

    return (
      <div style={S.wrap}>
        <button onClick={() => setView("list")} style={S.btnBack}>← Back to clients</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={S.h1}>{client.business_name}</div>
            <div style={S.sub}>{client.full_name} · {client.industry} · {client.email}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: `${statusColor(client.engagement_status)}18`, color: statusColor(client.engagement_status) }}>{client.engagement_status}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "rgba(200,146,42,0.1)", color: "#8B6340" }}>{client.engagement_type}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 6, flexWrap: "wrap" as const }}>
          {TABS.map(t => <button key={t.k} style={S.tab(tab === t.k)} onClick={() => setTab(t.k as any)}>{t.l}</button>)}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
              <div style={S.mc}><div style={S.ml}>Monthly Revenue</div><div style={S.mv}>{audit?.avg_monthly_deposits ? fmt(audit.avg_monthly_deposits) : "—"}</div><div style={S.ms}>3-month avg</div></div>
              <div style={S.mc}><div style={S.ml}>Daily Balance</div><div style={{ ...S.mv, color: (audit?.avg_daily_balance||0) >= 10000 ? "#10B981" : (audit?.avg_daily_balance||0) >= 3000 ? "#F59E0B" : "#EF4444" }}>{audit?.avg_daily_balance ? fmt(audit.avg_daily_balance) : "—"}</div><div style={S.ms}>3-month avg</div></div>
              <div style={S.mc}><div style={S.ml}>Readiness Score</div><div style={S.mv}>{audit?.readiness_score || "—"}{audit ? "/40" : ""}</div><div style={S.ms}>{audit?.readiness_grade || "No audit yet"}</div></div>
              <div style={S.mc}><div style={S.ml}>Road Map</div><div style={S.mv}>{client.cic_roadmaps?.length ? `Phase ${client.cic_roadmaps[0].current_phase}` : "—"}</div><div style={S.ms}>{client.cic_roadmaps?.length ? "of 4 phases" : "Not built yet"}</div></div>
            </div>
            {audit?.findings?.length ? (
              <div style={{ ...S.card, marginBottom: 12 }}>
                <div style={S.secHd}>Audit Findings</div>
                {audit.findings.map((f, i) => { const c = findingBg(f.type); return <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.border}`, borderRadius: 7, padding: "7px 11px", marginBottom: 5 }}><div style={{ fontSize: 11, fontWeight: 700, color: c.color }}>{f.icon} {f.title}</div><div style={{ fontSize: 10, color: c.color, opacity: 0.85 }}>{f.body}</div></div>; })}
              </div>
            ) : null}
            {client.cic_roadmaps?.[0]?.next_milestone && (
              <div style={{ ...S.card, background: "#0D1B2A", border: "1px solid rgba(200,146,42,0.2)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#C8922A", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 5 }}>Next Milestone</div>
                <div style={{ fontSize: 13, color: "#E8D5A3", fontWeight: 600 }}>{client.cic_roadmaps[0].next_milestone}</div>
              </div>
            )}
          </div>
        )}

        {/* AUDIT */}
        {tab === "audit" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, maxWidth: 760, marginBottom: 16 }}>
              {[["avg_monthly_deposits","Avg Monthly Deposits (3 Mo)"],["avg_daily_balance","Avg Daily Balance (3 Mo)"],["nsf_count_6mo","NSF Count (6 Mo)"],["negative_days_3mo","Negative Balance Days (3 Mo)"]].map(([k,l]) => (
                <div key={k}><label style={S.lbl}>{l}</label><input style={S.inp} type="number" value={(aForm as any)[k]} onChange={e => setAForm(f => ({ ...f, [k]: e.target.value }))} /></div>
              ))}
              <div><label style={S.lbl}>Revenue Trend</label><select style={S.sel} value={aForm.revenue_trend} onChange={e => setAForm(f => ({ ...f, revenue_trend: e.target.value }))}><option value="growing">Growing</option><option value="stable">Stable</option><option value="seasonal">Seasonal</option><option value="declining">Declining</option></select></div>
            </div>
            <div style={{ maxWidth: 760, marginBottom: 16 }}>
              <div style={S.secHd}>Active Positions</div>
              {aForm.positions.map((pos, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 34px", gap: 8, marginBottom: 7, alignItems: "end" }}>
                  <div>{i===0&&<label style={S.lbl}>Lender / Type</label>}<input style={S.inp} placeholder="e.g. Fundbox MCA" value={pos.lender} onChange={e => setAForm(f => ({ ...f, positions: f.positions.map((p,j) => j===i?{...p,lender:e.target.value}:p) }))} /></div>
                  <div>{i===0&&<label style={S.lbl}>Remaining</label>}<input style={S.inp} type="number" placeholder="$" value={pos.remaining_balance} onChange={e => setAForm(f => ({ ...f, positions: f.positions.map((p,j) => j===i?{...p,remaining_balance:e.target.value}:p) }))} /></div>
                  <div>{i===0&&<label style={S.lbl}>Daily Payment</label>}<input style={S.inp} type="number" placeholder="$" value={pos.daily_payment} onChange={e => setAForm(f => ({ ...f, positions: f.positions.map((p,j) => j===i?{...p,daily_payment:e.target.value}:p) }))} /></div>
                  <button onClick={() => setAForm(f => ({ ...f, positions: f.positions.filter((_,j)=>j!==i) }))} style={{ height:32,width:32,borderRadius:6,border:"1px solid #FCA5A5",background:"#FFF1F2",color:"#991B1B",cursor:"pointer",fontSize:13 }}>×</button>
                </div>
              ))}
              <button onClick={() => setAForm(f => ({ ...f, positions:[...f.positions,{lender:"",remaining_balance:"",daily_payment:""}] }))} style={{ ...S.btn,fontSize:11,padding:"4px 10px" }}>+ Add Position</button>
            </div>
            <div style={{ maxWidth: 760, marginBottom: 14 }}><label style={S.lbl}>Advisor Notes</label><textarea style={S.ta} value={aForm.advisor_notes} onChange={e => setAForm(f => ({ ...f, advisor_notes: e.target.value }))} placeholder="Key observations, context, and recommendations..." /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={saveAudit} style={S.btnP} disabled={saving}>{saving?"Saving...":"Save Audit"}</button>
              {msg && <span style={{ fontSize:12, color:"#10B981" }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* ROAD MAP */}
        {tab === "roadmap" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><label style={S.lbl}>Recommended Product</label><select style={S.sel} value={rm.recommended_product} onChange={e => setRm(r => ({ ...r, recommended_product: e.target.value }))}><option value="">Select...</option>{["MCA","Line of Credit","SBA 7(a)","SBA Microloan","Equipment Financing","Invoice Factoring","Term Loan","CDFI Loan","Not Yet — Building"].map(o=><option key={o}>{o}</option>)}</select></div>
              <div><label style={S.lbl}>Amount Range</label><input style={S.inp} placeholder="e.g. $50K–$75K" value={rm.recommended_amount_range} onChange={e => setRm(r => ({ ...r, recommended_amount_range: e.target.value }))} /></div>
              <div><label style={S.lbl}>Capital Timing</label><select style={S.sel} value={rm.capital_timing} onChange={e => setRm(r => ({ ...r, capital_timing: e.target.value }))}><option value="now">Now — Ready to Apply</option><option value="30-days">30 Days</option><option value="90-days">90 Days</option><option value="6-months">6 Months</option><option value="not-yet">Not Yet — Building</option></select></div>
              <div><label style={S.lbl}>Current Phase</label><select style={S.sel} value={rm.current_phase} onChange={e => setRm(r => ({ ...r, current_phase: parseInt(e.target.value) }))}><option value={1}>Phase 1</option><option value={2}>Phase 2</option><option value={3}>Phase 3</option><option value={4}>Phase 4</option></select></div>
            </div>
            <div style={{ marginBottom: 14 }}><label style={S.lbl}>Next Milestone</label><input style={S.inp} placeholder="e.g. Build average daily balance to $10,000 by Month 3" value={rm.next_milestone} onChange={e => setRm(r => ({ ...r, next_milestone: e.target.value }))} /></div>
            {PHASE_LABELS.map((pl, pi) => (
              <div key={pi} style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: pi+1===rm.current_phase ? "#C8922A" : "var(--ink-2)" }}>{pl}</div>
                  {pi+1===rm.current_phase && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(200,146,42,0.12)", color: "#C8922A" }}>CURRENT</span>}
                </div>
                {rm.phases[pi].map((item, ii) => (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 85px 32px", gap: 7, marginBottom: 7, alignItems: "center" }}>
                    <input style={{ ...S.inp, fontSize:12 }} value={item.task} onChange={e => { const np = rm.phases.map((ph,pI) => pI===pi ? ph.map((it,iI) => iI===ii?{...it,task:e.target.value}:it) : ph); setRm(r => ({ ...r, phases: np })); }} />
                    <select style={{ ...S.sel, fontSize:11 }} value={item.status} onChange={e => { const np = rm.phases.map((ph,pI) => pI===pi ? ph.map((it,iI) => iI===ii?{...it,status:e.target.value as any}:it) : ph); setRm(r => ({ ...r, phases: np })); }}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="complete">Complete ✓</option></select>
                    <select style={{ ...S.sel, fontSize:11 }} value={item.priority} onChange={e => { const np = rm.phases.map((ph,pI) => pI===pi ? ph.map((it,iI) => iI===ii?{...it,priority:e.target.value as any}:it) : ph); setRm(r => ({ ...r, phases: np })); }}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                    <button onClick={() => { const np = rm.phases.map((ph,pI) => pI===pi ? ph.filter((_,iI) => iI!==ii) : ph); setRm(r => ({ ...r, phases: np })); }} style={{ height:32,width:32,borderRadius:5,border:"1px solid #FCA5A5",background:"#FFF1F2",color:"#991B1B",cursor:"pointer",fontSize:12 }}>×</button>
                  </div>
                ))}
                <button onClick={() => { const ni: RoadmapItem = { id:`p${pi}-${Date.now()}`, task:"", status:"pending", priority:"medium" }; const np = rm.phases.map((ph,pI) => pI===pi ? [...ph,ni] : ph); setRm(r => ({ ...r, phases: np })); }} style={{ ...S.btn, fontSize:10, padding:"4px 9px" }}>+ Add Item</button>
              </div>
            ))}
            <div style={{ marginBottom: 14 }}><label style={S.lbl}>Strategy Notes (Internal)</label><textarea style={S.ta} value={rm.advisor_strategy_notes} onChange={e => setRm(r => ({ ...r, advisor_strategy_notes: e.target.value }))} placeholder="Key strategic context, observations, relationship notes..." /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={saveRoadmap} style={S.btnP} disabled={saving}>{saving?"Saving...":"Save Road Map"}</button>
              {msg && <span style={{ fontSize:12, color:"#10B981" }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* DOCUMENTS */}
        {tab === "docs" && (
          <div>
            <div style={{ marginBottom: 10, fontSize: 12, color: "var(--ink-4)" }}>Track which documents have been received from this client.</div>
            <div style={S.card}>
              {docs.map((doc, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: 10, padding: "9px 0", borderBottom: i<docs.length-1 ? "1px solid var(--border)" : "none", alignItems: "center" }}>
                  <input type="checkbox" checked={doc.received} onChange={e => setDocs(d => d.map((x,j) => j===i?{...x,received:e.target.checked}:x))} style={{ width:15,height:15,accentColor:"#C8922A" }} />
                  <div>
                    <div style={{ fontSize:12,fontWeight:600,color:doc.received?"#10B981":"var(--ink-1)" }}>{doc.name}</div>
                    {doc.required && <div style={{ fontSize:8,color:"#EF4444",fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.06em" }}>Required</div>}
                  </div>
                  <div style={{ fontSize:10,color:"var(--ink-4)",whiteSpace:"nowrap" as const }}>Notes:</div>
                  <input style={{ ...S.inp, fontSize:11, padding:"4px 7px" }} placeholder="Optional..." value={doc.notes} onChange={e => setDocs(d => d.map((x,j) => j===i?{...x,notes:e.target.value}:x))} />
                </div>
              ))}
            </div>
            <div style={{ marginTop:6,fontSize:11,color:"var(--ink-4)" }}>{docs.filter(d=>d.received&&d.required).length}/{docs.filter(d=>d.required).length} required documents received</div>
            <div style={{ marginTop:14,display:"flex",gap:10,alignItems:"center" }}>
              <button onClick={() => ok("Checklist noted!")} style={S.btnP}>Save Checklist</button>
              <button onClick={() => setDocs(d => [...d, { name:"",required:false,received:false,notes:"" }])} style={S.btn}>+ Add Document</button>
              {msg && <span style={{ fontSize:12,color:"#10B981" }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* FOLLOW-UP */}
        {tab === "followup" && (
          <div>
            <div style={{ marginBottom:10,fontSize:12,color:"var(--ink-4)" }}>6-touchpoint retention framework for this client.</div>
            {tps.map((tp,i) => {
              const sched = TOUCHPOINT_SCHEDULE[i];
              return (
                <div key={i} style={{ ...S.card, marginBottom:9,borderLeft:`3px solid ${tp.completed?"#10B981":"rgba(200,146,42,0.3)"}` }}>
                  <div style={{ display:"grid",gridTemplateColumns:"auto 1fr auto",gap:10,alignItems:"flex-start" }}>
                    <input type="checkbox" checked={tp.completed} onChange={e => setTps(t => t.map((x,j) => j===i?{...x,completed:e.target.checked}:x))} style={{ width:15,height:15,accentColor:"#C8922A",marginTop:2 }} />
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:tp.completed?"#10B981":"var(--ink-1)",marginBottom:2 }}>{sched?.label||tp.type}</div>
                      <div style={{ fontSize:10,color:"var(--ink-4)",marginBottom:7 }}>{sched?.description}</div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 2fr",gap:9 }}>
                        <div><label style={S.lbl}>Date</label><input style={S.inp} type="date" value={tp.date} onChange={e => setTps(t => t.map((x,j) => j===i?{...x,date:e.target.value}:x))} /></div>
                        <div><label style={S.lbl}>Notes</label><input style={S.inp} placeholder="What was discussed, action items..." value={tp.notes} onChange={e => setTps(t => t.map((x,j) => j===i?{...x,notes:e.target.value}:x))} /></div>
                      </div>
                    </div>
                    <span style={{ fontSize:10,color:tp.completed?"#10B981":"var(--ink-4)",fontWeight:700 }}>{tp.completed?"✓ Done":"Pending"}</span>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:14,display:"flex",gap:10,alignItems:"center" }}>
              <button onClick={saveTouchpoints} style={S.btnP} disabled={saving}>{saving?"Saving...":"Save Touchpoints"}</button>
              {msg && <span style={{ fontSize:12,color:"#10B981" }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* REPORTS */}
        {tab === "reports" && (
          <div>
            {reports.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div style={S.secHd}>Previous Reports</div>
                {reports.map((r,i) => (
                  <div key={i} style={{ ...S.card, marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:600,color:"var(--ink-1)" }}>{new Date(r.report_month).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
                      <div style={{ fontSize:10,color:"var(--ink-4)" }}>Health Score: {r.health_score||"—"} · Change: {r.score_change>0?"+":""}{r.score_change||0}</div>
                    </div>
                    {r.score_change > 0 ? <span style={{ fontSize:11,color:"#10B981",fontWeight:700 }}>↑ Improving</span> : r.score_change < 0 ? <span style={{ fontSize:11,color:"#EF4444",fontWeight:700 }}>↓ Declining</span> : null}
                  </div>
                ))}
              </div>
            )}
            <div style={S.secHd}>Create Monthly Report</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14 }}>
              {[["report_month","Report Month","month"],["monthly_revenue","Monthly Revenue","number"],["avg_daily_balance","Avg Daily Balance","number"],["nsf_count","NSF Count","number"],["debt_payments","Monthly Debt Payments","number"],["personal_credit_score","Personal Credit Score","number"],["business_credit_score","Business Credit (Paydex)","number"],["trade_lines_count","Trade Lines Count","number"],["health_score","Health Score (0–100)","number"],["score_change","Score Change vs Last Month","number"]].map(([k,l,t]) => (
                <div key={k}><label style={S.lbl}>{l}</label><input style={S.inp} type={t} value={(rptForm as any)[k]} onChange={e => setRptForm(f => ({ ...f, [k]: e.target.value }))} /></div>
              ))}
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={S.lbl}>Key Highlights</label>
              {rptForm.highlights.map((h,i) => (
                <div key={i} style={{ display:"grid",gridTemplateColumns:"110px 1fr 32px",gap:7,marginBottom:5 }}>
                  <select style={S.sel} value={h.type} onChange={e => setRptForm(f => ({ ...f, highlights: f.highlights.map((x,j) => j===i?{...x,type:e.target.value as any}:x) }))}><option value="good">✓ Positive</option><option value="warn">⚠ Watch</option><option value="alert">✗ Alert</option></select>
                  <input style={S.inp} placeholder="Highlight text..." value={h.text} onChange={e => setRptForm(f => ({ ...f, highlights: f.highlights.map((x,j) => j===i?{...x,text:e.target.value}:x) }))} />
                  <button onClick={() => setRptForm(f => ({ ...f, highlights: f.highlights.filter((_,j)=>j!==i) }))} style={{ height:32,width:32,borderRadius:5,border:"1px solid #FCA5A5",background:"#FFF1F2",color:"#991B1B",cursor:"pointer",fontSize:12 }}>×</button>
                </div>
              ))}
              <button onClick={() => setRptForm(f => ({ ...f, highlights:[...f.highlights,{type:"good" as const,text:""}] }))} style={{ ...S.btn,fontSize:10,padding:"3px 9px" }}>+ Add</button>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={S.lbl}>Next Steps for Client</label>
              {rptForm.next_steps.map((s,i) => (
                <div key={i} style={{ display:"grid",gridTemplateColumns:"95px 1fr 32px",gap:7,marginBottom:5 }}>
                  <select style={S.sel} value={s.priority} onChange={e => setRptForm(f => ({ ...f, next_steps: f.next_steps.map((x,j) => j===i?{...x,priority:e.target.value as any}:x) }))}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                  <input style={S.inp} placeholder="Action item..." value={s.action} onChange={e => setRptForm(f => ({ ...f, next_steps: f.next_steps.map((x,j) => j===i?{...x,action:e.target.value}:x) }))} />
                  <button onClick={() => setRptForm(f => ({ ...f, next_steps: f.next_steps.filter((_,j)=>j!==i) }))} style={{ height:32,width:32,borderRadius:5,border:"1px solid #FCA5A5",background:"#FFF1F2",color:"#991B1B",cursor:"pointer",fontSize:12 }}>×</button>
                </div>
              ))}
              <button onClick={() => setRptForm(f => ({ ...f, next_steps:[...f.next_steps,{action:"",priority:"medium" as const}] }))} style={{ ...S.btn,fontSize:10,padding:"3px 9px" }}>+ Add</button>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.lbl}>Advisor Summary (sent to client)</label><textarea style={{ ...S.ta, minHeight:90 }} value={rptForm.advisor_summary} onChange={e => setRptForm(f => ({ ...f, advisor_summary: e.target.value }))} placeholder="Plain English monthly summary for the client..." /></div>
            <div style={{ display:"flex",gap:10,alignItems:"center" }}>
              <button onClick={saveReport} style={S.btnP} disabled={saving}>{saving?"Saving...":"Save Report"}</button>
              {msg && <span style={{ fontSize:12,color:"#10B981" }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* AI STRATEGY */}
        {tab === "ai" && (
          <div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:13,fontWeight:600,color:"var(--ink-1)",marginBottom:3 }}>AI Strategy Engine</div>
              <div style={{ fontSize:12,color:"var(--ink-4)",lineHeight:1.6 }}>Generates a comprehensive advisory strategy based on this client's complete profile. Requires audit data for best results. Review carefully before using with client.</div>
            </div>
            {!audit && <div style={{ background:"#FFFBEB",border:"1px solid #FCD34D",borderRadius:7,padding:"9px 13px",marginBottom:12,fontSize:12,color:"#92400E" }}>⚠ Complete the financial audit first for the most accurate strategy.</div>}
            <button onClick={runAI} style={S.btnP} disabled={aiLoading}>{aiLoading?"Generating Strategy...":"✦ Generate AI Strategy"}</button>
            {aiOut && (
              <div style={{ marginTop:18 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                  <div style={S.secHd}>Generated Strategy — Advisor Review Required</div>
                  <button onClick={() => navigator.clipboard.writeText(aiOut)} style={S.btn}>Copy</button>
                </div>
                <div style={{ background:"#0D1B2A",borderRadius:9,padding:"16px 18px",fontFamily:"monospace",fontSize:12,color:"#A8C7E8",lineHeight:1.8,whiteSpace:"pre-wrap" as const,maxHeight:580,overflowY:"auto" as const }}>{aiOut}</div>
                <div style={{ marginTop:8,fontSize:11,color:"var(--ink-4)",fontStyle:"italic" }}>Review before sharing with or acting on behalf of a client.</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── CLIENT LIST ───────────────────────────────────────────────────────────

  return (
    <div style={S.wrap}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18 }}>
        <div><div style={S.h1}>Capital Intelligence</div><div style={S.sub}>Advisory client management</div></div>
        <button onClick={() => setView("new")} style={S.btnP}>+ New Client</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20 }}>
        <div style={S.mc}><div style={S.ml}>Total Clients</div><div style={S.mv}>{totalClients}</div><div style={S.ms}>All engagements</div></div>
        <div style={S.mc}><div style={S.ml}>Active Retainers</div><div style={S.mv}>{activeRetainers}</div><div style={S.ms}>${mrr.toLocaleString()}/mo MRR</div></div>
        <div style={S.mc}><div style={S.ml}>Audits Complete</div><div style={S.mv}>{auditsComplete}</div><div style={S.ms}>of {totalClients}</div></div>
        <div style={S.mc}><div style={S.ml}>Road Maps Built</div><div style={S.mv}>{roadmapsBuilt}</div><div style={S.ms}>of {totalClients}</div></div>
        <div style={S.mc}><div style={S.ml}>Monthly Revenue</div><div style={S.mv}>${mrr.toLocaleString()}</div><div style={S.ms}>Retainer base</div></div>
      </div>
      <div style={S.card}>
        <div style={{ display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 1fr 1fr 1fr",gap:10,padding:"7px 12px",borderBottom:"1px solid var(--border)",marginBottom:3 }}>
          {["Business","Owner / Industry","Status","Audit","Road Map","Retainer"].map(h => <div key={h} style={{ fontSize:9,fontWeight:700,color:"var(--ink-4)",textTransform:"uppercase" as const,letterSpacing:"0.08em" }}>{h}</div>)}
        </div>
        {loading ? <div style={{ padding:24,textAlign:"center" as const,color:"var(--ink-4)",fontSize:13 }}>Loading clients...</div> :
         clients.length === 0 ? <div style={{ padding:32,textAlign:"center" as const }}><div style={{ fontSize:13,color:"var(--ink-4)",marginBottom:9 }}>No CIC clients yet.</div><button onClick={() => setView("new")} style={S.btnP}>Add your first client</button></div> :
         clients.map(c => (
          <div key={c.id} onClick={() => openClient(c)} style={{ display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 1fr 1fr 1fr",gap:10,padding:"10px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",transition:"background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background="var(--parchment-2)")} onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
            <div><div style={{ fontSize:13,fontWeight:600,color:"var(--ink-1)" }}>{c.business_name}</div><div style={{ fontSize:11,color:"var(--ink-4)" }}>{c.monthly_revenue_range||"—"}</div></div>
            <div><div style={{ fontSize:12,color:"var(--ink-2)" }}>{c.full_name}</div><div style={{ fontSize:11,color:"var(--ink-4)" }}>{c.industry||"—"}</div></div>
            <div><span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5,background:`${statusColor(c.engagement_status)}18`,color:statusColor(c.engagement_status) }}>{c.engagement_status}</span></div>
            <div style={{ fontSize:11,color:c.cic_audits?.length?"#10B981":"var(--ink-4)",fontWeight:c.cic_audits?.length?600:400 }}>{c.cic_audits?.length?`✓ ${c.cic_audits[0].readiness_grade}`:"Pending"}</div>
            <div style={{ fontSize:11,color:c.cic_roadmaps?.length?"#10B981":"var(--ink-4)",fontWeight:c.cic_roadmaps?.length?600:400 }}>{c.cic_roadmaps?.length?`✓ Phase ${c.cic_roadmaps[0].current_phase}`:"Not built"}</div>
            <div>{c.cic_retainers?.[0] ? <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5,background:c.cic_retainers[0].status==="active"?"#F0FDF4":"#FFF1F2",color:c.cic_retainers[0].status==="active"?"#166534":"#991B1B" }}>{c.cic_retainers[0].status}</span> : <span style={{ fontSize:11,color:"var(--ink-4)" }}>—</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
