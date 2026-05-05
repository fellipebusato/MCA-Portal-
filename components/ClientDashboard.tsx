"use client";

import { useState } from "react";
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0, total = 0;
  for (const p of payments) {
    if (!p.settlement_date) continue;
    const desc = (p.description || "").toLowerCase();
    if (desc.includes("missed") || desc.includes("return")) continue;
    const settlDate = new Date(p.settlement_date);
    settlDate.setHours(0, 0, 0, 0);
    if (settlDate > today && p.debit > 0) { count++; total += Number(p.debit); }
  }
  return { count, total };
}

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
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>{monthNames[month]} {year}</span>
        <button onClick={onNext} disabled={!canNext} style={{ background: "none", border: "none", cursor: canNext ? "pointer" : "not-allowed", opacity: canNext ? 1 : 0.25, fontSize: 16, color: "var(--ink-3)", padding: "2px 8px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 15, color: "var(--ink-4)", fontWeight: 600, padding: "2px 0", fontFamily: "'DM Sans', sans-serif" }}>{d}</div>
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
          if (isHol) { bg = "rgba(160,120,64,0.12)"; color = "var(--gold)"; }
          else if (paid) { bg = "var(--sage-surface)"; color = "var(--sage)"; }
          else if (missed) { bg = "var(--sienna-surface)"; color = "var(--sienna)"; }
          else if (isMoved) { bg = "rgba(180,130,60,0.10)"; color = "var(--gold-bright)"; }
          else if (inTerm) { bg = "var(--sky-surface)"; color = "var(--sky)"; }

          return (
            <div key={dateStr} style={{
              aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, background: bg, color, fontSize: 15, fontWeight: isToday ? 700 : 500,
              fontFamily: "'DM Sans', sans-serif",
              outline: isToday ? "1.5px solid var(--ink-2)" : "none", outlineOffset: -1,
            }}>
              {date.getDate()}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px" }}>
        {[
          { bg: "var(--sky-surface)", border: "1px solid var(--sky-border)", label: "Expected" },
          { bg: "var(--sage-surface)", border: "1px solid var(--sage-border)", label: "Received" },
          { bg: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", label: "Missed" },
          { bg: "rgba(160,120,64,0.12)", border: "1px solid var(--gold-border)", label: "Holiday" },
          { bg: "rgba(180,130,60,0.10)", border: "1px solid var(--gold-border)", label: "Moved to Mon" },
        ].map(({ bg, border, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: bg, border, flexShrink: 0 }} />
            <span style={{ fontSize: 15, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientDashboard({ selectedClient, payments, isAdminView, onPaymentAdded }: ClientDashboardProps) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [activityRefresh, setActivityRefresh] = useState(0);

  const percentPaid = 100 - (Number(selectedClient.balance || 0) / Number(selectedClient.payback || 1)) * 100;
  const safePercent = Math.max(0, Math.min(100, percentPaid));
  const isWeeklyClient = selectedClient.payment_frequency === "weekly";
  const paymentDayName = (selectedClient.payment_day || "").toLowerCase();
  const paymentFrequencyLabel = isWeeklyClient
    ? `Weekly · ${paymentDayName ? paymentDayName.charAt(0).toUpperCase() + paymentDayName.slice(1) + "s" : ""}`
    : "Daily";
  const totalPaid = Number(selectedClient.payback || 0) - Number(selectedClient.balance || 0);

  const { count: pendingCount, total: pendingTotal } = getPendingPayments(payments);
  const pendingBalance = Math.max(0, Number(selectedClient.balance || 0) - pendingTotal);
  const nextPayment = getNextPaymentDate(selectedClient);

  const returnedPayments = payments.filter(p => {
    const desc = (p.description || "").toLowerCase();
    return desc.includes("return") || desc.includes("missed");
  });
  const badStanding = isWeeklyClient ? returnedPayments.length >= 1 : returnedPayments.length >= 2;
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

  function handlePaymentAdded() {
    setActivityRefresh(r => r + 1);
    onPaymentAdded?.();
  }

  // ── Shared card style ────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "20px 24px",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ ...card }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: 15, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{selectedClient.business_name}</p>
            <h2 style={{ fontSize: 22, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'Cormorant Garamond', serif", letterSpacing: "-0.02em", marginBottom: 4 }}>
              {selectedClient.business_name}
            </h2>
            <p style={{ fontSize: 15, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
              {selectedClient.invoice} · Funded {formatDate(selectedClient.funded_date)}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            {isAdminView && selectedClient.client_email && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
                <a href={`mailto:${selectedClient.client_email}?subject=${encodeURIComponent("Your MCA Account — Action Required")}`}
                  style={{ fontSize: 14, color: "var(--ink-3)", border: "1px solid var(--border-mid)", borderRadius: 7, padding: "5px 12px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                  Send notice
                </a>
                {hasMissedPayments && (
                  <a href={`mailto:${selectedClient.client_email}?subject=${encodeURIComponent("Missed Payment Notice — " + selectedClient.invoice)}`}
                    style={{ fontSize: 14, color: "var(--sienna)", border: "1px solid var(--sienna-border)", background: "var(--sienna-surface)", borderRadius: 7, padding: "5px 12px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                    Missed payment notice
                  </a>
                )}
              </div>
            )}
            <p style={{ fontSize: 14, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>Need help?</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>{CONTACT.email}</p>
            <p style={{ fontSize: 15, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>{CONTACT.phone}</p>
          </div>
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Left column */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Funded", value: money(Number(selectedClient.funded || 0)) },
              { label: "Payback", value: money(Number(selectedClient.payback || 0)) },
              { label: "Balance", value: money(Number(selectedClient.balance || 0)), sub: pendingCount > 0 ? `${money(pendingBalance)} once ${pendingCount} pending clear` : "Settled payments only" },
              { label: paymentFrequencyLabel + " payment", value: money(Number(selectedClient.payment || 0)), sub: nextPayment ? `Next ACH: ${nextPayment.label}` : undefined },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ ...card, padding: "16px 18px" }}>
                <p style={{ fontSize: 15, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 28, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'Cormorant Garamond', serif" }}>{value}</p>
                {sub && <p style={{ fontSize: 14, color: "var(--sky)", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>{sub}</p>}
              </div>
            ))}
          </div>

          {/* Pending bar */}
          {pendingCount > 0 && (
            <div style={{ background: "var(--sky-surface)", border: "1px solid var(--sky-border)", borderRadius: 10, padding: "10px 16px" }}>
              <p style={{ fontSize: 15, color: "var(--sky)", fontFamily: "'DM Sans', sans-serif" }}>
                <strong>{pendingCount} payment{pendingCount > 1 ? "s" : ""} totaling {money(pendingTotal)}</strong> are processing and will apply to your balance within 4 business days.
              </p>
            </div>
          )}

          {/* Progress */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Repayment progress</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{Math.round(safePercent)}% paid</p>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "var(--parchment-3)", overflow: "hidden" }}>
              <div style={{ height: 6, borderRadius: 99, background: "var(--sage)", width: `${safePercent}%`, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{money(totalPaid)} paid</p>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
                {termEndDate
                  ? `Est. completion: ${formatDate(termEndDate.toISOString().split("T")[0])}`
                  : `${money(Number(selectedClient.balance || 0))} remaining`}
              </p>
            </div>
          </div>

          {/* Standing */}
          {!badStanding ? (
            <div style={{ background: "var(--sage-surface)", border: "1px solid var(--sage-border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(90,138,106,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3 6-6" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif" }}>Account in good standing</p>
                <p style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>Your payments are up to date. Keep it up.</p>
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(154,90,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 4v4M7 10v.5" stroke="var(--sienna)" strokeWidth="1.8" strokeLinecap="round"/><circle cx="7" cy="7" r="5.5" stroke="var(--sienna)" strokeWidth="1.2"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 500, color: "var(--sienna)", fontFamily: "'DM Sans', sans-serif" }}>Account needs attention</p>
                  <p style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                    {isWeeklyClient ? "1 or more weekly payments have" : "2 or more daily payments have"} been returned or missed.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 15, fontWeight: 500, color: "white", background: "var(--sienna)", borderRadius: 8, padding: "8px 16px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                  Pay now online →
                </a>
                <span style={{ fontSize: 14, color: "var(--sienna)", alignSelf: "center", fontFamily: "'DM Sans', sans-serif" }}>or Zelle: invoices@cfgms.com</span>
              </div>
            </div>
          )}

          {/* Payment panel */}
          {!badStanding && (
            <div style={{ ...card }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>Make a payment</p>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>Every extra payment reduces your balance dollar for dollar.</p>
              <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", textAlign: "center", fontSize: 15, fontWeight: 500, color: "var(--gold-muted)", background: "var(--ink-1)", borderRadius: 9, padding: "10px 20px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
                Pay online →
              </a>
              <p style={{ fontSize: 14, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>⚠️ Online payments carry a 3.5% fee.</p>
              <div style={{ background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>Zelle: invoices@cfgms.com</p>
                <p style={{ fontSize: 14, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>Include your invoice # or business name — no fee</p>
              </div>
            </div>
          )}
        </div>

        {/* Calendar sidebar */}
        {fundedDate && (
          <div style={{ flexShrink: 0, width: 196, position: "sticky", top: 80 }}>
            <div style={{ ...card, padding: "16px 18px" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>Payment calendar</p>
              <p style={{ fontSize: 15, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
                {totalTerm} {isWeeklyClient ? "weekly" : "business day"} term
                {termEndDate && ` · ends ${formatDate(termEndDate.toISOString().split("T")[0])}`}
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

      {/* ── FundingsPanel — add-on fundings (only shown if client has positions) */}
      <FundingsPanel
        client={selectedClient}
        isAdminView={isAdminView}
      />

      {/* ── Payment history ─────────────────────────────────────────────── */}
      <PaymentHistory
        payments={payments}
        client={selectedClient}
        isAdminView={isAdminView}
        onPaymentAdded={handlePaymentAdded}
      />

      {/* ── Activity log ────────────────────────────────────────────────── */}
      <ActivityLog
        invoice={selectedClient.invoice}
        isAdminView={isAdminView}
        refreshTrigger={activityRefresh}
      />

    </div>
  );
}
