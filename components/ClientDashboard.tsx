"use client";

import { useState, useEffect } from "react";
import PaymentHistory from "./PaymentHistory";
import ActivityLog from "./ActivityLog";
import FundingsPanel from "./FundingsPanel";
import { CONTACT, PAYMENT_LINK } from "@/lib/config";
import {
  toDateStr, isWeekend, isHoliday, isBusinessDay,
  addBusinessDays, formatDate, money,
} from "@/lib/holidays";
import type { Client, Payment } from "@/lib/types";

type ClientDashboardProps = {
  selectedClient: Client;
  payments: Payment[];
  isAdminView?: boolean;
  onPaymentAdded?: () => void;
};

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};
const DAY_NUM_TO_NAME = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// ── Status config ────────────────────────────────────────────────────────────
function getStatusConfig(status: string) {
  switch (status) {
    case "Good Standing":
      return { bg: "var(--sage-surface)", border: "var(--sage-border)", color: "var(--sage)", dot: "var(--sage)", label: "Account in good standing", sub: "Your payments are up to date. Keep it up.", icon: "check" };
    case "Paused":
      return { bg: "rgba(196,140,40,0.08)", border: "rgba(196,140,40,0.25)", color: "#a07010", dot: "#c48c28", label: "Account paused", sub: "Payments are temporarily paused. ACH will resume on the scheduled end date.", icon: "pause" };
    case "Blocked":
      return { bg: "var(--ink-1)", border: "var(--ink-1)", color: "rgba(255,255,255,0.9)", dot: "rgba(255,255,255,0.6)", label: "Account blocked", sub: "This account has been blocked. Please contact us immediately.", icon: "block" };
    case "Payment Issues":
      return { bg: "rgba(220,100,20,0.08)", border: "rgba(220,100,20,0.25)", color: "#c45010", dot: "#e06020", label: "Payment issues on file", sub: "There are payment issues with this account. Please contact us to resolve.", icon: "warning" };
    default: // Needs Attention
      return { bg: "var(--sienna-surface)", border: "var(--sienna-border)", color: "var(--sienna)", dot: "var(--sienna)", label: "Account needs attention", sub: "", icon: "warning" };
  }
}

// ── Calendar helpers ─────────────────────────────────────────────────────────
function buildDailyTermDays(startDate: Date, totalTerm: number): Set<string> {
  const days = new Set<string>();
  const cursor = new Date(startDate);
  let count = 0;
  while (count < totalTerm) {
    if (isBusinessDay(cursor)) { days.add(toDateStr(cursor)); count++; }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildWeeklyTermDays(startDate: Date, totalTerm: number, paymentDayName: string): Set<string> {
  const days = new Set<string>();
  const targetDow = DAY_NAME_TO_NUM[paymentDayName.toLowerCase()] ?? 5;
  const cursor = new Date(startDate);
  let count = 0;
  while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
  while (count < totalTerm) {
    let paymentDate = new Date(cursor);
    if (isHoliday(paymentDate)) {
      do { paymentDate.setDate(paymentDate.getDate() + 1); } while (paymentDate.getDay() !== 1);
      while (!isBusinessDay(paymentDate)) { paymentDate.setDate(paymentDate.getDate() + 1); }
    }
    days.add(toDateStr(paymentDate));
    count++;
    cursor.setDate(cursor.getDate() + 7);
  }
  return days;
}

function buildPaymentDays(payments: Payment[]): Set<string> {
  const days = new Set<string>();
  for (const p of payments) {
    const desc = (p.description || "").toLowerCase();
    if (!desc.includes("missed") && !desc.includes("return") && !desc.includes("initial")) {
      const d = p.ach_date || p.payment_date;
      if (d) days.add(d.split("T")[0]);
    }
  }
  return days;
}

function buildMissedDays(payments: Payment[]): Set<string> {
  const days = new Set<string>();
  for (const p of payments) {
    const desc = (p.description || "").toLowerCase();
    if (desc.includes("missed") || desc.includes("return")) {
      const d = p.ach_date || p.payment_date;
      if (d) days.add(d.split("T")[0]);
    }
  }
  return days;
}

function getNextPaymentDate(client: Client): { label: string; amount: number } | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (client.payment_frequency === "daily") {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    while (!isBusinessDay(next)) next.setDate(next.getDate() + 1);
    const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const label = diff === 1 ? `Tomorrow, ${DAY_NUM_TO_NAME[next.getDay()]}` : DAY_NUM_TO_NAME[next.getDay()];
    return { label, amount: Number(client.payment) };
  }
  if (client.payment_frequency === "weekly" && client.payment_day) {
    const targetDow = DAY_NAME_TO_NUM[client.payment_day.toLowerCase()] ?? 5;
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    while (next.getDay() !== targetDow) next.setDate(next.getDate() + 1);
    if (isHoliday(next)) {
      do { next.setDate(next.getDate() + 1); } while (next.getDay() !== 1);
      while (!isBusinessDay(next)) next.setDate(next.getDate() + 1);
    }
    const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const label = daysUntil === 1 ? "Tomorrow" : daysUntil <= 7 ? `This ${DAY_NUM_TO_NAME[next.getDay()]}` : `${DAY_NUM_TO_NAME[next.getDay()]} ${formatDate(toDateStr(next))}`;
    return { label, amount: Number(client.payment) };
  }
  return null;
}

function getPendingPayments(payments: Payment[]): { count: number; total: number } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let count = 0, total = 0;
  for (const p of payments) {
    if (!p.settlement_date) continue;
    const desc = (p.description || "").toLowerCase();
    if (desc.includes("missed") || desc.includes("return")) continue;
    const settlDate = new Date(p.settlement_date); settlDate.setHours(0, 0, 0, 0);
    if (settlDate > today && p.debit > 0) { count++; total += Number(p.debit); }
  }
  return { count, total };
}

