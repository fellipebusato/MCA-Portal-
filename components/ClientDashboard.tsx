"use client";

import { useState } from "react";
import PaymentHistory from "./PaymentHistory";
import ActivityLog from "./ActivityLog";
import FundingsPanel from "./FundingsPanel";
import { CONTACT, PORTAL, PAYMENT_LINK } from "@/lib/config";
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

type MilestoneBanner = { emoji: string; title: string; message: string; showCTA: boolean; variant: "green" | "blue" | "amber"; };

function getMilestoneBanner(percentPaid: number, badStanding: boolean): MilestoneBanner | null {
  if (badStanding) {
    if (percentPaid >= 75) return { emoji: "⚡", title: "Almost there — don't stop now", message: "You're 75% of the way through. Catching up on missed payments now protects your track record for future funding.", showCTA: false, variant: "amber" };
    if (percentPaid >= 50) return { emoji: "⚡", title: "Halfway there — get current to finish strong", message: "You've paid half your balance. Catching up on missed payments now protects your account and keeps future funding options open.", showCTA: false, variant: "amber" };
    if (percentPaid >= 25) return { emoji: "⚡", title: "Good progress — catch up to keep it going", message: "You're a quarter of the way there. Getting current now will protect your standing and your relationship with future funding.", showCTA: false, variant: "amber" };
    return { emoji: "⚡", title: "Catch up on payments to finish strong", message: "Missing payments delays your completion date. Every payment made gets you closer — reach out if you need to discuss options.", showCTA: false, variant: "amber" };
  }
  if (percentPaid >= 75) return { emoji: "🏁", title: "75% paid — almost there!", message: "Strong finish. Your payment track record is building and will help with future funding.", showCTA: false, variant: "green" };
  if (percentPaid >= 50) return { emoji: "🎉", title: "50% paid — milestone reached!", message: "You've paid half your balance. At this stage you may be eligible for additional funding or a refinance. Contact Fellipe for more information.", showCTA: false, variant: "blue" };
  if (percentPaid >= 25) return { emoji: "💪", title: "25% paid — great start!", message: "You're a quarter of the way there. Keep the momentum going.", showCTA: false, variant: "green" };
  return null;
}

