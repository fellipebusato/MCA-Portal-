// lib/snapshots.ts
// Monthly balance snapshot utility for the 3% rule.
//
// On portal load (any day of the month), ensures every active client has a
// snapshot for the current month. If a client has no snapshot for this month,
// one is created using their CURRENT balance — which functions as the
// month-start balance for that client going forward.
//
// Rules:
//   - Skip clients with zero/negative balance (closed).
//   - Skip clients funded in the current month (3%-exempt per spec section 3.1).
//   - Use upsert with ignoreDuplicates so this is safe to call on every load.
//
// Internal only — never shown to clients.

import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function isCurrentMonth(value: string | null | undefined, today: Date): boolean {
  const date = parseIsoDate(value);
  return !!date && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function currentMonthSnapshotDate(today: Date): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Ensure every eligible client has a current-month snapshot.
 * Self-heals: safe to call on every portal load.
 *
 * Each client's snapshot is upserted using that client's own org_id (so this
 * works in any multi-tenant setup without the caller needing to pass orgId).
 */
export async function ensureMonthlySnapshots(clients: Client[]): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const snapshotDate = currentMonthSnapshotDate(today);

  // Find which invoices already have a snapshot for this month so we only
  // INSERT missing ones. This avoids hammering Supabase with hundreds of
  // upserts on every page load — one read, then only the writes we need.
  const invoices = clients.map(c => c.invoice).filter(Boolean);
  if (invoices.length === 0) return;

  const { data: existingRows } = await supabase
    .from("monthly_snapshots")
    .select("invoice")
    .eq("snapshot_date", snapshotDate)
    .in("invoice", invoices);

  const existing = new Set((existingRows || []).map(r => r.invoice));

  // Build the set of rows to insert.
  const toInsert: Array<{
    org_id: string;
    invoice: string;
    snapshot_date: string;
    balance_at_snapshot: number;
    minimum_required: number;
    received_this_month: number;
  }> = [];

  for (const client of clients) {
    if (!client.invoice) continue;
    if (existing.has(client.invoice)) continue;
    if (Number(client.balance) <= 0) continue;
    if (isCurrentMonth(client.funded_date, today)) continue;

    const balance = Number(client.balance) || 0;
    const minimum = Math.ceil(balance * 0.03 * 100) / 100;

    toInsert.push({
      org_id: client.org_id,
      invoice: client.invoice,
      snapshot_date: snapshotDate,
      balance_at_snapshot: balance,
      minimum_required: minimum,
      received_this_month: 0,
    });
  }

  if (toInsert.length === 0) return;

  // Insert in chunks of 200 to stay well under any payload limits.
  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("monthly_snapshots")
      .upsert(chunk, { onConflict: "invoice,snapshot_date", ignoreDuplicates: true });
    if (error) {
      // Don't throw — snapshot creation failing should not crash the portal.
      // The segmentation engine has a fallback (current balance) when no
      // snapshot exists.
      console.error("[ensureMonthlySnapshots] insert error:", error.message);
      return;
    }
  }
}

/**
 * Fetch all current-month snapshots for the given invoices.
 * Used by the Segmentation view to feed real snapshot data into segmentClient.
 */
export async function fetchCurrentMonthSnapshots(invoices: string[]): Promise<Array<{
  org_id: string;
  invoice: string;
  snapshot_date: string;
  balance_at_snapshot: number;
  minimum_required: number;
  received_this_month: number;
}>> {
  if (invoices.length === 0) return [];
  const today = new Date();
  const snapshotDate = currentMonthSnapshotDate(today);

  const { data, error } = await supabase
    .from("monthly_snapshots")
    .select("*")
    .eq("snapshot_date", snapshotDate)
    .in("invoice", invoices);

  if (error) {
    console.error("[fetchCurrentMonthSnapshots] error:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Legacy single-client progress fetcher.
 * Preserved for any callers still using it; segmentation now does its own
 * monthlyReceived math from the loaded payments.
 */
export async function getMonthlyProgress(
  invoice: string
): Promise<{ balanceAtSnapshot: number; minimumRequired: number; receivedThisMonth: number; status: "safe" | "at_risk" | "default" } | null> {
  const today = new Date();
  const snapshotDate = currentMonthSnapshotDate(today);

  const { data: snapshot } = await supabase
    .from("monthly_snapshots")
    .select("*")
    .eq("invoice", invoice)
    .eq("snapshot_date", snapshotDate)
    .single();

  if (!snapshot) return null;

  const monthStart = snapshotDate;
  const { data: payments } = await supabase
    .from("payments")
    .select("debit, settlement_date, description, payment_status")
    .eq("invoice", invoice)
    .gte("settlement_date", monthStart)
    .lte("settlement_date", today.toISOString().split("T")[0]);

  const received = (payments || []).reduce((sum, p) => {
    if (p.payment_status === "returned") return sum;
    const desc = (p.description || "").toLowerCase();
    if (desc.includes("return") || desc.includes("missed")) return sum;
    return sum + Number(p.debit || 0);
  }, 0);

  await supabase.from("monthly_snapshots").update({
    received_this_month: received,
  }).eq("invoice", invoice).eq("snapshot_date", snapshotDate);

  const status = received >= snapshot.minimum_required
    ? "safe"
    : received >= snapshot.minimum_required * 0.5
    ? "at_risk"
    : "default";

  return {
    balanceAtSnapshot: snapshot.balance_at_snapshot,
    minimumRequired: snapshot.minimum_required,
    receivedThisMonth: received,
    status,
  };
}
