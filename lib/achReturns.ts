// lib/achReturns.ts
// ACH return code classification engine
// Handles R codes (NACHA standard) and X codes (ACHWorks internal blocks)

import { addBusinessDays, toDateStr } from "@/lib/holidays";

// ── Return code metadata ─────────────────────────────────────────────────────

export type ReturnTier = 1 | 2 | 3;

export interface ReturnCodeInfo {
  code: string;
  description: string;
  tier: ReturnTier;
  isXCode: boolean;
  action: string; // What to do
  canRetry: boolean;
}

const R_CODES: Record<string, Omit<ReturnCodeInfo, "code" | "isXCode">> = {
  // ── TIER 1 — CRITICAL ─────────────────────────────────────────────────────
  R02: {
    description: "Account closed",
    tier: 1,
    action: "Cannot retry. Call client immediately — need new bank account info.",
    canRetry: false,
  },
  R03: {
    description: "No account / unable to locate",
    tier: 1,
    action: "Account not found at bank. Verify routing + account number with client.",
    canRetry: false,
  },
  R04: {
    description: "Invalid account number",
    tier: 1,
    action: "Bad account number structure. Get correct account info from client.",
    canRetry: false,
  },
  R07: {
    description: "Authorization revoked by customer",
    tier: 1,
    action: "Client told their bank to block you. Call immediately — legal exposure risk.",
    canRetry: false,
  },
  R10: {
    description: "Customer advises not authorized",
    tier: 1,
    action: "Client is disputing the transaction. Call immediately — legal exposure.",
    canRetry: false,
  },
  R16: {
    description: "Account frozen / OFAC instruction",
    tier: 1,
    action: "Account frozen — could be fraud or regulatory flag. Escalate immediately.",
    canRetry: false,
  },
  R29: {
    description: "Debit block / corporate customer not authorized",
    tier: 1,
    action: "Bank-level block on ACH debits. Need new account or written authorization.",
    canRetry: false,
  },

  // ── TIER 2 — HIGH ─────────────────────────────────────────────────────────
  R01: {
    description: "Insufficient funds",
    tier: 2,
    action: "Call client today. Can retry up to 2x within 30 days. Ask about timing.",
    canRetry: true,
  },
  R08: {
    description: "Payment stopped",
    tier: 2,
    action: "Client issued stop payment. Call to get new ACH authorization before retry.",
    canRetry: true,
  },
  R09: {
    description: "Uncollected funds",
    tier: 2,
    action: "Funds deposited but not yet cleared at their bank. May resolve — call client.",
    canRetry: true,
  },

  // ── TIER 3 — MONITOR ──────────────────────────────────────────────────────
  R05: {
    description: "Unauthorized debit to consumer account",
    tier: 3,
    action: "Review authorization documents. Contact client within 48 hours.",
    canRetry: false,
  },
  R06: {
    description: "Returned per ODFI request",
    tier: 3,
    action: "Operational return — not client fault. Log and monitor.",
    canRetry: true,
  },
  R11: {
    description: "Check truncation entry return",
    tier: 3,
    action: "Log and monitor. Contact client if recurring.",
    canRetry: false,
  },
  R12: {
    description: "Account sold to another DFI",
    tier: 3,
    action: "Bank changed. Get updated account info from client.",
    canRetry: false,
  },
  R13: {
    description: "Invalid ACH routing number",
    tier: 3,
    action: "Routing number is wrong. Get correct bank info from client.",
    canRetry: false,
  },
  R20: {
    description: "Non-transaction account",
    tier: 3,
    action: "Account type cannot accept ACH debits (e.g. savings). Get checking account.",
    canRetry: false,
  },
  R23: {
    description: "Credit entry refused by receiver",
    tier: 3,
    action: "Log and monitor.",
    canRetry: false,
  },
  R24: {
    description: "Duplicate entry",
    tier: 3,
    action: "Possible duplicate submission. Verify in ACH Works before any action.",
    canRetry: false,
  },
};

