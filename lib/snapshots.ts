// lib/snapshots.ts
// Monthly balance snapshot utility
// On the 1st of each month, captures every client's balance
// Used to track the 3% monthly minimum (default trigger)
// This is internal only — never shown to clients

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

export async function ensureMonthlySnapshots(
  clients: Client[],
  orgId: string
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const snapshotDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  for (const client of clients) {
    if (Number(client.balance) <= 0) continue;
    if (isCurrentMonth(client.funded_date, today)) continue;

    const minimum = Math.ceil(Number(client.balance) * 0.03 * 100) / 100;

    // Only insert if not already snapshotted this month
    await supabase.from("monthly_snapshots").upsert({
      org_id: orgId,
      invoice: client.invoice,
      snapshot_date: snapshotDate,
      balance_at_snapshot: Number(client.balance),
      minimum_required: minimum,
      received_this_month: 0,
    }, { onConflict: "invoice,snapshot_date", ignoreDuplicates: true });
  }
}

export async function getMonthlyProgress(
  invoice: string
): Promise<{ balanceAtSnapshot: number; minimumRequired: number; receivedThisMonth: number; status: "safe" | "at_risk" | "default" } | null> {
  const today = new Date();
  const snapshotDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: snapshot } = await supabase
    .from("monthly_snapshots")
    .select("*")
    .eq("invoice", invoice)
    .eq("snapshot_date", snapshotDate)
    .single();

  if (!snapshot) return null;

  // Sum all settled payments this month
  const monthStart = snapshotDate;
  const { data: payments } = await supabase
    .from("payments")
    .select("debit, settlement_date, description")
    .eq("invoice", invoice)
    .gte("settlement_date", monthStart)
    .lte("settlement_date", today.toISOString().split("T")[0]);

  const received = (payments || []).reduce((sum, p) => {
    const desc = (p.description || "").toLowerCase();
    if (desc.includes("return") || desc.includes("missed")) return sum;
    return sum + Number(p.debit || 0);
  }, 0);

  // Update the snapshot with current received amount
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