function buildGeneralEmail(client: Client): string {
  const to = client.client_email || "";
  const subject = encodeURIComponent(`Your MCA Account — Action Required`);
  const body = encodeURIComponent(`Hello ${client.owner_name || client.business_name},\n\nYour account (${client.invoice}) is not in good standing. Please contact me directly or log in to your portal for instructions:\n\n${PORTAL.url}\n\nBest regards,\n${CONTACT.name}\n${CONTACT.email}\n${CONTACT.phone}`);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function buildMissedPaymentEmail(client: Client, payments: Payment[]): string {
  const to = client.client_email || "";
  const subject = encodeURIComponent(`Missed Payment Notice — ${client.invoice}`);
  const missedDates = payments.filter(p => { const desc = (p.description || "").toLowerCase(); return desc.includes("missed") || desc.includes("return"); }).map(p => { const d = p.ach_date || p.payment_date; return d ? formatDate(d) : null; }).filter(Boolean);
  const dateList = missedDates.length > 0 ? missedDates.join(", ") : "recent dates";
  const body = encodeURIComponent(`Hello ${client.owner_name || client.business_name},\n\nYou have missed payment(s) on the following date(s): ${dateList}.\n\nPlease log in to your portal for additional instructions:\n\n${PORTAL.url}\n\nYou may also pay via Zelle at invoices@cfgms.com — please include your invoice number (${client.invoice}) or business name.\n\nBest regards,\n${CONTACT.name}\n${CONTACT.email}\n${CONTACT.phone}`);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function MiniCalendar({ year, month, termDays, paymentDays, missedDays, holidayMovedDays, today, onPrev, onNext, canPrev, canNext }: {
  year: number; month: number; termDays: Set<string>; paymentDays: Set<string>; missedDays: Set<string>; holidayMovedDays: Set<string>; today: Date; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean;
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
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrev} disabled={!canPrev} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 px-2 py-1 text-base transition-colors">‹</button>
        <span className="text-xs font-semibold text-gray-700">{monthNames[month]} {year}</span>
        <button onClick={onNext} disabled={!canNext} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 px-2 py-1 text-base transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} className="text-center text-[9px] text-gray-400 font-medium py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} className="aspect-square" />;
          const dateStr = toDateStr(date);
          const isToday = dateStr === toDateStr(today);
          const isWknd = isWeekend(date);
          const isHol = isHoliday(date);
          const inTerm = termDays.has(dateStr);
          const isMoved = holidayMovedDays.has(dateStr);
          const paid = paymentDays.has(dateStr);
          const missed = missedDays.has(dateStr);
          let bg = "", textColor = isWknd ? "text-gray-300" : "text-gray-700";
          if (isHol) { bg = "bg-yellow-100"; textColor = "text-yellow-700"; }
          else if (paid) { bg = "bg-emerald-100"; textColor = "text-emerald-700"; }
          else if (missed) { bg = "bg-red-100"; textColor = "text-red-600"; }
          else if (isMoved) { bg = "bg-orange-100"; textColor = "text-orange-700"; }
          else if (inTerm) { bg = "bg-blue-50"; textColor = "text-blue-700"; }
          return (
            <div key={dateStr} className={`aspect-square flex items-center justify-center rounded text-[10px] font-medium ${bg} ${textColor} ${isToday ? "ring-1 ring-gray-900 font-bold" : ""}`}>
              {date.getDate()}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
        {[["bg-blue-50 border border-blue-200","Expected"],["bg-emerald-100","Received"],["bg-red-100","Missed"],["bg-yellow-100","Holiday"],["bg-orange-100","Moved to Mon"]].map(([cls, label]) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${cls} flex-shrink-0`} />
            <span className="text-[9px] text-gray-400">{label}</span>
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

  // Combined balance and payback from add-on fundings
  // When fundings exist: combined = main client balance + all add-on balances
  const [combinedBalance, setCombinedBalance] = useState<number | null>(null);
  const [combinedPayback, setCombinedPayback] = useState<number | null>(null);

  // Use combined values when available, fall back to single client values
  const displayBalance = combinedBalance !== null ? combinedBalance : Number(selectedClient.balance || 0);
  const displayPayback = combinedPayback !== null ? combinedPayback : Number(selectedClient.payback || 0);

  const percentPaid = displayPayback > 0 ? 100 - (displayBalance / displayPayback) * 100 : 0;
  const safePercent = Math.max(0, Math.min(100, percentPaid));
  const totalPaid = displayPayback - displayBalance;

  const isWeeklyClient = selectedClient.payment_frequency === "weekly";
  const paymentDayName = (selectedClient.payment_day || "").toLowerCase();
  const paymentFrequencyLabel = isWeeklyClient ? `Weekly · ${paymentDayName ? paymentDayName.charAt(0).toUpperCase() + paymentDayName.slice(1) + "s" : ""}` : "Daily";

  const { count: pendingCount, total: pendingTotal } = getPendingPayments(payments);
  const pendingBalance = Math.max(0, displayBalance - pendingTotal);
  const nextPayment = getNextPaymentDate(selectedClient);

  const returnedPayments = payments.filter(p => { const desc = (p.description || "").toLowerCase(); return desc.includes("return") || desc.includes("missed"); });
  const badStanding = isWeeklyClient ? returnedPayments.length >= 1 : returnedPayments.length >= 2;
  const trulyGoodStanding = !badStanding && selectedClient.status === "Good Standing";
  const milestone = getMilestoneBanner(safePercent, !trulyGoodStanding);

  const variantStyles = {
    green: { wrap: "bg-emerald-50 border-emerald-100", title: "text-emerald-800", msg: "text-emerald-600" },
    blue:  { wrap: "bg-blue-50 border-blue-200",       title: "text-blue-900",    msg: "text-blue-700" },
    amber: { wrap: "bg-amber-50 border-amber-200",      title: "text-amber-900",   msg: "text-amber-700" },
  };

  const fundedDate = selectedClient.funded_date ? new Date(selectedClient.funded_date + "T00:00:00") : null;
  const totalTerm = Number(selectedClient.total_term || 0);
  const termDays = fundedDate && totalTerm > 0 ? isWeeklyClient && paymentDayName ? buildWeeklyTermDays(fundedDate, totalTerm, paymentDayName) : buildDailyTermDays(fundedDate, totalTerm) : new Set<string>();

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
  const hasMissedPayments = payments.some(p => { const desc = (p.description || "").toLowerCase(); return desc.includes("missed") || desc.includes("return"); });

  function prevMonth() { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }
  function nextMonth() { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }

  function handlePaymentAdded() {
    setActivityRefresh(r => r + 1);
    onPaymentAdded?.();
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Account</p>
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">{selectedClient.business_name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{selectedClient.invoice} · Funded {formatDate(selectedClient.funded_date)}</p>
          </div>
          <div className="flex flex-col gap-2">
            {isAdminView && selectedClient.client_email && (
              <div className="flex flex-wrap gap-2">
                <a href={buildGeneralEmail(selectedClient)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3l5 3.5L11 3M1 3h10v7H1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Send notice
                </a>
                {hasMissedPayments && (
                  <a href={buildMissedPaymentEmail(selectedClient, payments)} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3l5 3.5L11 3M1 3h10v7H1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Missed payment notice
                  </a>
                )}
              </div>
            )}
            <div className="sm:text-right">
              <p className="text-xs text-gray-400 mb-0.5">Need help?</p>
              <p className="text-sm font-medium text-gray-900">{CONTACT.email}</p>
              <p className="text-sm text-gray-500">{CONTACT.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:items-start">
        <div className="flex-1 min-w-0 space-y-4">

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Funded</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.funded || 0))}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payback</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.payback || 0))}</p>
            </div>

            {/* Balance — shows combined label when add-ons exist */}
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                Balance{combinedBalance !== null && <span className="text-indigo-400 normal-case font-normal ml-1">(combined)</span>}
              </p>
              <p className="text-lg font-semibold text-gray-900">{money(displayBalance)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Settled payments only</p>
              {pendingCount > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-blue-600">{money(pendingBalance)}</p>
                  <p className="text-xs text-blue-400">Once {pendingCount} pending payment{pendingCount > 1 ? "s" : ""} clear{pendingCount === 1 ? "s" : ""}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{paymentFrequencyLabel} payment</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.payment || 0))}</p>
              {nextPayment && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400">Next ACH debit</p>
                  <p className="text-sm font-semibold text-gray-700">{nextPayment.label}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pending info bar */}
          {pendingCount > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-2.5">
              <p className="text-xs text-blue-600">
                <span className="font-medium">{pendingCount} payment{pendingCount > 1 ? "s" : ""} totaling {money(pendingTotal)}</span>{" "}are processing and will apply to your balance within 4 business days.
              </p>
            </div>
          )}

          {/* Progress bar — uses combined payback when available */}
          <div className="rounded-xl bg-white border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-900">Repayment progress</p>
              <p className="text-sm font-semibold text-gray-900">{Math.round(safePercent)}% paid</p>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-2.5 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${safePercent}%` }} />
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-xs text-gray-400">{money(totalPaid)} paid</p>
              <p className="text-xs text-gray-400">
                {termEndDate
                  ? <span>Est. completion: {formatDate(termEndDate.toISOString().split("T")[0])} <span className="text-gray-300">· may vary</span></span>
                  : `${money(displayBalance)} remaining`}
              </p>
            </div>
          </div>

          {/* Smart milestone OR standing — one block only */}
          {milestone ? (
            <div className={`rounded-xl border p-4 flex items-start gap-3 ${variantStyles[milestone.variant].wrap}`}>
              <span className="text-xl flex-shrink-0">{milestone.emoji}</span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${variantStyles[milestone.variant].title}`}>{milestone.title}</p>
                <p className={`text-xs mt-0.5 leading-relaxed ${variantStyles[milestone.variant].msg}`}>{milestone.message}</p>
                {badStanding && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition-colors">Pay online →</a>
                    <span className="text-xs text-amber-700 self-center">or Zelle: invoices@cfgms.com</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            !badStanding ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-800">Account in good standing</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Your payments are up to date. Keep it up.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 5v4M8 11v.5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/><circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.2"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">Account needs attention</p>
                    <p className="text-xs text-red-600 mt-0.5">{isWeeklyClient ? "1 or more weekly payments have" : "2 or more daily payments have"} been returned or missed. Please pay promptly to avoid additional fees.</p>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Payment panel */}
          {!(badStanding && milestone) && (
            <div className={`rounded-xl border p-4 space-y-3 ${badStanding ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
              {!badStanding && (
                <div>
                  <p className="text-sm font-semibold text-gray-900">Make a payment</p>
                  <p className="text-xs text-gray-400 mt-0.5">Every extra payment reduces your balance dollar for dollar and brings your completion date closer.</p>
                </div>
              )}
              <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                className={`flex items-center justify-center rounded-lg px-4 py-2.5 text-xs font-medium text-white transition-colors ${badStanding ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800"}`}>
                {badStanding ? "Pay now online →" : "Pay online →"}
              </a>
              <p className="text-xs text-gray-400">⚠️ Online payments carry a 3.5% fee. To pay $100.00, submit $103.50.</p>
              <div className={`rounded-lg border px-3 py-2 text-xs ${badStanding ? "border-red-200 bg-white text-red-700" : "border-gray-100 bg-gray-50 text-gray-600"}`}>
                <span className="block font-medium">Zelle: invoices@cfgms.com</span>
                <span className={`block mt-0.5 ${badStanding ? "text-red-500" : "text-gray-400"}`}>Include your invoice # or business name — no fee</span>
              </div>
            </div>
          )}
        </div>

        {/* Calendar */}
        {fundedDate && (
          <div className="flex-shrink-0 w-48 sticky top-20">
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-700">Payment calendar</p>
                <p className="text-[9px] text-gray-400 mt-0.5">{totalTerm} {isWeeklyClient ? "weekly" : "business day"} term{termEndDate && ` · ends ${formatDate(termEndDate.toISOString().split("T")[0])}`}</p>
                {isWeeklyClient && paymentDayName && (
                  <p className="text-[9px] text-blue-500 mt-0.5 font-medium">Every {paymentDayName.charAt(0).toUpperCase() + paymentDayName.slice(1)}{holidayMovedDays.size > 0 && ` · ${holidayMovedDays.size} moved to Monday`}</p>
                )}
              </div>
              <MiniCalendar year={calYear} month={calMonth} termDays={termDays} paymentDays={paymentDays} missedDays={missedDays} holidayMovedDays={holidayMovedDays} today={today} onPrev={prevMonth} onNext={nextMonth} canPrev={canGoPrev} canNext={canGoNext} />
            </div>
          </div>
        )}
      </div>

      {/* Add-on fundings — hidden when no fundings exist */}
      <FundingsPanel
        client={selectedClient}
        isAdminView={isAdminView}
        onBalanceChange={(combined, payback) => {
          setCombinedBalance(combined);
          setCombinedPayback(payback);
        }}
      />

      {/* Payment history */}
      <PaymentHistory
        payments={payments}
        client={selectedClient}
        isAdminView={isAdminView}
        onPaymentAdded={handlePaymentAdded}
      />

      {/* Activity log */}
      <ActivityLog
        invoice={selectedClient.invoice}
        isAdminView={isAdminView}
        refreshTrigger={activityRefresh}
      />

    </div>
  );
}