// X codes — ACHWorks internal blocks (triggered after 4+ R01 returns)
const X_CODES: Record<string, Omit<ReturnCodeInfo, "code" | "isXCode">> = {
  X01: {
    description: "ACHWorks internal block — insufficient funds (4+ returns)",
    tier: 1,
    action: "⚠️ ACH Works locked this account. You must manually remove the X01 block in ACH Works before any future pull. Call client — restructure or pause deal.",
    canRetry: false,
  },
  X07: {
    description: "ACHWorks internal block — authorization issue (4+ returns)",
    tier: 1,
    action: "⚠️ ACH Works locked this account. Manually remove block in ACH Works. Call client immediately.",
    canRetry: false,
  },
  X08: {
    description: "ACHWorks internal block — payment stopped (4+ returns)",
    tier: 1,
    action: "⚠️ ACH Works locked this account. Manually remove block in ACH Works. New authorization required from client.",
    canRetry: false,
  },
};

export function getReturnCodeInfo(code: string): ReturnCodeInfo {
  const clean = code.trim().toUpperCase();

  if (clean.startsWith("X")) {
    const xInfo = X_CODES[clean];
    if (xInfo) return { code: clean, isXCode: true, ...xInfo };
    // Unknown X code fallback
    return {
      code: clean,
      isXCode: true,
      description: `ACHWorks internal block (${clean})`,
      tier: 1,
      action: "⚠️ ACH Works internal block. Manually remove in ACH Works and call client.",
      canRetry: false,
    };
  }

  const rInfo = R_CODES[clean];
  if (rInfo) return { code: clean, isXCode: false, ...rInfo };

  // Unknown R code fallback
  return {
    code: clean,
    isXCode: false,
    description: `Return code ${clean}`,
    tier: 3,
    action: "Log and review. Look up code if unfamiliar.",
    canRetry: false,
  };
}

export function getTierLabel(tier: ReturnTier): string {
  if (tier === 1) return "Critical";
  if (tier === 2) return "High";
  return "Monitor";
}

export function getTierColors(tier: ReturnTier): {
  bg: string; border: string; color: string; dot: string;
} {
  if (tier === 1) return {
    bg: "rgba(190,40,40,0.08)",
    border: "rgba(190,40,40,0.25)",
    color: "#b82020",
    dot: "#d03030",
  };
  if (tier === 2) return {
    bg: "rgba(196,140,40,0.08)",
    border: "rgba(196,140,40,0.25)",
    color: "#a07010",
    dot: "#c48c28",
  };
  return {
    bg: "var(--parchment-2)",
    border: "var(--border)",
    color: "var(--ink-3)",
    dot: "var(--ink-4)",
  };
}

// ── ACH pull date calculator ─────────────────────────────────────────────────
// Return date = pull date + 2 business days
// So: pull date = return date - 2 business days (go backwards)

export function getPullDateFromReturnDate(returnDateStr: string): string {
  const returnDate = new Date(returnDateStr + "T00:00:00");
  // Subtract 2 business days
  const result = new Date(returnDate);
  let subtracted = 0;
  while (subtracted < 2) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) subtracted++;
  }
  return toDateStr(result);
}

// Settlement date = pull date + 4 business days
export function getSettlementDateFromPullDate(pullDateStr: string): string {
  const pullDate = new Date(pullDateStr + "T00:00:00");
  return toDateStr(addBusinessDays(pullDate, 4));
}

// Return settle date = return date + 2 business days (reversal posts)  
export function getReturnSettleDateFromReturnDate(returnDateStr: string): string {
  const returnDate = new Date(returnDateStr + "T00:00:00");
  return toDateStr(addBusinessDays(returnDate, 2));
}

// ── Payment status logic for client view ─────────────────────────────────────

export type PaymentDisplayStatus = "pending" | "processing" | "returned" | "settled";

export function getPaymentDisplayStatus(payment: {
  ach_date: string;
  settlement_date: string;
  description: string;
  returns?: number;
}): PaymentDisplayStatus {
  const desc = (payment.description || "").toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Returned
  if (
    desc.includes("return") ||
    desc.includes("returned") ||
    (payment.returns && Number(payment.returns) > 0)
  ) return "returned";

  if (!payment.settlement_date) return "pending";

  const settlDate = new Date(payment.settlement_date + "T00:00:00");

  // Settled — settlement date is in the past and not a return
  if (settlDate <= today && !desc.includes("return")) return "settled";

  // Return window passed (Day +2 cleared) but not yet settlement date (Day +4)
  // This means the 3PM return report came in and this client was NOT on it
  if (payment.ach_date) {
    const achDate = new Date(payment.ach_date + "T00:00:00");
    const returnWindowDate = addBusinessDays(achDate, 2);
    if (today > returnWindowDate) return "processing";
  }

  return "pending";
}
