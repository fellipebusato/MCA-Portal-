import { addBusinessDays, formatDate, isBusinessDay, toDateStr } from "@/lib/holidays";
import { getReturnCodeInfo } from "@/lib/achReturns";
import type { Client, Payment } from "@/lib/types";

export type SegmentationBucket = "healthy" | "watch" | "critical" | "blocked";
export type SubFlag = "renewal_ready" | "maturing" | "three_pct_at_risk" | "new_this_month" | "paused";

export interface MonthlySnapshot {
  org_id?: string;
  invoice: string;
  snapshot_date: string;
  balance_at_snapshot: number;
  minimum_required: number;
  received_this_month: number;
}

export interface SegmentationResult {
  segment: SegmentationBucket;
  subFlags: SubFlag[];
  monthlyMinimum: number;
  monthlyReceived: number;
  monthlyProgressPct: number;
  reasons: string[];
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseIsoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const value = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) return null;
  result.setHours(0, 0, 0, 0);
  return result;
}

function sameMonthAndYear(dateStr: string | null | undefined, today: Date): boolean {
  const d = parseIsoDate(dateStr);
  return !!d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function businessDaysBetween(start: Date, end: Date): number {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  let count = 0;
  while (cursor.getTime() <= stop.getTime()) {
    if (isBusinessDay(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 0, 0, 0, 0);
}

function getBusinessDaysRemainingInMonth(today: Date): number {
  const start = new Date(today);
  start.setDate(today.getDate() + 1);
  const end = getEndOfMonth(today);
  return businessDaysBetween(start, end);
}

function getWeeklyPullsRemainingInMonth(today: Date, paymentDay: string | null): number {
  const targetDow = paymentDay ? DAY_NAME_TO_NUM[paymentDay.toLowerCase()] : 5;
  if (targetDow === undefined || targetDow < 0) return 1;

  const endOfMonth = getEndOfMonth(today);
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor.getTime() <= endOfMonth.getTime()) {
    if (cursor.getDay() === targetDow && isBusinessDay(cursor)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.max(1, count);
}

function getPaymentLifecycle(payment: Payment): "pending" | "settled" | "returned" | "paused" {
  if (payment.payment_lifecycle) return payment.payment_lifecycle;
  const desc = (payment.description || "").toLowerCase();
  if (desc.includes("paused") || desc.includes("pause")) return "paused";
  if (desc.includes("return") || desc.includes("returned") || Number(payment.returns || 0) > 0) return "returned";
  if (!payment.settlement_date) return "pending";
  const settleDate = parseIsoDate(payment.settlement_date);
  if (!settleDate) return "pending";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (settleDate <= today) return "settled";
  return "pending";
}

function getRelevantPaymentDate(payment: Payment): Date | null {
  return parseIsoDate(payment.ach_date) || parseIsoDate(payment.payment_date) || parseIsoDate(payment.settlement_date);
}

function countConfirmedStrikes(payments: Payment[], today: Date, windowDays = 60, ignoreIfPaused = false): number {
  if (ignoreIfPaused) return 0;
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - windowDays);
  windowStart.setHours(0, 0, 0, 0);

  return payments.reduce((count, payment) => {
    const lifecycle = getPaymentLifecycle(payment);
    if (lifecycle !== "returned") return count;
    const paymentDate = getRelevantPaymentDate(payment);
    if (!paymentDate) return count;
    if (!isDateInRange(paymentDate, windowStart, today)) return count;
    return count + 1;
  }, 0);
}

function sumSettledDebitThisMonth(payments: Payment[], monthStart: Date, today: Date): number {
  return payments.reduce((sum, payment) => {
    const lifecycle = getPaymentLifecycle(payment);
    if (lifecycle === "returned" || lifecycle === "paused") return sum;
    if (payment.debit <= 0) return sum;
    const settled = parseIsoDate(payment.settlement_date);
    if (!settled) return sum;
    if (!isDateInRange(settled, monthStart, today)) return sum;
    const desc = (payment.description || "").toLowerCase();
    if (desc.includes("return") || desc.includes("missed")) return sum;
    return sum + Number(payment.debit || 0);
  }, 0);
}

function isCurrentlyPaused(client: Client, today: Date): boolean {
  if (client.status === "Paused" || client.payment_status === "paused") return true;
  const start = parseIsoDate(client.pause_start);
  const end = parseIsoDate(client.pause_end);
  if (!start || !end) return false;
  today.setHours(0, 0, 0, 0);
  return today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
}

function isXCodeReturn(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.trim().toUpperCase().startsWith("X");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function segmentClient(
  client: Client,
  payments: Payment[],
  snapshot: MonthlySnapshot | null,
  today: Date
): SegmentationResult {
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0);

  const balanceAtSnapshot = snapshot?.balance_at_snapshot ?? Number(client.balance);
  const newThisMonth = sameMonthAndYear(client.funded_date, current);
  const monthlyMinimum = newThisMonth
    ? 0
    : roundMoney(snapshot?.minimum_required ?? Math.ceil(Number(balanceAtSnapshot || 0) * 0.03 * 100) / 100);
  const monthlyReceived = roundMoney(sumSettledDebitThisMonth(payments, monthStart, current));
  const monthlyProgressPct = monthlyMinimum > 0 ? Math.min(999, Math.round((monthlyReceived / monthlyMinimum) * 100)) : 100;
  const paused = isCurrentlyPaused(client, current);
  const xBlocked = client.x_code_blocked === true || isXCodeReturn(client.last_return_code);
  const returnStreak = Number(client.return_streak || 0);

  const confirmedReturnCount = countConfirmedStrikes(payments, current, 90, paused);
  const hasAnyReturn = confirmedReturnCount > 0;
  const hasIsolatedStrike = confirmedReturnCount === 1;
  const frequency = client.payment_frequency;

  const remainingBusinessDays = getBusinessDaysRemainingInMonth(current);
  const remainingPulls = frequency === "weekly" ? getWeeklyPullsRemainingInMonth(current, client.payment_day) : remainingBusinessDays;
  const paymentAmount = Number(client.payment || 0);
  const remainingRequired = Math.max(0, monthlyMinimum - monthlyReceived);
  const recoveryCapacity = remainingPulls * paymentAmount;
  const canRecoverThisMonth = remainingRequired <= 0 || recoveryCapacity >= remainingRequired;
  const monthEnd = getEndOfMonth(current);
  const monthOver = current.getTime() > monthEnd.getTime();

  const reasons: string[] = [];
  const subFlags: SubFlag[] = [];

  if (newThisMonth) {
    subFlags.push("new_this_month");
    reasons.push("New this month — exempt from the 3% minimum rule.");
  }

  if (paused) {
    subFlags.push("paused");
    reasons.push("Payments are currently paused; pauses do not count as misses.");
  }

  if (xBlocked) {
    const reasonCode = client.last_return_code ? client.last_return_code.toUpperCase() : "X-code block";
    reasons.push(`Blocked by ACH Works X-code ${reasonCode}.`);
  }

  if (returnStreak >= 3) {
    reasons.push("Three or more consecutive returns — critical risk.");
  }

  if (frequency === "daily" && !paused && confirmedReturnCount >= 3) {
    reasons.push("Daily client with three or more confirmed returned/missed pulls.");
  }

  if (frequency === "weekly" && !paused && confirmedReturnCount >= 1) {
    reasons.push("Weekly client with one or more confirmed returned/missed pulls.");
  }

  if (!newThisMonth && monthlyMinimum > 0 && monthlyReceived < monthlyMinimum) {
    const shortage = roundMoney(monthlyMinimum - monthlyReceived);
    if (!canRecoverThisMonth) {
      reasons.push("Behind the 3% minimum and not enough business days remain to recover.");
    } else {
      reasons.push(`Behind the 3% minimum by $${shortage.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, still able to recover this month.`);
    }
  }

  if (!xBlocked && returnStreak < 3 && (frequency !== "daily" || confirmedReturnCount < 3) && (frequency !== "weekly" || confirmedReturnCount < 1) && (!newThisMonth && monthlyReceived >= monthlyMinimum || newThisMonth || canRecoverThisMonth)) {
    reasons.push("No active X-code block and pacing is within recovery range.");
  }

  const paidRatio = client.payback > 0 ? Number(client.paid || 0) / Number(client.payback || 0) : 0;
  const renewalReady = paidRatio >= 0.5 && paidRatio < 1 && (!xBlocked && !returnStreak && monthlyReceived >= monthlyMinimum || newThisMonth);
  const maturing = paidRatio >= 0.8 && paidRatio < 1;

  if (renewalReady) subFlags.push("renewal_ready");
  if (maturing) subFlags.push("maturing");
  if (!newThisMonth && monthlyReceived < monthlyMinimum && !monthOver) subFlags.push("three_pct_at_risk");

  let segment: SegmentationBucket = "healthy";
  if (xBlocked) {
    segment = "blocked";
  } else if (returnStreak >= 3 || (!paused && ((frequency === "daily" && confirmedReturnCount >= 3) || (frequency === "weekly" && confirmedReturnCount >= 1))) || (!newThisMonth && monthlyReceived < monthlyMinimum && !canRecoverThisMonth)) {
    segment = "critical";
  } else if (!paused && (hasAnyReturn || (monthlyReceived < monthlyMinimum && canRecoverThisMonth) || hasIsolatedStrike)) {
    segment = "watch";
  }

  if (segment === "healthy" && reasons.length === 0) {
    reasons.push("On-time payments and 3% pace hold steady.");
  }

  return {
    segment,
    subFlags,
    monthlyMinimum,
    monthlyReceived,
    monthlyProgressPct,
    reasons,
  };
}
