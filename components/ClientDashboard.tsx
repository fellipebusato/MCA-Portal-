"use client";

import { useState } from "react";
import PaymentHistory from "./PaymentHistory";

type ClientDashboardProps = {
  selectedClient: any;
  payments: any[];
};

const PAYMENT_LINK = "https://zohosecurepay.com/checkout/iuh0ui5-xp013mz2w5xz9/CFG-Merchant-Solutions-Payment-Portal";

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(date: string) {
  if (!date) return "—";
  const d = new Date(date);
  const utc = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

const BANK_HOLIDAYS = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19",
  "2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18",
  "2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
]);

function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

function isHoliday(date: Date): boolean {
  return BANK_HOLIDAYS.has(toDateStr(date));
}

function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

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

function buildTermDays(startDate: Date, totalTerm: number): Set<string> {
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

function buildPaymentDays(payments: any[]): Set<string> {
  const days = new Set<string>();
  for (const p of payments) {
    const desc = (p.description || "").toLowerCase();
    if (desc.includes("posted") || desc.includes("payment")) {
      if (!desc.includes("missed") && !desc.includes("return")) {
        const d = p.ach_date || p.payment_date;
        if (d) days.add(d.split("T")[0]);
      }
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

function CalendarMonth({
  year, month, termDays, paymentDays, missedDays, today
}: {
  year: number;
  month: number;
  termDays: Set<string>;
  paymentDays: Set<string>;
  missedDays: Set<string>;
  today: Date;
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
    <div className="rounded-xl bg-white border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 text-center">
        {monthNames[month]} {year}
      </h3>

      <div className="grid grid-cols-7 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} />;

          const dateStr = toDateStr(date);
          const isToday = toDateStr(date) === toDateStr(today);
          const isWknd = isWeekend(date);
          const isHol = isHoliday(date);
          const inTerm = termDays.has(dateStr);
          const paid = paymentDays.has(dateStr);
          const missed = missedDays.has(dateStr);

          let bg = "";
          let textColor = "text-gray-900";
          let title = "";

          if (isHol) {
            bg = "bg-yellow-100";
            textColor = "text-yellow-800";
            title = "Bank holiday — no payments";
          } else if (isWknd) {
            textColor = "text-gray-400";
          } else if (paid) {
            bg = "bg-emerald-100";
            textColor = "text-emerald-800";
            title = "Payment received";
          } else if (missed) {
            bg = "bg-red-100";
            textColor = "text-red-700";
            title = "Missed / returned payment";
          } else if (inTerm) {
            bg = "bg-blue-50";
            textColor = "text-blue-800";
            title = "Expected payment day";
          }

          return (
            <div
              key={dateStr}
              title={title}
              className={`
                relative flex items-center justify-center rounded text-xs py-1.5
                ${bg} ${textColor}
                ${isToday ? "ring-2 ring-gray-900 font-bold" : ""}
              `}
            >
              {date.getDate()}
              {isHol && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-yellow-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientDashboard({ selectedClient, payments }: ClientDashboardProps) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const percentPaid = 100 - (Number(selectedClient.balance || 0) / Number(selectedClient.payback || 1)) * 100;
  const safePercent = Math.max(0, Math.min(100, percentPaid));
  const isGoodStanding = selectedClient.status === "Good Standing";
  const paymentFrequency = selectedClient.payment_frequency === "weekly" ? "Weekly" : "Daily";
  const totalPaid = Number(selectedClient.payback || 0) - Number(selectedClient.balance || 0);

  const fundedDate = selectedClient.funded_date
    ? new Date(selectedClient.funded_date + "T00:00:00")
    : null;
  const totalTerm = Number(selectedClient.total_term || 0);

  const termDays = fundedDate && totalTerm > 0
    ? buildTermDays(fundedDate, totalTerm)
    : new Set<string>();

  const termEndDate = fundedDate && totalTerm > 0
    ? addBusinessDaysToDate(fundedDate, totalTerm)
    : null;

  const paymentDays = buildPaymentDays(payments);
  const missedDays = buildMissedDays(payments);

  const missedCount = Array.from(termDays).filter(d => {
    const date = new Date(d + "T00:00:00");
    return date <= today && !paymentDays.has(d) && !missedDays.has(d);
  }).length;

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  const canGoPrev = calYear > 2026 || (calYear === 2026 && calMonth > 0);
  const canGoNext = calYear < 2027 || (calYear === 2027 && calMonth < 11);

  return (
    <div className="space-y-5">

      {/* Header card */}
      <div className="rounded-xl bg-white border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Account</p>
            <h2 className="text-xl font-semibold text-gray-900">{selectedClient.business_name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {selectedClient.invoice} · Funded {formatDate(selectedClient.funded_date)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400 mb-1">Need help?</p>
            <p className="text-sm font-medium text-gray-900">fbusato@cfgms.com</p>
            <p className="text-sm text-gray-500">+1 (917) 920-0881</p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Funded</p>
          <p className="text-xl font-semibold text-gray-900">{money(Number(selectedClient.funded || 0))}</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payback</p>
          <p className="text-xl font-semibold text-gray-900">{money(Number(selectedClient.payback || 0))}</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance</p>
          <p className="text-xl font-semibold text-gray-900">{money(Number(selectedClient.balance || 0))}</p>
          <p className="text-xs text-gray-400 mt-1">{money(totalPaid)} paid so far</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{paymentFrequency} payment</p>
          <p className="text-xl font-semibold text-gray-900">{money(Number(selectedClient.payment || 0))}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl bg-white border border-gray-100 p-5">
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
              ? `Expected completion: ${formatDate(termEndDate.toISOString().split("T")[0])}`
              : `${money(Number(selectedClient.balance || 0))} remaining`}
          </p>
        </div>
      </div>

      {/* Standing banner */}
      {isGoodStanding ? (
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
        <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
          className="block rounded-xl bg-red-50 border border-red-100 p-4 hover:bg-red-100 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 5v4M8 11v.5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.2"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-red-800">Account needs attention — click to make a payment</p>
              <p className="text-xs text-red-600 mt-0.5">One or more payments require action. Click here to pay now.</p>
            </div>
            <svg className="ml-auto" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </a>
      )}

      {/* Payment calendar */}
      {fundedDate && totalTerm > 0 && (
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Payment calendar</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalTerm} business day term · Started {formatDate(selectedClient.funded_date)}
                {termEndDate && ` · Ends ${formatDate(termEndDate.toISOString().split("T")[0])}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                disabled={!canGoPrev}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              <span className="text-sm font-medium text-gray-700 min-w-32 text-center">
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][calMonth]} {calYear}
              </span>
              <button
                onClick={nextMonth}
                disabled={!canGoNext}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
          </div>

          <CalendarMonth
            year={calYear}
            month={calMonth}
            termDays={termDays}
            paymentDays={paymentDays}
            missedDays={missedDays}
            today={today}
          />

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-50 border border-blue-200" />
              <span className="text-xs text-gray-500">Expected payment day</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-100" />
              <span className="text-xs text-gray-500">Payment received</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-100" />
              <span className="text-xs text-gray-500">Missed / returned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-yellow-100" />
              <span className="text-xs text-gray-500">Bank holiday — no payments</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded border-2 border-gray-900" />
              <span className="text-xs text-gray-500">Today</span>
            </div>
          </div>
        </div>
      )}

      {/* Attention box — days behind */}
      {missedCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 flex-shrink-0 mt-0.5">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 6v4M9 12v.5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="9" cy="9" r="7.5" stroke="#dc2626" strokeWidth="1.2"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                You are {missedCount} {missedCount === 1 ? "day" : "days"} behind schedule
              </p>
              <p className="text-xs text-red-600 mt-1">
                To stay on track, please make up for missed payments as soon as possible. You can pay online or via Zelle.
              </p>
              <div className="flex gap-3 mt-3 flex-wrap">
                <a
                  href={PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Pay now online →
                </a>
                <div className="inline-block rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-700">
                  <span className="block">Zelle: invoices@cfgms.com</span>
                  <span className="block text-red-500 mt-0.5">Include your invoice # or business name</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment history */}
      <PaymentHistory payments={payments} />
    </div>
  );
}