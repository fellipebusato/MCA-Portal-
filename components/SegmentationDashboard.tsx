"use client";

import { useMemo, useState } from "react";
import { formatDate, money } from "@/lib/holidays";
import { segmentClient, type MonthlySnapshot, type SegmentationBucket, type SegmentationResult, type SubFlag } from "@/lib/segmentation";
import type { Client, Payment } from "@/lib/types";

type Props = {
  clients: Client[];
  payments: Payment[];
  snapshots: MonthlySnapshot[];
  openClient: (client: Client) => void;
};

const BUCKET_ORDER: SegmentationBucket[] = ["healthy", "watch", "critical", "blocked"];
const BUCKET_LABELS: Record<SegmentationBucket, string> = {
  healthy: "Healthy",
  watch: "Watch",
  critical: "Critical",
  blocked: "Blocked",
};

const FLAG_LABELS: Record<SubFlag, string> = {
  renewal_ready: "Renewal-Ready",
  maturing: "Maturing",
  three_pct_at_risk: "3% At-Risk",
  new_this_month: "New This Month",
  paused: "Paused",
};

function getBucketStyle(segment: SegmentationBucket) {
  if (segment === "healthy") return { bg: "var(--sage-surface)", border: "var(--sage-border)", color: "var(--sage)" };
  if (segment === "watch") return { bg: "rgba(196,140,40,0.08)", border: "rgba(196,140,40,0.25)", color: "#a07010" };
  if (segment === "critical") return { bg: "rgba(190,40,40,0.08)", border: "rgba(190,40,40,0.25)", color: "#b82020" };
  return { bg: "rgba(90,20,90,0.08)", border: "rgba(90,20,90,0.25)", color: "var(--ink-1)" };
}

function getProgressColor(result: SegmentationResult) {
  if (result.monthlyProgressPct >= 100) return "var(--sage)";
  if (result.segment === "critical") return "var(--sienna)";
  return "#c48c28";
}

function getStatusText(result: SegmentationResult) {
  if (result.monthlyMinimum <= 0) return "New / exempt";
  if (result.monthlyProgressPct >= 100) return "On pace";
  return result.segment === "critical" ? "Behind" : "Recovering";
}

function groupPaymentsByInvoice(payments: Payment[]) {
  const map: Record<string, Payment[]> = {};
  for (const payment of payments) {
    const invoice = payment.invoice || "";
    if (!map[invoice]) map[invoice] = [];
    map[invoice].push(payment);
  }
  return map;
}

function mapSnapshotsByInvoice(snapshots: MonthlySnapshot[]) {
  return snapshots.reduce<Record<string, MonthlySnapshot>>((acc, snap) => {
    if (snap.invoice) acc[snap.invoice] = snap;
    return acc;
  }, {});
}

function formatProgressValue(result: SegmentationResult) {
  if (result.monthlyMinimum <= 0) return "—";
  const received = money(result.monthlyReceived);
  const minimum = money(result.monthlyMinimum);
  return `${received} / ${minimum} · ${result.monthlyProgressPct}%`;
}

