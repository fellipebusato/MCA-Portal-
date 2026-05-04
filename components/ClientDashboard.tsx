"use client";

import { useState } from "react";
import PaymentHistory from "./PaymentHistory";
import { CONTACT, PORTAL, PAYMENT_LINK } from "@/lib/config";

type ClientDashboardProps = {
  selectedClient: any;
  payments: any[];
  isAdminView?: boolean;
  onPaymentAdded?: () => void;
};

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(date: string) {
  if (!date) return "—";
  const d = new Date(date);
  const utc = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

// Shared holidays 2025–2028 — single source of truth
const BANK_HOLIDAYS = new Set([
  // 2025
  "2025-01-01","2025-01-20","2025-02-17","2025-05-26","2025-06-19",
  "2025-07-04","2025-09-01","2025-10-13","2025-11-11","2025-11-27","2025-12-25",
  // 2026
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19",
  "2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  // 2027
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18",
  "2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
  // 2028
  "2028-01-01","2028-01-17","2028-02-21","2028-05-27","2028-06-19",
  "2028-07-04","2028-09-04","2028-10-09","2028-11-11","2028-11-23","2028-12-25",
]);

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function isWeekend(date: Date): boolean { return date.getDay() === 0 || date.getDay() === 6; }
function isHoliday(date: Date): boolean { return BANK_HOLIDAYS.has(toDateStr(date)); }
function isBusinessDay(date: Date): boolean { return !isWeekend(date) && !isHoliday(date); }

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addBusinessDaysToDate(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) added++;
  }
  return result;
}

function buildDailyTermDays(startDate: Date, totalTerm: number): Set<string> {
  const days = new Set<string>();
  const cursor = new Date(startDate);
  let count = 0;
  while (count < totalTerm) {
    if (isBusinessDay(cursor)) {
      days.add(toDateStr(cursor));
      count++;
    }
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
      paymentDate = new Date(cursor);
      do {
        paymentDate.setDate(paymentDate.getDate() + 1);
      } while (paymentDate.getDay() !== 1);
      while (!isBusinessDay(paymentDate)) {
        paymentDate.setDate(paymentDate.getDate() + 1);
      }
    }

    days.add(toDateStr(paymentDate));
    count++;
    cursor.setDate(cursor.getDate() + 7);
  }

  return days;
}