// ── Expected progress calculation ─────────────────────────────────────────────
function getExpectedProgress(client: Client): number {
  if (!client.funded_date || !client.total_term || !client.payment) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const funded = new Date(client.funded_date + "T00:00:00");
  const payback = Number(client.payback || 0);
  if (payback === 0) return 0;

  let paymentsMadeByNow = 0;
  if (client.payment_frequency === "weekly" && client.payment_day) {
    const targetDow = DAY_NAME_TO_NUM[(client.payment_day || "").toLowerCase()] ?? 5;
    const cursor = new Date(funded);
    while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= today) {
      paymentsMadeByNow++;
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const cursor = new Date(funded);
    while (cursor <= today) {
      if (isBusinessDay(cursor)) paymentsMadeByNow++;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const expectedPaid = Math.min(paymentsMadeByNow * Number(client.payment), payback);
  return Math.min(100, (expectedPaid / payback) * 100);
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ year, month, termDays, paymentDays, missedDays, holidayMovedDays, today, onPrev, onNext, canPrev, canNext }: {
  year: number; month: number; termDays: Set<string>; paymentDays: Set<string>;
  missedDays: Set<string>; holidayMovedDays: Set<string>; today: Date;
  onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean;
}) {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={onPrev} disabled={!canPrev} style={{ background: "none", border: "none", cursor: canPrev ? "pointer" : "not-allowed", opacity: canPrev ? 1 : 0.25, fontSize: 16, color: "var(--ink-3)", padding: "2px 8px" }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{monthNames[month]} {year}</span>
        <button onClick={onNext} disabled={!canNext} style={{ background: "none", border: "none", cursor: canNext ? "pointer" : "not-allowed", opacity: canNext ? 1 : 0.25, fontSize: 16, color: "var(--ink-3)", padding: "2px 8px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--ink-3)", fontWeight: 700, padding: "2px 0", fontFamily: "'DM Sans', sans-serif" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {days.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} style={{ aspectRatio: "1" }} />;
          const dateStr = toDateStr(date);
          const isToday = dateStr === toDateStr(today);
          const isWknd = isWeekend(date);
          const isHol = isHoliday(date);
          const inTerm = termDays.has(dateStr);
          const isMoved = holidayMovedDays.has(dateStr);
          const paid = paymentDays.has(dateStr);
          const missed = missedDays.has(dateStr);

          let bg = "transparent";
          let color = isWknd ? "var(--ink-5)" : "var(--ink-2)";
          if (isHol) { bg = "rgba(196,154,90,0.25)"; color = "#b8860b"; }
          else if (paid) { bg = "rgba(34,139,34,0.18)"; color = "#1a7a1a"; }
          else if (missed) { bg = "rgba(190,60,40,0.18)"; color = "#b83220"; }
          else if (isMoved) { bg = "rgba(180,130,60,0.20)"; color = "#9a6e10"; }
          else if (inTerm) { bg = "rgba(40,110,190,0.15)"; color = "#1a5fa8"; }

          return (
            <div key={dateStr} style={{
              aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, background: bg, color, fontSize: 12, fontWeight: isToday ? 800 : 500,
              fontFamily: "'DM Sans', sans-serif",
              outline: isToday ? "2px solid var(--ink-2)" : "none", outlineOffset: -1,
            }}>
              {date.getDate()}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px" }}>
        {[
          { bg: "rgba(40,110,190,0.15)", border: "1px solid rgba(40,110,190,0.3)", label: "Expected" },
          { bg: "rgba(34,139,34,0.18)", border: "1px solid rgba(34,139,34,0.35)", label: "Received" },
          { bg: "rgba(190,60,40,0.18)", border: "1px solid rgba(190,60,40,0.35)", label: "Missed" },
          { bg: "rgba(196,154,90,0.25)", border: "1px solid rgba(196,154,90,0.4)", label: "Holiday" },
          { bg: "rgba(180,130,60,0.20)", border: "1px solid rgba(180,130,60,0.35)", label: "Moved to Monday" },
        ].map(({ bg, border, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: bg, border, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ClientDashboard({ selectedClient, payments, isAdminView, onPaymentAdded }: ClientDashboardProps) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [combinedBalance, setCombinedBalance] = useState<number | null>(null);
  const [combinedPayback, setCombinedPayback] = useState<number | null>(null);

  const primaryBalance = Number(selectedClient.balance || 0);
  const primaryPayback = Number(selectedClient.payback || 0);
  const effectiveBalance = combinedBalance !== null ? combinedBalance : primaryBalance;
  const effectivePayback = combinedPayback !== null ? combinedPayback : primaryPayback;

  const totalPaid = effectivePayback - effectiveBalance;
  const percentPaid = effectivePayback > 0 ? (totalPaid / effectivePayback) * 100 : 0;
  const safePercent = Math.max(0, Math.min(100, percentPaid));

  // Expected progress based on original schedule
  const expectedPercent = Math.max(0, Math.min(100, getExpectedProgress(selectedClient)));
  const isBehind = safePercent < expectedPercent - 1;

  const isWeeklyClient = selectedClient.payment_frequency === "weekly";
  const paymentDayName = (selectedClient.payment_day || "").toLowerCase();
  const paymentFrequencyLabel = isWeeklyClient
    ? `Weekly · ${paymentDayName ? paymentDayName.charAt(0).toUpperCase() + paymentDayName.slice(1) + "s" : ""}`
    : "Daily";

  const { count: pendingCount, total: pendingTotal } = getPendingPayments(payments);
  const pendingBalance = Math.max(0, primaryBalance - pendingTotal);
  const nextPayment = getNextPaymentDate(selectedClient);

  const status = selectedClient.status || "Good Standing";
  const statusConfig = getStatusConfig(status);

  const returnedPayments = payments.filter(p => {
    const desc = (p.description || "").toLowerCase();
    return desc.includes("return") || desc.includes("missed");
  });
  const badStanding = !["Good Standing", "Paused"].includes(status as string);
  const hasMissedPayments = returnedPayments.length > 0;

  const fundedDate = selectedClient.funded_date ? new Date(selectedClient.funded_date + "T00:00:00") : null;
  const totalTerm = Number(selectedClient.total_term || 0);
  const termDays = fundedDate && totalTerm > 0
    ? (isWeeklyClient && paymentDayName ? buildWeeklyTermDays(fundedDate, totalTerm, paymentDayName) : buildDailyTermDays(fundedDate, totalTerm))
    : new Set<string>();

  const holidayMovedDays = new Set<string>();
  if (isWeeklyClient && paymentDayName && fundedDate && totalTerm > 0) {
    const targetDow = DAY_NAME_TO_NUM[paymentDayName.toLowerCase()] ?? 5;
    for (const dateStr of Array.from(termDays)) {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getDay() !== targetDow) holidayMovedDays.add(dateStr);
    }
  }

  let termEndDate: Date | null = null;
  if (fundedDate && totalTerm > 0) {
    if (isWeeklyClient && paymentDayName) {
      const sortedDays = Array.from(termDays).sort();
      if (sortedDays.length > 0) termEndDate = new Date(sortedDays[sortedDays.length - 1] + "T00:00:00");
    } else {
      termEndDate = addBusinessDays(fundedDate, totalTerm);
    }
  }

  // Est completion from live balance
  const balance = Number(selectedClient.balance || 0);
  const paymentAmount = Number(selectedClient.payment || 0);
  let estCompletionDate: Date | null = null;
  if (balance > 0 && paymentAmount > 0) {
    const paymentsLeft = Math.ceil(balance / paymentAmount);
    if (isWeeklyClient && paymentDayName) {
      const targetDow = DAY_NAME_TO_NUM[paymentDayName.toLowerCase()] ?? 5;
      const cursor = new Date(today);
      cursor.setDate(cursor.getDate() + 1);
      while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
      let count = 0;
      while (count < paymentsLeft - 1) { cursor.setDate(cursor.getDate() + 7); count++; }
      estCompletionDate = new Date(cursor);
    } else {
      estCompletionDate = addBusinessDays(today, paymentsLeft);
    }
  }

  const paymentDays = buildPaymentDays(payments);
  const missedDays = buildMissedDays(payments);

  const calMinYear = fundedDate ? fundedDate.getFullYear() : today.getFullYear();
  const calMinMonth = fundedDate ? Math.max(0, fundedDate.getMonth() - 1) : 0;
  const naturalMax = termEndDate || new Date(today.getFullYear() + 2, today.getMonth(), 1);
  const sixMonthsOut = new Date(today.getFullYear(), today.getMonth() + 6, 1);
  const calMaxDate = naturalMax > sixMonthsOut ? naturalMax : sixMonthsOut;
  const calMaxYear = calMaxDate.getFullYear();
  const calMaxMonth = Math.min(11, calMaxDate.getMonth() + 1);
  const canGoPrev = calYear > calMinYear || (calYear === calMinYear && calMonth > calMinMonth);
  const canGoNext = calYear < calMaxYear || (calYear === calMaxYear && calMonth < calMaxMonth);

  function prevMonth() { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }
  function nextMonth() { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }

  function handlePaymentAdded() { setActivityRefresh(r => r + 1); onPaymentAdded?.(); }

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "20px 24px",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ ...card }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'Cormorant Garamond', serif", letterSpacing: "-0.02em", marginBottom: 4 }}>
              {selectedClient.business_name}
            </h1>
            <p style={{ fontSize: 15, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
              {selectedClient.invoice} · Funded {formatDate(selectedClient.funded_date)}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            {isAdminView && selectedClient.client_email && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
                <a href={`mailto:${selectedClient.client_email}?subject=Your%20MCA%20Account%20%E2%80%94%20Action%20Required&body=Dear%20${encodeURIComponent(selectedClient.owner_name)}%2C%0D%0A%0D%0AI%20am%20reaching%20out%20regarding%20your%20account%20${encodeURIComponent(selectedClient.invoice)}.%20Please%20contact%20me%20at%20your%20earliest%20convenience%20to%20discuss%20your%20account%20status.%0D%0A%0D%0A%E2%80%94%20Fellipe%20Busato%0D%0Afbusato%40cfgms.com%0D%0A%2B1%20(917)%20920-0881`}
                  style={{ fontSize: 14, color: "var(--ink-3)", border: "1px solid var(--border-mid)", borderRadius: 7, padding: "5px 12px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                  Send notice
                </a>
                {hasMissedPayments && (
                  <a href={`mailto:${selectedClient.client_email}?subject=Missed%20Payment%20Notice%20%E2%80%94%20${encodeURIComponent(selectedClient.invoice)}%20%E2%80%94%20${encodeURIComponent(selectedClient.business_name)}&body=Dear%20${encodeURIComponent(selectedClient.owner_name)}%2C%0D%0A%0D%0AI%20noticed%20a%20recent%20payment%20on%20your%20account%20${encodeURIComponent(selectedClient.invoice)}%20was%20missed%20or%20returned.%20To%20keep%20your%20account%20in%20good%20standing%20and%20avoid%20further%20action%2C%20please%20make%20up%20this%20payment%20as%20soon%20as%20possible%20via%20Zelle%20(invoices%40cfgms.com)%20or%20by%20logging%20into%20your%20portal%20at%20https%3A%2F%2Fmcaportal-fb.vercel.app%20and%20using%20the%20Pay%20Online%20button.%0D%0A%0D%0A%E2%80%94%20Fellipe%20Busato`}
                  style={{ fontSize: 14, color: "var(--sienna)", border: "1px solid var(--sienna-border)", background: "var(--sienna-surface)", borderRadius: 7, padding: "5px 12px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                  Missed payment notice
                </a>
                )}
              </div>
            )}
            <p style={{ fontSize: 14, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>Need help? Contact Fellipe:</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>{CONTACT.email}</p>
            <p style={{ fontSize: 15, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>{CONTACT.phone}</p>
          </div>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Left column */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Funded", value: money(Number(selectedClient.funded || 0)) },
              { label: "Payback", value: money(effectivePayback) },
              {
                label: "Balance",
                value: money(effectiveBalance),
                sub: pendingCount > 0 ? `${money(pendingBalance)} once ${pendingCount} pending clear` : "Settled payments only"
              },
              {
                label: paymentFrequencyLabel + " payment",
                value: money(Number(selectedClient.payment || 0)),
                sub: nextPayment ? `Next ACH: ${nextPayment.label}` : undefined
              },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ ...card, padding: "16px 18px" }}>
                <p style={{ fontSize: 17, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{label}</p>
                <p style={{ fontSize: 34, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.1 }}>{value}</p>
                {sub && <p style={{ fontSize: 14, color: "var(--sky)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginTop: 6 }}>{sub}</p>}
              </div>
            ))}
          </div>

          {/* Pending bar */}
          {pendingCount > 0 && (
            <div style={{ background: "var(--sky-surface)", border: "1px solid var(--sky-border)", borderRadius: 10, padding: "10px 16px" }}>
              <p style={{ fontSize: 15, color: "var(--sky)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                <strong>{pendingCount} payment{pendingCount > 1 ? "s" : ""} totaling {money(pendingTotal)}</strong> are processing and will apply to your balance within 4 business days.
              </p>
            </div>
          )}

          {/* ── Smart client alerts ── */}
          {(() => {
            const returnedOnly = payments.filter(p => (p.description || "").toLowerCase().includes("return"));
            const returnCount = returnedOnly.length;
            const returnTotal = returnedOnly.reduce((s, p) => s + Number(p.returns || 0), 0);
            const paymentsLeft = paymentAmount > 0 ? Math.ceil(balance / paymentAmount) : 0;
            const weeksLeft = isWeeklyClient ? paymentsLeft : Math.ceil(paymentsLeft / 5);
            const isOnTrack = safePercent >= expectedPercent - 2;

            if ((status as string) === "Good Standing" && isOnTrack && paymentsLeft > 0) {
              if (safePercent >= 90) {
                return (
                  <div style={{ background: "var(--sage-surface)", border: "1px solid var(--sage-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🚀</span>
                    <p style={{ fontSize: 14, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                      Final stretch! You&apos;re almost paid in full with <strong>{paymentsLeft} payment{paymentsLeft !== 1 ? "s" : ""}</strong> remaining. When you&apos;re done, you&apos;re more than welcome to reach out to us for your next funding!
                    </p>
                  </div>
                );
              }
              if (safePercent >= 75) {
                return (
                  <div style={{ background: "var(--sage-surface)", border: "1px solid var(--sage-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🏆</span>
                    <p style={{ fontSize: 14, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                      Almost done! You&apos;re 75% of the way through. Just <strong>{paymentsLeft} payment{paymentsLeft !== 1 ? "s" : ""}</strong> left — and you may qualify for a funding renewal. Ask us about it!
                    </p>
                  </div>
                );
              }
              if (safePercent >= 50) {
                return (
                  <div style={{ background: "var(--sage-surface)", border: "1px solid var(--sage-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🎉</span>
                    <p style={{ fontSize: 14, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                      Halfway there! You&apos;ve paid off half your balance — and you&apos;re now eligible for additional funding. Contact Fellipe to learn more!
                    </p>
                  </div>
                );
              }
              return (
                <div style={{ background: "var(--sage-surface)", border: "1px solid var(--sage-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🎯</span>
                  <p style={{ fontSize: 14, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    You&apos;re on track! Only <strong>{paymentsLeft} payment{paymentsLeft !== 1 ? "s" : ""}</strong> remaining — est. payoff in <strong>{weeksLeft} week{weeksLeft !== 1 ? "s" : ""}</strong>. Keep it up!
                  </p>
                </div>
              );
            }
            if ((status as string) === "Good Standing" && !isOnTrack && paymentsLeft > 0) {
              return (
                <div style={{ background: "rgba(196,140,40,0.08)", border: "1px solid rgba(196,140,40,0.25)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📈</span>
                  <p style={{ fontSize: 14, color: "#a07010", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    You&apos;re a little behind schedule. Making extra payments now will help you stay on track and protect your payment history.
                  </p>
                </div>
              );
            }
            if (returnCount === 1) {
              return (
                <div style={{ background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                  <p style={{ fontSize: 14, color: "var(--sienna)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    Your payment of <strong>{money(returnTotal)}</strong> was returned. Make up this payment to keep your account in good standing.
                  </p>
                </div>
              );
            }
            if (returnCount > 1) {
              return (
                <div style={{ background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🚨</span>
                  <p style={{ fontSize: 14, color: "var(--sienna)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    You have <strong>{returnCount} returned payments</strong> totaling <strong>{money(returnTotal)}</strong>. Resolving these promptly keeps your account protected from going to collections and in Good Standing.
                  </p>
                </div>
              );
            }
            return null;
          })()}
          {/* Progress bar — actual (green) + expected (red) */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Repayment progress</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{Math.round(safePercent)}% paid</p>
            </div>

            {/* Progress bar container */}
            <div style={{ position: "relative", height: 10, borderRadius: 99, background: "var(--parchment-3)", overflow: "hidden" }}>
              {/* Expected progress (red) — shown behind if client is behind */}
              {isBehind && (
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${expectedPercent}%`,
                  background: "rgba(190,60,40,0.25)",
                  borderRadius: 99,
                  transition: "width 0.5s ease",
                }} />
              )}
              {/* Actual progress (green) */}
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${safePercent}%`,
                background: isBehind ? "var(--sage)" : "var(--sage)",
                borderRadius: 99,
                transition: "width 0.5s ease",
              }} />
            </div>

            {/* Legend */}
            {isBehind && (
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--sage)" }} />
                  <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>Actual ({Math.round(safePercent)}%)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(190,60,40,0.4)" }} />
                  <span style={{ fontSize: 11, color: "var(--sienna)", fontFamily: "'DM Sans', sans-serif" }}>Expected ({Math.round(expectedPercent)}%) — {Math.round(expectedPercent - safePercent)}% behind schedule</span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{money(totalPaid)} paid</p>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                {(estCompletionDate || termEndDate)
                  ? `Est. completion: ${formatDate((estCompletionDate || termEndDate)!.toISOString().split("T")[0])}`
                  : `${money(effectiveBalance)} remaining`}
              </p>
            </div>
          </div>

          {/* Status banner — all statuses */}
          {status === "Good Standing" ? (
            <div style={{ background: statusConfig.bg, border: `1px solid ${statusConfig.border}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(90,138,106,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3 6-6" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: statusConfig.color, fontFamily: "'DM Sans', sans-serif" }}>{statusConfig.label}</p>
                <p style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{statusConfig.sub}</p>
              </div>
            </div>
          ) : status === "Paused" ? (
            <div style={{ background: statusConfig.bg, border: `1px solid ${statusConfig.border}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(196,140,40,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="3" y="2.5" width="2.5" height="9" rx="1" fill="#c48c28"/>
                  <rect x="8.5" y="2.5" width="2.5" height="9" rx="1" fill="#c48c28"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: statusConfig.color, fontFamily: "'DM Sans', sans-serif" }}>{statusConfig.label}</p>
                <p style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{statusConfig.sub}</p>
              </div>
            </div>
          ) : status === "Blocked" ? (
            <div style={{ background: statusConfig.bg, border: `1px solid ${statusConfig.border}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2"/><path d="M3.5 3.5l7 7" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: statusConfig.color, fontFamily: "'DM Sans', sans-serif" }}>{statusConfig.label}</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{statusConfig.sub}</p>
              </div>
            </div>
          ) : (
            // Needs Attention / Payment Issues
            <div style={{ background: statusConfig.bg, border: `1px solid ${statusConfig.border}`, borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(154,90,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 4v4M7 10v.5" stroke={statusConfig.color} strokeWidth="1.8" strokeLinecap="round"/><circle cx="7" cy="7" r="5.5" stroke={statusConfig.color} strokeWidth="1.2"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 500, color: statusConfig.color, fontFamily: "'DM Sans', sans-serif" }}>{statusConfig.label}</p>
                  <p style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                    {isWeeklyClient ? "1 or more weekly payments have" : "2 or more daily payments have"} been returned or missed.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 15, fontWeight: 500, color: "white", background: statusConfig.color, borderRadius: 8, padding: "8px 16px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                  Pay now online →
                </a>
                <span style={{ fontSize: 14, color: statusConfig.color, alignSelf: "center", fontFamily: "'DM Sans', sans-serif" }}>or Zelle: invoices@cfgms.com</span>
              </div>
            </div>
          )}

          {/* Payment panel — only when not blocked */}
          {status !== "Blocked" && !badStanding && (
            <div style={{ ...card }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>Make a payment</p>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>Every extra payment reduces your balance dollar for dollar.</p>
              <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", textAlign: "center", fontSize: 15, fontWeight: 500, color: "var(--gold-muted)", background: "var(--ink-1)", borderRadius: 9, padding: "10px 20px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
                Pay online →
              </a>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>⚠️ Online payments carry a 3.5% fee.</p>
              <div style={{ background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>Zelle: invoices@cfgms.com</p>
                <p style={{ fontSize: 14, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>Include your invoice # or business name — no fee</p>
              </div>
            </div>
          )}
        </div>

        {/* Calendar sidebar */}
        {fundedDate && (
          <div style={{ flexShrink: 0, width: 210, position: "sticky", top: 80 }}>
            <div style={{ ...card, padding: "16px 18px" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", marginBottom: 4, textAlign: "center" }}>Payment Calendar</p>
              <p style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textAlign: "center", lineHeight: 1.4 }}>
                {isWeeklyClient
                  ? `${Math.ceil(balance / paymentAmount)} payments remaining`
                  : `${totalTerm} Business Days Term`}
                {(estCompletionDate || termEndDate) && ` · Ends ${formatDate((estCompletionDate || termEndDate)!.toISOString().split("T")[0])}`}
              </p>
              <MiniCalendar
                year={calYear} month={calMonth}
                termDays={termDays} paymentDays={paymentDays}
                missedDays={missedDays} holidayMovedDays={holidayMovedDays}
                today={today} onPrev={prevMonth} onNext={nextMonth}
                canPrev={canGoPrev} canNext={canGoNext}
              />
            </div>
          </div>
        )}
      </div>

      {/* FundingsPanel */}
      <FundingsPanel
        client={selectedClient}
        isAdminView={isAdminView}
        onBalanceChange={(cb, cp) => {
          setCombinedBalance(cb);
          setCombinedPayback(cp);
        }}
      />

      {/* Payment History */}
      <PaymentHistory
        payments={payments}
        client={selectedClient}
        isAdminView={isAdminView}
        onPaymentAdded={handlePaymentAdded}
      />

      {/* Activity Log */}
      <ActivityLog
        invoice={selectedClient.invoice}
        isAdminView={isAdminView}
        refreshTrigger={activityRefresh}
        clientEmail={selectedClient.client_email}
      />

      {/* ── Legal notice ── */}
      {!isAdminView && (
        <div style={{ textAlign: "center", padding: "20px 12px", fontSize: 11, color: "var(--ink-5)", lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif" }}>
          This portal is an independent organizational tool operated by Fellipe Busato and is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity. Information displayed is for reference and organizational purposes only and does not constitute an official financial record, legal document, or binding statement of account.
        </div>
      )}
    </div>
  );
}
