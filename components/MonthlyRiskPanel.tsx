"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/holidays";
import type { Client } from "@/lib/types";

type SnapshotRow = {
  invoice: string;
  business_name: string;
  owner_name: string;
  balance_at_snapshot: number;
  minimum_required: number;
  received_this_month: number;
  status: "safe" | "at_risk" | "default";
};

function getMonthLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getSnapshotDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

function StatusPill({ status }: { status: SnapshotRow["status"] }) {
  if (status === "safe") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      Safe
    </span>
  );
  if (status === "at_risk") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
      At risk
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
      Default risk
    </span>
  );
}

function ProgressBar({ received, minimum }: { received: number; minimum: number }) {
  const pct = minimum > 0 ? Math.min(100, (received / minimum) * 100) : 0;
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right flex-shrink-0">{Math.round(pct)}%</span>
    </div>
  );
}

export default function MonthlyRiskPanel({ clients }: { clients: Client[] }) {
  const [expanded, setExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [snapshotTaken, setSnapshotTaken] = useState(false);
  const [takingSnapshot, setTakingSnapshot] = useState(false);
  const [filter, setFilter] = useState<"all" | "at_risk" | "default">("all");

  const snapshotDate = getSnapshotDate();

  async function loadSnapshots() {
    setLoading(true);

    const { data: rawSnapshots } = await supabase
      .from("monthly_snapshots")
      .select("*")
      .eq("snapshot_date", snapshotDate)
      .order("received_this_month", { ascending: true });

    if (!rawSnapshots || rawSnapshots.length === 0) {
      setHasData(false);
      setLoading(false);
      return;
    }

    setHasData(true);

    const today = new Date().toISOString().split("T")[0];
    const enriched: SnapshotRow[] = [];

    for (const snap of rawSnapshots) {
      const client = clients.find(c => c.invoice === snap.invoice);
      if (!client) continue;

      const { data: monthPayments } = await supabase
        .from("payments")
        .select("debit, description")
        .eq("invoice", snap.invoice)
        .gte("settlement_date", snapshotDate)
        .lte("settlement_date", today);

      const received = (monthPayments || []).reduce((sum, p) => {
        const desc = (p.description || "").toLowerCase();
        if (desc.includes("return") || desc.includes("missed")) return sum;
        return sum + Number(p.debit || 0);
      }, 0);

      const status: SnapshotRow["status"] = received >= snap.minimum_required
        ? "safe"
        : received >= snap.minimum_required * 0.5
        ? "at_risk"
        : "default";

      enriched.push({
        invoice: snap.invoice,
        business_name: client.business_name,
        owner_name: client.owner_name,
        balance_at_snapshot: Number(snap.balance_at_snapshot),
        minimum_required: Number(snap.minimum_required),
        received_this_month: received,
        status,
      });
    }

    enriched.sort((a, b) => {
      const order = { default: 0, at_risk: 1, safe: 2 };
      return order[a.status] - order[b.status];
    });

    setSnapshots(enriched);
    setLoading(false);
  }

  async function takeSnapshot() {
    setTakingSnapshot(true);

    const activeClients = clients.filter(c => Number(c.balance) > 0);

    for (const client of activeClients) {
      const minimum = Math.ceil(Number(client.balance) * 0.03 * 100) / 100;
      await supabase.from("monthly_snapshots").upsert({
        invoice: client.invoice,
        snapshot_date: snapshotDate,
        balance_at_snapshot: Number(client.balance),
        minimum_required: minimum,
        received_this_month: 0,
      }, { onConflict: "invoice,snapshot_date", ignoreDuplicates: true });
    }

    setSnapshotTaken(true);
    setTakingSnapshot(false);
    await loadSnapshots();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (expanded && !snapshots.length) {
      loadSnapshots();
    }
  }, [expanded]);

  const filtered = filter === "all"
    ? snapshots
    : snapshots.filter(s => s.status === filter);

  const defaultCount = snapshots.filter(s => s.status === "default").length;
  const atRiskCount = snapshots.filter(s => s.status === "at_risk").length;
  const safeCount = snapshots.filter(s => s.status === "safe").length;

  return (
    <div className={`rounded-xl border transition-colors ${expanded ? "bg-white border-gray-200" : "bg-white border-gray-100"}`}>

      {/* Header — always visible, click to expand */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v4M7.5 10v4M1 7.5h4M10 7.5h4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="7.5" cy="7.5" r="2.5" stroke="#6b7280" strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Monthly default risk</p>
            <p className="text-xs text-gray-400 mt-0.5">{getMonthLabel()} · 3% minimum threshold · Internal only</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasData && !loading && (
            <div className="hidden sm:flex items-center gap-2">
              {defaultCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  {defaultCount} default risk
                </span>
              )}
              {atRiskCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  {atRiskCount} at risk
                </span>
              )}
              {safeCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {safeCount} safe
                </span>
              )}
            </div>
          )}
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}>
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">

          {/* Loading */}
          {loading && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              Loading monthly data...
            </div>
          )}

          {/* No snapshot yet */}
          {!loading && !hasData && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No snapshot for {getMonthLabel()}</p>
              <p className="text-xs text-gray-400 mb-4">
                Snapshots are taken automatically on the 1st of each month during your payment upload.
                You can also take one now to start tracking this month.
              </p>
              <button
                onClick={takeSnapshot}
                disabled={takingSnapshot || clients.length === 0}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40">
                {takingSnapshot ? "Taking snapshot..." : `Take snapshot now — ${clients.filter(c => Number(c.balance) > 0).length} active clients`}
              </button>
              {snapshotTaken && (
                <p className="text-xs text-emerald-600 mt-3 font-medium">Snapshot taken successfully.</p>
              )}
            </div>
          )}

          {/* Data */}
          {!loading && hasData && snapshots.length > 0 && (
            <>
              {/* Filter tabs */}
              <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-50">
                {(["all", "default", "at_risk"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      filter === f ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}>
                    {f === "all" ? `All (${snapshots.length})` : f === "default" ? `Default risk (${defaultCount})` : `At risk (${atRiskCount})`}
                  </button>
                ))}
                <button
                  onClick={() => loadSnapshots()}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  ↻ Refresh
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Balance on 1st</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">3% minimum</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Received</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-36">Progress</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.invoice}
                        className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                          row.status === "default" ? "bg-red-50/30" : row.status === "at_risk" ? "bg-amber-50/20" : ""
                        }`}>
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-medium text-gray-900">{row.business_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{row.invoice}</p>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 text-right">
                          {money(row.balance_at_snapshot)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-sm font-medium text-gray-900">{money(row.minimum_required)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`text-sm font-semibold ${
                            row.received_this_month >= row.minimum_required
                              ? "text-emerald-600"
                              : row.received_this_month >= row.minimum_required * 0.5
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}>
                            {money(row.received_this_month)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 w-36">
                          <ProgressBar
                            received={row.received_this_month}
                            minimum={row.minimum_required}
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusPill status={row.status} />
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">
                          No clients in this category this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer note */}
              <div className="px-5 py-3 border-t border-gray-50">
                <p className="text-[10px] text-gray-300 leading-relaxed">
                  This panel is for internal use only and is never visible to clients. The 3% minimum is calculated from each client&apos;s balance on the 1st of the month. Received amounts reflect settled payments only.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}