function buildPaymentDays(payments: any[]): Set<string> {
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

function buildMissedDays(payments: any[]): Set<string> {
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

function buildGeneralEmail(client: any): string {
  const to = client.client_email || "";
  const subject = encodeURIComponent(`Your MCA Account — Action Required`);
  const body = encodeURIComponent(
    `Hello ${client.owner_name || client.business_name},\n\n` +
    `Your account (${client.invoice}) is not in good standing. ` +
    `Please contact me directly or log in to your portal for instructions:\n\n` +
    `${PORTAL.url}\n\n` +
    `Best regards,\n${CONTACT.name}\n${CONTACT.email}\n${CONTACT.phone}`
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function buildMissedPaymentEmail(client: any, payments: any[]): string {
  const to = client.client_email || "";
  const subject = encodeURIComponent(`Missed Payment Notice — ${client.invoice}`);
  const missedDates = payments
    .filter((p) => { const desc = (p.description || "").toLowerCase(); return desc.includes("missed") || desc.includes("return"); })
    .map((p) => { const d = p.ach_date || p.payment_date; return d ? formatDate(d) : null; })
    .filter(Boolean);
  const dateList = missedDates.length > 0 ? missedDates.join(", ") : "recent dates";
  const body = encodeURIComponent(
    `Hello ${client.owner_name || client.business_name},\n\n` +
    `You have missed payment(s) on the following date(s): ${dateList}.\n\n` +
    `Please log in to your portal for additional instructions:\n\n` +
    `${PORTAL.url}\n\n` +
    `You may also pay via Zelle at invoices@cfgms.com — please include your invoice number (${client.invoice}) or business name.\n\n` +
    `Best regards,\n${CONTACT.name}\n${CONTACT.email}\n${CONTACT.phone}`
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function MiniCalendar({
  year, month, termDays, paymentDays, missedDays, holidayMovedDays, today,
  onPrev, onNext, canPrev, canNext
}: {
  year: number; month: number;
  termDays: Set<string>; paymentDays: Set<string>; missedDays: Set<string>;
  holidayMovedDays: Set<string>;
  today: Date; onPrev: () => void; onNext: () => void;
  canPrev: boolean; canNext: boolean;
}) {
  const monthNames = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
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
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-gray-400 font-medium py-0.5">{d}</div>
        ))}
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

          let bg = "", textColor = isWknd ? "text-gray-300" : "text-gray-700", title = "";

          if (isHol) {
            bg = "bg-yellow-100"; textColor = "text-yellow-700"; title = "Bank holiday";
          } else if (paid) {
            bg = "bg-emerald-100"; textColor = "text-emerald-700"; title = "Payment received";
          } else if (missed) {
            bg = "bg-red-100"; textColor = "text-red-600"; title = "Missed / returned";
          } else if (isMoved) {
            bg = "bg-orange-100"; textColor = "text-orange-700"; title = "Payment moved from holiday";
          } else if (inTerm) {
            bg = "bg-blue-50"; textColor = "text-blue-700"; title = "Expected payment day";
          }

          return (
            <div key={dateStr} title={title}
              className={`aspect-square flex items-center justify-center rounded text-[10px] font-medium ${bg} ${textColor} ${isToday ? "ring-1 ring-gray-900 font-bold" : ""}`}>
              {date.getDate()}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
        {[
          ["bg-blue-50 border border-blue-200","Expected"],
          ["bg-emerald-100","Received"],
          ["bg-red-100","Missed"],
          ["bg-yellow-100","Holiday"],
          ["bg-orange-100","Moved to Mon"],
        ].map(([cls, label]) => (
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

  const percentPaid = 100 - (Number(selectedClient.balance || 0) / Number(selectedClient.payback || 1)) * 100;
  const safePercent = Math.max(0, Math.min(100, percentPaid));
  const isWeeklyClient = selectedClient.payment_frequency === "weekly";
  const paymentDayName = (selectedClient.payment_day || "").toLowerCase();
  const paymentFrequencyLabel = isWeeklyClient
    ? `Weekly · ${paymentDayName ? paymentDayName.charAt(0).toUpperCase() + paymentDayName.slice(1) + "s" : ""}`
    : "Daily";
  const totalPaid = Number(selectedClient.payback || 0) - Number(selectedClient.balance || 0);

  const fundedDate = selectedClient.funded_date ? new Date(selectedClient.funded_date + "T00:00:00") : null;
  const totalTerm = Number(selectedClient.total_term || 0);

  // Build term days
  const termDays = fundedDate && totalTerm > 0
    ? isWeeklyClient && paymentDayName
      ? buildWeeklyTermDays(fundedDate, totalTerm, paymentDayName)
      : buildDailyTermDays(fundedDate, totalTerm)
    : new Set<string>();

  // For weekly: identify holiday-moved days (orange)
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
      termEndDate = addBusinessDaysToDate(fundedDate, totalTerm);
    }
  }

  const paymentDays = buildPaymentDays(payments);
  const missedDays = buildMissedDays(payments);

  const returnedPayments = payments.filter(p => {
    const desc = (p.description || "").toLowerCase();
    return desc.includes("return") || desc.includes("missed");
  });

  const badStanding = isWeeklyClient
    ? returnedPayments.length >= 1
    : returnedPayments.length >= 2;

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  // Calendar nav bounds — dynamic based on funded date and term end date
  // Allow 1 month before funded date and 1 month after term end (or +2 years fallback)
  const calMinYear = fundedDate ? fundedDate.getFullYear() : today.getFullYear();
  const calMinMonth = fundedDate ? Math.max(0, fundedDate.getMonth() - 1) : 0;
  // Always allow at least 6 months past today regardless of term end
// This handles pauses, restructures, and extended deals
const naturalMax = termEndDate || new Date(today.getFullYear() + 2, today.getMonth(), 1);
const sixMonthsOut = new Date(today.getFullYear(), today.getMonth() + 6, 1);
const calMaxDate = naturalMax > sixMonthsOut ? naturalMax : sixMonthsOut;
const calMaxYear = calMaxDate.getFullYear();
const calMaxMonth = Math.min(11, calMaxDate.getMonth() + 1);

  const canGoPrev = calYear > calMinYear || (calYear === calMinYear && calMonth > calMinMonth);
  const canGoNext = calYear < calMaxYear || (calYear === calMaxYear && calMonth < calMaxMonth);

  const showCalendar = !!(fundedDate);
  const hasMissedPayments = payments.some(p => {
    const desc = (p.description || "").toLowerCase();
    return desc.includes("missed") || desc.includes("return");
  });

  function handlePaymentAdded() {
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
            <p className="text-sm text-gray-400 mt-0.5">
              {selectedClient.invoice} · Funded {formatDate(selectedClient.funded_date)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {isAdminView && (
              <div className="flex flex-wrap gap-2">
                {selectedClient.client_email && (
                  <>
                    <a href={buildGeneralEmail(selectedClient)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1 3l5 3.5L11 3M1 3h10v7H1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Send notice
                    </a>
                    {hasMissedPayments && (
                      <a href={buildMissedPaymentEmail(selectedClient, payments)}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1 3l5 3.5L11 3M1 3h10v7H1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Missed payment notice
                      </a>
                    )}
                  </>
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

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Funded</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.funded || 0))}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payback</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.payback || 0))}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.balance || 0))}</p>
              <p className="text-xs text-gray-400 mt-1">{money(totalPaid)} paid so far</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{paymentFrequencyLabel} payment</p>
              <p className="text-lg font-semibold text-gray-900">{money(Number(selectedClient.payment || 0))}</p>
            </div>
          </div>

          {/* Progress */}
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
                {termEndDate ? `Ends: ${formatDate(termEndDate.toISOString().split("T")[0])}` : `${money(Number(selectedClient.balance || 0))} remaining`}
              </p>
            </div>
          </div>

          {/* Standing */}
          {!badStanding ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l4 4 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 5v4M8 11v.5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/>
                    <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.2"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-red-800">Account needs attention — Bad Standing</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {isWeeklyClient ? "1 or more weekly payments have" : "2 or more daily payments have"} been returned or missed. Please pay promptly via the link or Zelle to avoid additional fees.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payment action box */}
          {badStanding && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
              <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                className="block text-center rounded-lg bg-red-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-red-700 transition-colors">
                Pay now online →
              </a>
              <p className="text-xs text-red-500">⚠️ Online payments carry a 3.5% fee. To pay $100.00, submit $103.50.</p>
              <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700">
                <span className="block font-medium">Zelle: invoices@cfgms.com</span>
                <span className="block text-red-500 mt-0.5">Include your invoice # or business name</span>
              </div>
            </div>
          )}

        </div>

        {/* Calendar */}
        {showCalendar && (
          <div className="flex-shrink-0 w-48 sticky top-20">
            <div className="space-y-3">
              <div className="rounded-xl bg-white border border-gray-100 p-4">
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-700">Payment calendar</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">
                    {totalTerm} {isWeeklyClient ? "weekly" : "business day"} term
                    {termEndDate && ` · ends ${formatDate(termEndDate.toISOString().split("T")[0])}`}
                  </p>
                  {isWeeklyClient && paymentDayName && (
                    <p className="text-[9px] text-blue-500 mt-0.5 font-medium">
                      Every {paymentDayName.charAt(0).toUpperCase() + paymentDayName.slice(1)}
                      {holidayMovedDays.size > 0 && ` · ${holidayMovedDays.size} moved to Monday`}
                    </p>
                  )}
                </div>
                <MiniCalendar
                  year={calYear} month={calMonth}
                  termDays={termDays} paymentDays={paymentDays}
                  missedDays={missedDays} holidayMovedDays={holidayMovedDays}
                  today={today} onPrev={prevMonth} onNext={nextMonth}
                  canPrev={canGoPrev} canNext={canGoNext}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment history — Add Payment button lives here only, not duplicated above */}
      <PaymentHistory
        payments={payments}
        client={selectedClient}
        isAdminView={isAdminView}
        onPaymentAdded={handlePaymentAdded}
      />
    </div>
  );
}