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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", color: "var(--sage)", fontSize: 11, fontWeight: 500 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sage)", display: "inline-block" }} />
      Safe
    </span>
  );
  if (status === "at_risk") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "rgba(196,140,40,0.1)", border: "1px solid rgba(196,140,40,0.25)", color: "#a07010", fontSize: 11, fontWeight: 500 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#c48c28", display: "inline-block" }} />
      At risk
    </span>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", color: "var(--sienna)", fontSize: 11, fontWeight: 500 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sienna)", display: "inline-block" }} />
      Default risk
    </span>
  );
}

function ProgressBar({ received, minimum }: { received: number; minimum: number }) {
  const pct = minimum > 0 ? Math.min(100, (received / minimum) * 100) : 0;
  const color = pct >= 100 ? "var(--sage)" : pct >= 50 ? "#c48c28" : "var(--sienna)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 99, background: "var(--parchment-3)", overflow: "hidden" }}>
        <div style={{ height: 5, borderRadius: 99, background: color, width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--ink-4)", width: 30, textAlign: "right", flexShrink: 0 }}>{Math.round(pct)}%</span>
    </div>
  );
}

export default function MonthlyRiskPanel({ clients }: { clients: Client[]; orgId?: string }) {
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

      const { error } = await supabase.from("monthly_snapshots").upsert({
        invoice: client.invoice,
        snapshot_date: snapshotDate,
        balance_at_snapshot: Number(client.balance),
        minimum_required: minimum,
        received_this_month: 0,
      }, { onConflict: "invoice,snapshot_date" });

      if (error) console.error("Snapshot error:", client.invoice, error.message);
    }

    setSnapshotTaken(true);
    setTakingSnapshot(false);
    await loadSnapshots();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (expanded) loadSnapshots();
  }, [expanded]);

  const filtered = filter === "all"
    ? snapshots
    : snapshots.filter(s => s.status === filter);

  const defaultCount = snapshots.filter(s => s.status === "default").length;
  const atRiskCount = snapshots.filter(s => s.status === "at_risk").length;
  const safeCount = snapshots.filter(s => s.status === "safe").length;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 20, boxShadow: "0 1px 4px rgba(30,16,4,0.06)", overflow: "hidden" }}>

      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--parchment-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v4M7.5 10v4M1 7.5h4M10 7.5h4" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="7.5" cy="7.5" r="2.5" stroke="var(--ink-3)" strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Monthly default risk</p>
            <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{getMonthLabel()} · 3% minimum threshold · Internal only</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasData && !loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {defaultCount > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 99, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", color: "var(--sienna)", fontSize: 10, fontWeight: 500 }}>
                  {defaultCount} default risk
                </span>
              )}
              {atRiskCount > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 99, background: "rgba(196,140,40,0.1)", border: "1px solid rgba(196,140,40,0.25)", color: "#a07010", fontSize: 10, fontWeight: 500 }}>
                  {atRiskCount} at risk
                </span>
              )}
              {false && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 99, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", color: "var(--sage)", fontSize: 10, fontWeight: 500 }}>
                  {safeCount} safe
                </span>
              )}
            </div>
          )}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: "var(--ink-4)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>

          {loading && (
            <div style={{ padding: "40px", textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
              Loading monthly data...
            </div>
          )}

          {!loading && !hasData && (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>No snapshot for {getMonthLabel()}</p>
              <p style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 20, maxWidth: 420, margin: "0 auto 20px" }}>
                Snapshots are taken automatically on the 1st of each month during your payment upload. You can also take one now to start tracking this month.
              </p>
              <button
                onClick={takeSnapshot}
                disabled={takingSnapshot || clients.length === 0}
                style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "11px 22px", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: takingSnapshot ? 0.6 : 1 }}>
                {takingSnapshot ? "Taking snapshot..." : `Take snapshot now — ${clients.filter(c => Number(c.balance) > 0).length} active clients`}
              </button>
              {snapshotTaken && (
                <p style={{ fontSize: 12, color: "var(--sage)", marginTop: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>Snapshot taken successfully.</p>
              )}
            </div>
          )}

          {!loading && hasData && snapshots.length > 0 && (
            <>
              {/* Filter tabs */}
              <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
                {(["all", "default", "at_risk"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: "1px solid", background: filter === f ? "var(--ink-1)" : "transparent", color: filter === f ? "var(--gold-muted)" : "var(--ink-4)", borderColor: filter === f ? "var(--ink-1)" : "var(--border-mid)" }}>
                    {f === "all" ? `All (${snapshots.length})` : f === "default" ? `Default risk (${defaultCount})` : `At risk (${atRiskCount})`}
                  </button>
                ))}
                <button
                  onClick={() => loadSnapshots()}
                  style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  ↻ Refresh
                </button>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "var(--parchment-2)" }}>
                      {["Client", "Balance on 1st", "3% Minimum", "Received", "Progress", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 24px", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", textAlign: h === "Client" || h === "Progress" || h === "Status" ? "left" : "right", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.invoice} style={{ borderBottom: "1px solid var(--border)", background: row.status === "default" ? "rgba(190,60,40,0.03)" : row.status === "at_risk" ? "rgba(196,140,40,0.03)" : "transparent" }}>
                        <td style={{ padding: "14px 24px" }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{row.business_name}</p>
                          <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{row.invoice}</p>
                        </td>
                        <td style={{ padding: "14px 24px", textAlign: "right", fontSize: 13, color: "var(--ink-3)", fontFamily: "'DM Mono', monospace" }}>
                          {money(row.balance_at_snapshot)}
                        </td>
                        <td style={{ padding: "14px 24px", textAlign: "right" }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>{money(row.minimum_required)}</span>
                        </td>
                        <td style={{ padding: "14px 24px", textAlign: "right" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: row.received_this_month >= row.minimum_required ? "var(--sage)" : row.received_this_month >= row.minimum_required * 0.5 ? "#c48c28" : "var(--sienna)", fontFamily: "'DM Mono', monospace" }}>
                            {money(row.received_this_month)}
                          </span>
                        </td>
                        <td style={{ padding: "14px 24px", width: 160 }}>
                          <ProgressBar received={row.received_this_month} minimum={row.minimum_required} />
                        </td>
                        <td style={{ padding: "14px 24px" }}>
                          <StatusPill status={row.status} />
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: "40px", textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
                          No clients in this category this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: 10, color: "var(--ink-5)", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                  Internal use only — never visible to clients. The 3% minimum is calculated from each client&apos;s balance on the 1st of the month. Received amounts reflect settled payments only.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
