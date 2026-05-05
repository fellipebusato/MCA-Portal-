"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Payment = {
  id: number;
  invoice: string;
  payment_date: string;
  ach_date: string;
  settlement_date: string;
  description: string;
  credit: number;
  debit: number;
  returns: number;
  running_balance: number | null;
};

type Client = {
  id: number;
  business_name: string;
  invoice: string;
  owner_name: string;
  client_email: string;
  funded_date: string;
  funded: number;
  payback: number;
  balance: number;
  payment: number;
  total_term: number;
  payment_frequency: "daily" | "weekly";
  payment_day: string | null;
  status: string;
  avg_monthly_revenue?: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function money(n: number) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function fmt(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const HOLIDAYS = new Set([
  "2025-01-01","2025-01-20","2025-02-17","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-10-13","2025-11-11","2025-11-27","2025-12-25",
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18","2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
  "2028-01-01","2028-01-17","2028-02-21","2028-05-29","2028-06-19","2028-07-04","2028-09-04","2028-10-09","2028-11-11","2028-11-23","2028-12-25",
]);
function isWeekend(d: Date) { return d.getDay()===0||d.getDay()===6; }
function isHoliday(d: Date) { return HOLIDAYS.has(toStr(d)); }
function isBizDay(d: Date) { return !isWeekend(d) && !isHoliday(d); }
function addBizDays(d: Date, n: number): Date {
  const r = new Date(d); let a=0;
  while(a<n){r.setDate(r.getDate()+1);if(isBizDay(r))a++;}
  return r;
}

const DAY_MAP: Record<string,number> = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getNextPaymentDay(client: Client): { label: string; amount: number } | null {
  const today = new Date(); today.setHours(0,0,0,0);
  if (client.payment_frequency === "daily") {
    const next = new Date(today); next.setDate(next.getDate()+1);
    while(!isBizDay(next)) next.setDate(next.getDate()+1);
    const diff = Math.ceil((next.getTime()-today.getTime())/(864e5));
    return { label: diff===1 ? `Tomorrow, ${DAY_NAMES[next.getDay()]}` : DAY_NAMES[next.getDay()], amount: Number(client.payment) };
  }
  if (client.payment_frequency === "weekly" && client.payment_day) {
    const target = DAY_MAP[client.payment_day.toLowerCase()] ?? 5;
    const next = new Date(today); next.setDate(next.getDate()+1);
    while(next.getDay()!==target) next.setDate(next.getDate()+1);
    if(isHoliday(next)){do{next.setDate(next.getDate()+1);}while(next.getDay()!==1);while(!isBizDay(next))next.setDate(next.getDate()+1);}
    const diff = Math.ceil((next.getTime()-today.getTime())/(864e5));
    const label = diff===1 ? "Tomorrow" : diff<=7 ? `This ${DAY_NAMES[next.getDay()]}` : `${DAY_NAMES[next.getDay()]}, ${MONTH_NAMES[next.getMonth()]} ${next.getDate()}`;
    return { label, amount: Number(client.payment) };
  }
  return null;
}

function buildTermDays(client: Client): Set<string> {
  const days = new Set<string>();
  if (!client.funded_date || !client.total_term) return days;
  const start = new Date(client.funded_date + "T00:00:00");
  let count = 0;

  if (client.payment_frequency === "weekly" && client.payment_day) {
    const target = DAY_MAP[client.payment_day.toLowerCase()] ?? 5;
    const cursor = new Date(start);
    while(cursor.getDay()!==target) cursor.setDate(cursor.getDate()+1);
    while(count<client.total_term) {
      let pd = new Date(cursor);
      if(isHoliday(pd)){do{pd.setDate(pd.getDate()+1);}while(pd.getDay()!==1);while(!isBizDay(pd))pd.setDate(pd.getDate()+1);}
      days.add(toStr(pd)); count++;
      cursor.setDate(cursor.getDate()+7);
    }
  } else {
    const cursor = new Date(start);
    while(count<client.total_term) {
      if(isBizDay(cursor)){days.add(toStr(cursor));count++;}
      cursor.setDate(cursor.getDate()+1);
    }
  }
  return days;
}

// ── Pending payments helper ────────────────────────────────────────────────
function getPending(payments: Payment[]): { count: number; total: number } {
  const today = new Date(); today.setHours(0,0,0,0);
  let count=0, total=0;
  for(const p of payments){
    if(!p.settlement_date) continue;
    const desc=(p.description||"").toLowerCase();
    if(desc.includes("missed")||desc.includes("return")) continue;
    const sd=new Date(p.settlement_date); sd.setHours(0,0,0,0);
    if(sd>today && p.debit>0){count++;total+=Number(p.debit);}
  }
  return{count,total};
}

// ── DTI calculation ────────────────────────────────────────────────────────
function calcDTI(client: Client): string | null {
  if (!client.avg_monthly_revenue || client.avg_monthly_revenue === 0) return null;
  const rev = Number(client.avg_monthly_revenue);
  const pmt = Number(client.payment);
  if (client.payment_frequency === "daily") {
    // ~20 daily payments per month
    return ((20 * pmt / rev) * 100).toFixed(1) + "%";
  }
  // weekly × 4
  return ((4 * pmt / rev) * 100).toFixed(1) + "%";
}

// ── Milestone banner ───────────────────────────────────────────────────────
function getMilestone(pct: number, bad: boolean): { icon: string; title: string; msg: string; variant: "gold"|"sage"|"sienna" } | null {
  if (bad) {
    if(pct>=75) return{icon:"⚡",title:"Almost there — don't stop now.",msg:"You're 75% of the way through. Catching up now protects your track record and keeps future funding options open.",variant:"sienna"};
    if(pct>=50) return{icon:"⚡",title:"Halfway there — get current to finish strong.",msg:"You've paid half your balance. Reaching out now is always the right move — Fellipe is here to help.",variant:"sienna"};
    if(pct>=25) return{icon:"⚡",title:"Good progress — catch up to keep it going.",msg:"You're a quarter of the way there. Getting current now will protect your standing and future funding relationship.",variant:"sienna"};
    return{icon:"⚡",title:"Catch up on payments to finish strong.",msg:"Every payment moves you forward. Reach out if you need to discuss options — Fellipe is here to help.",variant:"sienna"};
  }
  if(pct>=75) return{icon:"🏁",title:"75% paid — almost there.",msg:"Your payment track record is building. Consistent history at this stage strengthens your profile for future funding.",variant:"sage"};
  if(pct>=50) return{icon:"🏛️",title:"Halfway milestone — your track record is building.",msg:"You've paid half your balance. Clients in good standing at this stage often qualify for renewal funding. Contact Fellipe to learn more.",variant:"gold"};
  if(pct>=25) return{icon:"💪",title:"Approaching the 25% milestone — great start.",msg:"You're a quarter of the way there. Keep the momentum going.",variant:"sage"};
  return null;
}

type Props = {
  selectedClient: Client;
  payments: Payment[];
  isAdminView?: boolean;
  onPaymentAdded?: () => void;
};

export default function ClientDashboard({ selectedClient, payments, isAdminView, onPaymentAdded }: Props) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // ── Auto-settle pending payments on load ──────────────────────────────
  useEffect(() => {
    autoSettlePending();
  }, [selectedClient.invoice]);

  async function autoSettlePending() {
    const now = new Date(); now.setHours(0,0,0,0);
    for (const p of payments) {
      if (!p.settlement_date) continue;
      const desc = (p.description || "").toLowerCase();
      if (desc.includes("missed") || desc.includes("return") || desc.includes("initial")) continue;
      if (p.debit <= 0) continue;
      const sd = new Date(p.settlement_date); sd.setHours(0,0,0,0);
      // If settlement date has passed and balance not yet applied (running_balance is null)
      if (sd <= now && p.running_balance === null) {
        const currentBalance = Number(selectedClient.balance || 0);
        const newBalance = Math.max(currentBalance - Number(p.debit), 0);
        await supabase.from("payments").update({ running_balance: newBalance, description: "Posted" }).eq("id", p.id);
        await supabase.from("clients").update({ balance: newBalance }).eq("id", selectedClient.id);
      }
    }
  }

  const isWeekly = selectedClient.payment_frequency === "weekly";
  const payDay = (selectedClient.payment_day || "").toLowerCase();
  const pct = Math.max(0, Math.min(100, 100 - (Number(selectedClient.balance||0) / Number(selectedClient.payback||1)) * 100));
  const totalPaid = Number(selectedClient.payback||0) - Number(selectedClient.balance||0);
  const nextPayment = getNextPaymentDay(selectedClient);
  const { count: pendingCount, total: pendingTotal } = getPending(payments);
  const pendingBalance = Math.max(0, Number(selectedClient.balance||0) - pendingTotal);
  const dti = calcDTI(selectedClient);

  // Standing
  const returned = payments.filter(p => { const d=(p.description||"").toLowerCase(); return d.includes("return")||d.includes("missed"); });
  const badStanding = isWeekly ? returned.length>=1 : returned.length>=2;
  const milestone = getMilestone(pct, badStanding);

  // Payment day sets
  const termDays = buildTermDays(selectedClient);
  const receivedDays = new Set<string>();
  const missedDays = new Set<string>();
  const holidayMovedDays = new Set<string>();
  for (const p of payments) {
    const d = (p.ach_date || p.payment_date || "").split("T")[0];
    const desc = (p.description||"").toLowerCase();
    if (desc.includes("missed")||desc.includes("return")) { if(d) missedDays.add(d); }
    else if (!desc.includes("initial") && p.debit>0) { if(d) receivedDays.add(d); }
  }
  if (isWeekly && payDay) {
    const target = DAY_MAP[payDay] ?? 5;
    for (const ds of Array.from(termDays)) {
      const d = new Date(ds+"T00:00:00");
      if(d.getDay()!==target) holidayMovedDays.add(ds);
    }
  }

  // Term end date
  let termEnd: Date | null = null;
  if (selectedClient.funded_date && selectedClient.total_term) {
    if (isWeekly && payDay) {
      const sorted = Array.from(termDays).sort();
      if(sorted.length>0) termEnd = new Date(sorted[sorted.length-1]+"T00:00:00");
    } else {
      termEnd = addBizDays(new Date(selectedClient.funded_date+"T00:00:00"), selectedClient.total_term);
    }
  }

  // Calendar bounds
  const fundedDate = selectedClient.funded_date ? new Date(selectedClient.funded_date+"T00:00:00") : null;
  const calMinYear = fundedDate ? fundedDate.getFullYear() : today.getFullYear();
  const calMinMonth = fundedDate ? Math.max(0, fundedDate.getMonth()-1) : 0;
  const sixOut = new Date(today.getFullYear(), today.getMonth()+6, 1);
  const calMaxDate = termEnd && termEnd>sixOut ? termEnd : sixOut;
  const canPrev = calYear>calMinYear||(calYear===calMinYear&&calMonth>calMinMonth);
  const canNext = calYear<calMaxDate.getFullYear()||(calYear===calMaxDate.getFullYear()&&calMonth<calMaxDate.getMonth());

  function prevMonth(){if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}
  function nextMonth(){if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}

  // Build calendar days for current view
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth+1, 0);
  const calDays: (Date|null)[] = [];
  for(let i=0;i<firstDay.getDay();i++) calDays.push(null);
  for(let d=1;d<=lastDay.getDate();d++) calDays.push(new Date(calYear,calMonth,d));

  // Sorted payments newest first for history
  const sortedPayments = [...payments].reverse();

  const variantBg: Record<string,string> = {
    gold: "linear-gradient(135deg, rgba(160,120,64,0.07), rgba(160,120,64,0.02))",
    sage: "var(--sage-surface)",
    sienna: "var(--sienna-surface)",
  };
  const variantBorder: Record<string,string> = { gold:"var(--gold-border)", sage:"var(--sage-border)", sienna:"var(--sienna-border)" };
  const variantTitle: Record<string,string> = { gold:"var(--gold)", sage:"var(--sage)", sienna:"var(--sienna)" };

  // Section card style
  const sCard: React.CSSProperties = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:24, marginBottom:16, boxShadow:"0 1px 4px rgba(30,16,4,0.06)", position:"relative", overflow:"hidden" };
  const sCardRule = <div style={{position:"absolute",top:0,left:22,right:22,height:1,background:"linear-gradient(90deg,transparent,var(--gold-border),transparent)"}} />;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:"var(--ink-1)" }}>

      {/* ── Welcome banner ── */}
      <div style={{ background:"linear-gradient(135deg,var(--ink-1) 0%,#2C1F12 100%)", borderRadius:20, padding:"28px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, boxShadow:"0 8px 40px rgba(30,16,4,0.12)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(196,154,90,0.3),transparent)" }} />
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"rgba(196,154,90,0.5)", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:6 }}>Welcome back</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:400, color:"#F2EDE4", letterSpacing:"-0.02em", lineHeight:1 }}>
            Good morning, <em style={{ fontStyle:"italic", color:"var(--gold-bright)" }}>{selectedClient.owner_name || selectedClient.business_name}.</em>
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", marginTop:8 }}>
            {selectedClient.invoice} &nbsp;·&nbsp; Member since {MONTH_NAMES[new Date(selectedClient.funded_date+"T00:00:00").getMonth()]} {new Date(selectedClient.funded_date+"T00:00:00").getFullYear()} &nbsp;·&nbsp; {isWeekly ? "Weekly" : "Daily"} plan
          </div>
        </div>
        {nextPayment && (
          <div style={{ position:"relative", zIndex:1, textAlign:"right" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"rgba(196,154,90,0.5)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>Next payment</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:400, color:"var(--gold-bright)", letterSpacing:"-0.01em" }}>{nextPayment.label}</div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontVariantNumeric:"normal", fontSize:13, color:"rgba(255,255,255,0.35)", marginTop:3 }}>{money(nextPayment.amount)} ACH debit</div>
            {pendingCount > 0 && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:5, marginTop:8, background:"rgba(196,154,90,0.1)", border:"1px solid rgba(196,154,90,0.2)", color:"var(--gold-muted)", fontSize:11, fontWeight:500, padding:"4px 10px", borderRadius:20 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {pendingCount} pending settlement
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main layout: left content + right calendar ── */}
      <div style={{ display:"flex", gap:22, alignItems:"flex-start" }}>

        {/* Left column */}
        <div style={{ flex:1, minWidth:0 }}>

          {/* Stat cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:16 }}>
            {[
              { label:"Current balance", value:money(Number(selectedClient.balance||0)), sub: pendingCount>0 ? `${money(pendingBalance)} once ${pendingCount} payment${pendingCount>1?"s":""} settle${pendingCount===1?"s":""}` : "Settled payments only" },
              { label:`${isWeekly?"Weekly":"Daily"} payment`, value:money(Number(selectedClient.payment||0)), sub: nextPayment ? `Next: ${nextPayment.label}` : "—" },
              { label:"Total funded", value:money(Number(selectedClient.funded||0)), sub:"Original advance" },
              { label:"Total payback", value:money(Number(selectedClient.payback||0)), sub: dti ? `${dti} of avg monthly revenue` : "Full repayment amount" },
            ].map((c,i) => (
              <div key={i} style={sCard}>
                {sCardRule}
                <div style={{ fontSize:11, fontWeight:600, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>{c.label}</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontVariantNumeric:"normal", fontSize:20, fontWeight:500, color:"var(--ink-1)", letterSpacing:"-0.02em" }}>{c.value}</div>
                <div style={{ fontSize:11, color: pendingCount>0 && i===0 ? "var(--sky)" : "var(--ink-4)", marginTop:5 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Pending info bar */}
          {pendingCount > 0 && (
            <div style={{ background:"var(--sky-surface)", border:"1px solid var(--sky-border)", borderRadius:12, padding:"12px 18px", marginBottom:16 }}>
              <div style={{ fontSize:12, color:"var(--sky)" }}>
                <strong>{pendingCount} payment{pendingCount>1?"s":""} totaling {money(pendingTotal)}</strong> {pendingCount===1?"takes":"take"} 4 business days to settle from the ACH debit date. {pendingCount===1?"It is":"They are"} shown in your history but will apply to your balance on the settlement date.
              </div>
            </div>
          )}

          {/* Progress */}
          <div style={{ ...sCard, padding:30 }}>
            {sCardRule}
            <div style={{ position:"absolute", right:24, bottom:14, fontFamily:"'Cormorant Garamond',serif", fontSize:96, fontWeight:400, color:"var(--parchment-3)", lineHeight:1, letterSpacing:"-0.04em", userSelect:"none", zIndex:0 }}>
              {Math.round(pct)}%
            </div>
            <div style={{ position:"relative", zIndex:1 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Repayment progress</div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:50, fontWeight:400, color:"var(--gold)", letterSpacing:"-0.03em", lineHeight:1 }}>{Math.round(pct)}%</div>
                  <div style={{ fontSize:12, color:"var(--ink-2)", marginTop:4 }}>{money(totalPaid)} paid toward your balance</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:12, color:"var(--ink-3)" }}>{money(Number(selectedClient.balance||0))} remaining</div>
                  {termEnd && <div style={{ fontSize:11, color:"var(--ink-4)", marginTop:3 }}>Est. completion: {fmt(toStr(termEnd))} · may vary</div>}
                </div>
              </div>
              <div style={{ height:7, background:"var(--parchment-3)", borderRadius:4, overflow:"hidden", marginBottom:12, boxShadow:"inset 0 1px 2px rgba(0,0,0,0.05)" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,var(--gold),var(--gold-bright))", borderRadius:4, boxShadow:"2px 0 8px rgba(160,120,64,0.25)", position:"relative" }}>
                  <div style={{ position:"absolute", top:0, right:-1, bottom:0, width:3, background:"var(--gold-muted)", borderRadius:2, boxShadow:"0 0 8px rgba(196,154,90,0.5)" }} />
                </div>
              </div>
              <div style={{ display:"flex", gap:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--ink-3)" }}>
                  <div style={{ width:10, height:3, borderRadius:1, background:"var(--gold)" }} />Paid to date
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--ink-4)" }}>
                  <div style={{ width:10, height:3, borderRadius:1, background:"var(--parchment-3)" }} />Remaining
                </div>
              </div>
            </div>
          </div>

          {/* Milestone */}
          {milestone && (
            <div style={{ background: variantBg[milestone.variant], border:`1px solid ${variantBorder[milestone.variant]}`, borderRadius:14, padding:"22px 24px", display:"flex", alignItems:"flex-start", gap:16, marginBottom:16, boxShadow:"0 1px 4px rgba(30,16,4,0.06)" }}>
              <div style={{ width:42, height:42, borderRadius:12, background:"var(--gold-surface)", border:"1px solid var(--gold-border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, flexShrink:0 }}>{milestone.icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:variantTitle[milestone.variant], letterSpacing:"-0.01em", marginBottom:5 }}>{milestone.title}</div>
                <div style={{ fontSize:12, color:"var(--ink-2)", lineHeight:1.6 }}>{milestone.msg}</div>
              </div>
            </div>
          )}

          {/* Standing */}
          {!milestone && (
            !badStanding ? (
              <div style={{ background:"var(--sage-surface)", border:"1px solid var(--sage-border)", borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(90,138,106,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--sage)" }}>Account in good standing</div>
                  <div style={{ fontSize:11, color:"var(--ink-2)", marginTop:2 }}>Your payments are up to date. Keep it up.</div>
                </div>
              </div>
            ) : (
              <div style={{ background:"var(--sienna-surface)", border:"1px solid var(--sienna-border)", borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(154,90,58,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 4v4M7 10v.5" stroke="var(--sienna)" strokeWidth="1.8" strokeLinecap="round"/><circle cx="7" cy="7" r="6" stroke="var(--sienna)" strokeWidth="1.2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--sienna)" }}>Account needs attention</div>
                  <div style={{ fontSize:11, color:"var(--ink-2)", marginTop:2 }}>Please contact Fellipe to discuss getting current.</div>
                </div>
              </div>
            )
          )}

          {/* Payment panel */}
          <div style={sCard}>
            {sCardRule}
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:500, color:"var(--ink-1)", marginBottom:4 }}>Make a payment</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginBottom:18, lineHeight:1.5 }}>Every payment reduces your balance dollar for dollar. Paying ahead of schedule accelerates your path to renewal eligibility.</div>
            <a href="https://paycfg.com" target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", width:"100%", alignItems:"center", justifyContent:"center", gap:8, background:"var(--ink-1)", color:"var(--gold-muted)", border:"1px solid rgba(196,154,90,0.2)", padding:13, borderRadius:10, fontSize:13, fontWeight:500, textDecoration:"none", marginBottom:10, boxShadow:"0 2px 8px rgba(30,16,4,0.12)", transition:"all 0.2s" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="4" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 4V3a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Pay online
            </a>
            <div style={{ fontSize:11, color:"var(--ink-4)", marginBottom:12 }}>Online payments include a 3.5% processing fee. For a {money(Number(selectedClient.payment||0))} payment, submit {money(Number(selectedClient.payment||0)*1.035)}.</div>
            <div style={{ background:"var(--parchment-2)", border:"1px solid var(--border)", borderRadius:10, padding:"13px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:"var(--ink-2)" }}>Zelle &nbsp;·&nbsp; invoices@cfgms.com</div>
                <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>Include invoice {selectedClient.invoice} or your business name &nbsp;·&nbsp; no fee</div>
              </div>
              <div style={{ fontSize:11, color:"var(--sage)", fontWeight:500 }}>Recommended</div>
            </div>
          </div>

          {/* Payment history */}
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(30,16,4,0.06)", position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:22, right:22, height:1, background:"linear-gradient(90deg,transparent,var(--gold-border),transparent)", zIndex:1 }} />
            <div style={{ padding:"18px 22px", borderBottom:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:500, color:"var(--ink-1)" }}>Payment history</div>
              <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>{payments.length} transaction{payments.length!==1?"s":""}{payments.length>0 ? ` · ${money(payments.filter(p=>p.debit>0).reduce((s,p)=>s+Number(p.debit),0))} received` : ""}</div>
            </div>
            <div style={{ maxHeight:520, overflowY:"scroll", overflowX:"auto", scrollbarWidth:"thin", scrollbarColor:"var(--parchment-3) var(--parchment-2)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", minWidth:540 }}>
                <thead>
                  <tr style={{ background:"var(--parchment-2)", position:"sticky", top:0, zIndex:2 }}>
                    {["ACH date","Settles","Amount","Balance after","Status"].map(h=>(
                      <th key={h} style={{ padding:"10px 22px", fontSize:11, fontWeight:600, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.09em", textAlign:"left", borderBottom:"1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPayments.map((p,i)=>{
                    const sd = p.settlement_date ? new Date(p.settlement_date) : null;
                    const now = new Date(); now.setHours(0,0,0,0);
                    if(sd) sd.setHours(0,0,0,0);
                    const isPending = sd && sd>now && !(p.description||"").toLowerCase().includes("missed");
                    const isRet = (p.description||"").toLowerCase().includes("return")||p.returns>0;
                    const isMissed = (p.description||"").toLowerCase().includes("missed");
                    const amt = p.debit>0?p.debit:p.returns>0?p.returns:p.credit;
                    return(
                      <tr key={p.id||i} style={{ borderBottom:"1px solid var(--border)" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--surface-2)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                        <td style={{ padding:"14px 22px", fontFamily:"'DM Mono',monospace", fontVariantNumeric:"normal", fontSize:13, color:"var(--ink-2)" }}>{fmt(p.ach_date||p.payment_date)}</td>
                        <td style={{ padding:"14px 22px", fontFamily:"'DM Mono',monospace", fontVariantNumeric:"normal", fontSize:13, color: isPending?"var(--sky)":"var(--ink-5)" }}>{p.settlement_date?fmt(p.settlement_date):"—"}</td>
                        <td style={{ padding:"14px 22px", fontFamily:"'DM Mono',monospace", fontVariantNumeric:"normal", fontSize:12, fontWeight:500, color: isRet?"var(--sienna)":isMissed?"var(--sienna)":isPending?"var(--sky)":"var(--ink-2)" }}>{amt>0?money(Number(amt)):"—"}</td>
                        <td style={{ padding:"14px 22px", fontFamily:"'DM Mono',monospace", fontVariantNumeric:"normal", fontSize:12, color: isPending?"var(--ink-5)":"var(--ink-3)" }}>
                          {isPending ? <em style={{ fontStyle:"italic", fontSize:11, color:"var(--ink-4)" }}>settling…</em> : p.running_balance!=null ? money(Number(p.running_balance)) : "—"}
                        </td>
                        <td style={{ padding:"14px 22px" }}>
                          {isPending ? (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 11px", borderRadius:6, background:"rgba(74,126,160,0.15)", border:"1.5px solid rgba(74,126,160,0.4)", color:"#4A7EA0", fontSize:11, fontWeight:700, letterSpacing:"0.01em" }}>
                              <span style={{ width:6,height:6,borderRadius:"50%",background:"#4A7EA0",display:"inline-block" }} /> Pending
                            </span>
                          ) : isRet||isMissed ? (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 11px", borderRadius:6, background:"rgba(200,60,30,0.12)", border:"1.5px solid rgba(200,60,30,0.45)", color:"#C83C1E", fontSize:11, fontWeight:700, letterSpacing:"0.01em" }}>
                              <span style={{ width:6,height:6,borderRadius:"50%",background:"#C83C1E",display:"inline-block" }} /> {isRet?"Returned":"Missed"}
                            </span>
                          ) : (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 11px", borderRadius:6, background:"rgba(60,140,90,0.12)", border:"1.5px solid rgba(60,140,90,0.35)", color:"#2D7A4F", fontSize:11, fontWeight:700, letterSpacing:"0.01em" }}>
                              <span style={{ width:6,height:6,borderRadius:"50%",background:"#2D7A4F",display:"inline-block" }} /> Posted
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {payments.length===0&&(
                    <tr><td colSpan={5} style={{ padding:"40px", textAlign:"center", fontSize:13, color:"var(--ink-3)", fontFamily:"'Cormorant Garamond',serif", fontStyle:"italic" }}>No payment history yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>{/* end left */}

        {/* Right: calendar sidebar */}
        <div style={{ width:220, flexShrink:0, position:"sticky", top:80 }}>
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(30,16,4,0.06)", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:16, right:16, height:1, background:"linear-gradient(90deg,transparent,var(--gold-border),transparent)" }} />
            <div style={{ fontSize:12, fontWeight:600, color:"var(--ink-2)", marginBottom:2 }}>Payment calendar</div>
            <div style={{ fontSize:11, color:"var(--ink-4)", marginBottom:14 }}>
              {selectedClient.total_term} {isWeekly?"weekly":"business day"} term{termEnd?` · ends ${fmt(toStr(termEnd))}`:""}
            </div>

            {/* Month nav */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <button onClick={prevMonth} disabled={!canPrev} style={{ background:"none", border:"none", color:"var(--ink-3)", cursor:canPrev?"pointer":"default", fontSize:16, padding:"2px 6px", borderRadius:5, opacity:canPrev?1:0.3 }}>‹</button>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontWeight:500, color:"var(--ink-2)", letterSpacing:"-0.01em" }}>{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={nextMonth} disabled={!canNext} style={{ background:"none", border:"none", color:"var(--ink-3)", cursor:canNext?"pointer":"default", fontSize:16, padding:"2px 6px", borderRadius:5, opacity:canNext?1:0.3 }}>›</button>
            </div>

            {/* Day headers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:3 }}>
              {["S","M","T","W","T","F","S"].map((d,i)=>(
                <div key={i} style={{ textAlign:"center", fontSize:9, fontWeight:600, color:"var(--ink-4)", padding:"3px 0", textTransform:"uppercase", letterSpacing:"0.05em" }}>{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
              {calDays.map((date,idx)=>{
                if(!date) return <div key={`p${idx}`} style={{ aspectRatio:"1" }} />;
                const ds = toStr(date);
                const isToday = ds===toStr(today);
                const isWknd = isWeekend(date);
                const isHol = isHoliday(date);
                const inTerm = termDays.has(ds);
                const received = receivedDays.has(ds);
                const missed = missedDays.has(ds);
                const moved = holidayMovedDays.has(ds);
                let bg="", color=isWknd?"var(--ink-5)":"var(--ink-2)";
                if(isHol){bg="rgba(160,120,64,0.25)";color="#8B6420";}
                else if(received){bg="rgba(45,122,79,0.2)";color="#1A5C35";}
                else if(missed){bg="rgba(200,60,30,0.2)";color="#C83C1E";}
                else if(moved){bg="rgba(160,120,64,0.2)";color="#8B6420";}
                else if(inTerm){bg="rgba(74,126,160,0.15)";color="#2E6A96";}
                return(
                  <div key={ds} style={{ aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:5, fontSize:11, fontWeight:isToday?700:500, background:bg, color, outline: isToday?"1.5px solid var(--gold)":"none", outlineOffset:-1 }}>
                    {date.getDate()}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid var(--border)", display:"flex", flexDirection:"column", gap:5 }}>
              {[
                { bg:"rgba(74,126,160,0.2)", border:"1.5px solid rgba(74,126,160,0.5)", label:"Expected", labelColor:"#4A7EA0" },
                { bg:"rgba(45,122,79,0.2)", border:"1.5px solid rgba(45,122,79,0.5)", label:"Received", labelColor:"#2D7A4F" },
                { bg:"rgba(200,60,30,0.2)", border:"1.5px solid rgba(200,60,30,0.5)", label:"Returned", labelColor:"#C83C1E" },
                { bg:"rgba(160,120,64,0.2)", border:"1.5px solid rgba(160,120,64,0.4)", label:"Holiday", labelColor:"var(--gold)" },
              ].map(l=>(
                <div key={l.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:l.bg, border:l.border, flexShrink:0 }} />
                  <span style={{ fontSize:11, color:l.labelColor, fontWeight:600 }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Need help */}
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"16px 18px", marginTop:14, boxShadow:"0 1px 4px rgba(30,16,4,0.06)" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--ink-2)", marginBottom:6 }}>Need help?</div>
            <div style={{ fontSize:11, color:"var(--ink-3)", lineHeight:1.5 }}>
              Contact Fellipe directly for any questions about your account.
            </div>
            <div style={{ marginTop:10, fontSize:11, color:"var(--ink-2)", fontWeight:500 }}>fbusato@cfgms.com</div>
            <div style={{ fontSize:11, color:"var(--ink-3)" }}>+1 (917) 920-0881</div>
          </div>
        </div>

      </div>{/* end layout */}

      {/* Footer */}
      <div style={{ marginTop:40, textAlign:"center", fontSize:11, color:"var(--ink-4)", lineHeight:1.6 }}>
        This portal is a personal organizational tool operated independently by Fellipe Busato.<br />
        It is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity.<br />
        Information displayed is for informational purposes only and does not constitute an official financial record.
      </div>

    </div>
  );
}