export default function SegmentationDashboard({ clients, payments, snapshots, openClient }: Props) {
  const [selectedBucket, setSelectedBucket] = useState<SegmentationBucket | "all">("all");
  const [selectedFlag, setSelectedFlag] = useState<SubFlag | "all">("all");

  const paymentsByInvoice = useMemo(() => groupPaymentsByInvoice(payments), [payments]);
  const snapshotByInvoice = useMemo(() => mapSnapshotsByInvoice(snapshots), [snapshots]);
  const today = useMemo(() => new Date(), []);

  const rows = useMemo(() => {
    return clients.map(client => {
      const clientPayments = paymentsByInvoice[client.invoice] || [];
      const snapshot = snapshotByInvoice[client.invoice] || null;
      const result = segmentClient(client, clientPayments, snapshot, today);
      const latestPayment = [...clientPayments]
        .filter(p => p.settlement_date)
        .sort((a, b) => new Date(b.settlement_date).getTime() - new Date(a.settlement_date).getTime())[0];
      return {
        client,
        result,
        latestPaymentDate: latestPayment?.settlement_date || latestPayment?.payment_date || "",
      };
    });
  }, [clients, paymentsByInvoice, snapshotByInvoice, today]);

  const bucketCounts = useMemo(() => {
    const counts: Record<SegmentationBucket, number> = { healthy: 0, watch: 0, critical: 0, blocked: 0 };
    rows.forEach(row => { counts[row.result.segment] += 1; });
    return counts;
  }, [rows]);

  const flagCounts = useMemo(() => {
    const counts: Record<SubFlag, number> = {
      renewal_ready: 0,
      maturing: 0,
      three_pct_at_risk: 0,
      new_this_month: 0,
      paused: 0,
    };
    rows.forEach(row => row.result.subFlags.forEach(flag => { counts[flag] += 1; }));
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesBucket = selectedBucket === "all" || row.result.segment === selectedBucket;
      const matchesFlag = selectedFlag === "all" || row.result.subFlags.includes(selectedFlag);
      return matchesBucket && matchesFlag;
    });
  }, [rows, selectedBucket, selectedFlag]);

  return (
    <div style={{ padding: 28, fontFamily: "'DM Sans', sans-serif", color: "var(--ink-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Segmentation</p>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-4)" }}>Client buckets and 3% monthly progress for today’s operational view.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        {BUCKET_ORDER.map(segment => {
          const style = getBucketStyle(segment);
          const active = selectedBucket === segment;
          return (
            <button
              key={segment}
              onClick={() => setSelectedBucket(active ? "all" : segment)}
              style={{
                cursor: "pointer",
                borderRadius: 16,
                border: `1px solid ${active ? style.color : "var(--border)"}`,
                background: active ? style.bg : "var(--surface)",
                color: active ? style.color : "var(--ink-1)",
                padding: "18px 16px",
                textAlign: "left",
                boxShadow: active ? "0 10px 24px rgba(0,0,0,0.06)" : "0 1px 4px rgba(30,16,4,0.06)",
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, color: "var(--ink-4)" }}>{BUCKET_LABELS[segment]}</div>
              <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em" }}>{bucketCounts[segment]}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-4)" }}>
                {segment === "healthy" && "No active risk"}
                {segment === "watch" && "Needs close monitoring"}
                {segment === "critical" && "Immediate action required"}
                {segment === "blocked" && "ACHWorks block present"}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 28 }}>
        {(Object.keys(FLAG_LABELS) as SubFlag[]).map(flag => {
          const count = flagCounts[flag];
          const active = selectedFlag === flag;
          return (
            <button
              key={flag}
              onClick={() => setSelectedFlag(active ? "all" : flag)}
              style={{
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: `1px solid ${active ? "var(--ink-1)" : "var(--border)"}`,
                background: active ? "var(--surface)" : "var(--parchment-2)",
                color: active ? "var(--ink-1)" : "var(--ink-3)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>{FLAG_LABELS[flag]}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", color: active ? "var(--ink-1)" : "var(--ink-4)" }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr 1.5fr 1.2fr 1fr 0.8fr", gap: 0, background: "var(--parchment-2)", padding: "14px 18px", fontSize: 11, letterSpacing: "0.095em", textTransform: "uppercase", color: "var(--ink-4)" }}>
          <span>Business</span>
          <span>Balance</span>
          <span>Monthly 3% Progress</span>
          <span>Last Payment</span>
          <span>Returns</span>
          <span style={{ textAlign: "right" }}>Segment</span>
        </div>

        {filteredRows.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>No clients match this filter.</div>
        ) : (
          filteredRows.map(row => {
            const { client, result, latestPaymentDate } = row;
            const badge = getBucketStyle(result.segment);
            const progressColor = getProgressColor(result);
            const progressBar = result.monthlyMinimum > 0 ? Math.min(100, Math.max(0, result.monthlyProgressPct)) : 0;

            return (
              <button
                key={client.id}
                onClick={() => openClient(client)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: 0,
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr 1.5fr 1.2fr 1fr 0.8fr", gap: 0, alignItems: "center", padding: "18px 18px", borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)" }}>{client.business_name || client.invoice}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "var(--ink-4)" }}>{client.invoice} · {client.payment_frequency === "weekly" ? `Weekly${client.payment_day ? ` · ${client.payment_day}` : ""}` : "Daily"}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>{money(client.balance || 0)}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: progressColor, letterSpacing: "-0.01em" }}>{formatProgressValue(result)}</div>
                    {result.monthlyMinimum > 0 && (
                      <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: "var(--parchment-3)", overflow: "hidden" }}>
                        <div style={{ width: `${progressBar}%`, height: 7, borderRadius: 999, background: progressColor, transition: "width 0.35s ease" }} />
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>{latestPaymentDate ? formatDate(latestPaymentDate) : "No settled payment"}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)" }}>
                    {Number(client.total_returns || 0)} {client.last_return_code ? `· ${client.last_return_code}` : ""}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 84, padding: "8px 12px", borderRadius: 999, background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{BUCKET_LABELS[result.segment]}</span>
                    <span style={{ color: "var(--ink-4)", fontSize: 16 }}>→</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
