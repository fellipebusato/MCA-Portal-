"use client";

// components/ACHOperationsCenter.tsx
// Admin-only ACH pipeline management panel
// Shows real-time view of all in-flight payments across the 4-day ACH cycle

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { money, formatDate, addBusinessDays, toDateStr, isBusinessDay } from "@/lib/holidays";
import {
  getReturnCodeInfo,
  getTierLabel,
  getTierColors,
  getPullDateFromReturnDate,
  getSettlementDateFromPullDate,
  type ReturnTier,
} from "@/lib/achReturns";
import type { Client } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

type ACHReturn = {
  id: number;
  invoice: string;
  merchant_name: string;
  pull_date: string;
  return_date: string;
  settle_date: string;
  return_code: string;
  return_amount: number;
  tier: ReturnTier;
  is_x_code: boolean;
  contacted_at: string | null;
  contact_note: string | null;
};

type PipelineEntry = {
  invoice: string;
  business_name: string;
  owner_name: string;
  pull_date: string;
  settlement_date: string;
  amount: number;
  stage: "in_flight" | "return_window" | "processing" | "clearing";
};

type TierFilter = "all" | "1" | "2" | "3";

// ── Helpers ──────────────────────────────────────────────────────────────────

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayStr(): string {
  return toDateStr(today());
}

// Returns the pull date that would be in return window TODAY
// i.e. 2 business days ago
function getPullDateInReturnWindowToday(): string {
  const t = today();
  const result = new Date(t);
  let subtracted = 0;
  while (subtracted < 2) {
    result.setDate(result.getDate() - 1);
    if (isBusinessDay(result)) subtracted++;
  }
  return toDateStr(result);
}

// Returns the pull date that would settle TODAY (4 business days ago)
function getPullDateSettlingToday(): string {
  const t = today();
  const result = new Date(t);
  let subtracted = 0;
  while (subtracted < 4) {
    result.setDate(result.getDate() - 1);
    if (isBusinessDay(result)) subtracted++;
  }
  return toDateStr(result);
}

function TierBadge({ tier, isXCode }: { tier: ReturnTier; isXCode: boolean }) {
  const colors = getTierColors(tier);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      background: colors.bg, border: `1px solid ${colors.border}`,
      color: colors.color, fontSize: 11, fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.dot, flexShrink: 0, display: "inline-block" }} />
      {isXCode ? "⚠️ ACHWorks Blocked" : getTierLabel(tier)}
    </span>
  );
}

function SectionHeader({ label, count, amount, color }: {
  label: string; count: number; amount?: number; color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
          ({count})
        </span>
      </div>
      {amount !== undefined && (
        <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>
          {money(amount)}
        </span>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ACHOperationsCenter({ clients }: { clients: Client[] }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"action_queue" | "pipeline" | "risk">("action_queue");
  const [returns, setReturns] = useState<ACHReturn[]>([]);
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [contactingId, setContactingId] = useState<number | null>(null);
  const [contactNote, setContactNote] = useState("");
  const [noteForId, setNoteForId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Load returns from last 14 days
    const since = new Date(today());
    since.setDate(since.getDate() - 14);
    const sinceStr = toDateStr(since);

    const { data: returnData } = await supabase
      .from("ach_returns")
      .select("*")
      .gte("return_date", sinceStr)
      .order("tier", { ascending: true })
      .order("return_date", { ascending: false });

    setReturns((returnData || []) as ACHReturn[]);

    // Build pipeline from payments table — pending payments = in-flight
    const { data: pendingPayments } = await supabase
      .from("payments")
      .select("invoice, ach_date, settlement_date, debit, payment_status")
      .in("payment_status", ["pending", "processing"])
      .gt("debit", 0);

    const t = today();
    const returnWindowPullDate = getPullDateInReturnWindowToday();
    const clearingPullDate = getPullDateSettlingToday();

    const entries: PipelineEntry[] = [];
    for (const p of pendingPayments || []) {
      const client = clients.find(c => c.invoice === p.invoice);
      if (!client) continue;

      const pullDate = p.ach_date || "";
      let stage: PipelineEntry["stage"] = "in_flight";

      if (pullDate === clearingPullDate) stage = "clearing";
      else if (pullDate === returnWindowPullDate) stage = "return_window";
      else if (pullDate < returnWindowPullDate) stage = "processing";

      entries.push({
        invoice: p.invoice,
        business_name: client.business_name,
        owner_name: client.owner_name,
        pull_date: pullDate,
        settlement_date: p.settlement_date || "",
        amount: Number(p.debit),
        stage,
      });
    }

    setPipeline(entries);
    setLoading(false);
  }, [clients]);

  useEffect(() => {
    if (expanded) loadData();
  }, [expanded, loadData]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const todayReturns = returns.filter(r => r.return_date === todayStr());
  const recentReturns = returns.filter(r => r.return_date !== todayStr());

  const filteredReturns = (activeTab === "action_queue" ? returns : []).filter(r => {
    if (tierFilter === "all") return true;
    return r.tier === Number(tierFilter);
  });

  const todayReturnsTotal = todayReturns.reduce((s, r) => s + Number(r.return_amount), 0);
  const xCodeCount = returns.filter(r => r.is_x_code && r.return_date === todayStr()).length;
  const criticalCount = returns.filter(r => r.tier === 1 && r.return_date === todayStr()).length;
  const contactedToday = todayReturns.filter(r => r.contacted_at).length;

  const inFlight = pipeline.filter(p => p.stage === "in_flight");
  const returnWindow = pipeline.filter(p => p.stage === "return_window");
  const processing = pipeline.filter(p => p.stage === "processing");
  const clearing = pipeline.filter(p => p.stage === "clearing");

  // Risk signals: clients with 3+ returns in last 30 days (near X-code territory)
  const nearXCode = clients.filter(c =>
    Number(c.total_returns) >= 3 && !c.x_code_blocked && Number(c.balance) > 0
  ).slice(0, 20);

  const xBlocked = clients.filter(c => c.x_code_blocked && Number(c.balance) > 0);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function markContacted(ret: ACHReturn) {
    setContactingId(ret.id);
    const note = contactNote.trim() || null;
    await supabase.from("ach_returns").update({
      contacted_at: new Date().toISOString(),
      contact_note: note,
    }).eq("id", ret.id);

    setReturns(prev => prev.map(r =>
      r.id === ret.id ? { ...r, contacted_at: new Date().toISOString(), contact_note: note } : r
    ));
    setContactingId(null);
    setNoteForId(null);
    setContactNote("");
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 400,
    fontFamily: "'DM Sans', sans-serif", cursor: "pointer", border: "none",
    background: active ? "var(--ink-1)" : "transparent",
    color: active ? "var(--gold-muted)" : "var(--ink-4)",
  });

  const filterBtn = (active: boolean, color?: string): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 500,
    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
    border: `1px solid ${active ? (color || "var(--ink-1)") : "var(--border)"}`,
    background: active ? (color || "var(--ink-1)") : "transparent",
    color: active ? "white" : "var(--ink-4)",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, marginBottom: 20,
      boxShadow: "0 1px 4px rgba(30,16,4,0.06)", overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: "100%", padding: "18px 24px", display: "flex", alignItems: "center",
          justifyContent: "space-between", background: "none", border: "none",
          cursor: "pointer", textAlign: "left",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: criticalCount > 0 ? "rgba(190,40,40,0.1)" : "var(--parchment-2)",
            border: `1px solid ${criticalCount > 0 ? "rgba(190,40,40,0.25)" : "var(--border)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 2L13 12H2L7.5 2Z" stroke={criticalCount > 0 ? "#b82020" : "var(--ink-3)"} strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M7.5 6v3M7.5 10.5v.5" stroke={criticalCount > 0 ? "#b82020" : "var(--ink-3)"} strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>
              ACH Operations Center
            </p>
            <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
              Admin only · Daily return & settlement pipeline
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {criticalCount > 0 && (
            <span style={{
              background: "rgba(190,40,40,0.1)", border: "1px solid rgba(190,40,40,0.25)",
              color: "#b82020", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {criticalCount} critical today
            </span>
          )}
          {xCodeCount > 0 && (
            <span style={{
              background: "rgba(190,40,40,0.15)", border: "1px solid rgba(190,40,40,0.35)",
              color: "#9a1010", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              ⚠️ {xCodeCount} X-code blocked
            </span>
          )}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: "var(--ink-4)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>

          {/* ── Summary stat row ── */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              {
                label: "Returns today",
                value: String(todayReturns.length),
                sub: money(todayReturnsTotal) + " total",
                color: todayReturns.length > 0 ? "#b82020" : "var(--ink-3)",
              },
              {
                label: "X-code blocks",
                value: String(xCodeCount),
                sub: "Manual unlock needed",
                color: xCodeCount > 0 ? "#9a1010" : "var(--ink-3)",
              },
              {
                label: "Contacted today",
                value: `${contactedToday} / ${todayReturns.length}`,
                sub: "Of today's returns",
                color: "var(--sage)",
              },
              {
                label: "In-flight payments",
                value: String(inFlight.length + returnWindow.length + processing.length + clearing.length),
                sub: "Across all pipeline stages",
                color: "var(--ink-2)",
              },
            ].map(item => (
              <div key={item.label} style={{
                background: "var(--parchment-2)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "12px 14px",
              }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: 22, fontWeight: 500, color: item.color, fontFamily: "'Cormorant Garamond', serif", lineHeight: 1 }}>{item.value}</p>
                <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{item.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 4 }}>
            {(["action_queue", "pipeline", "risk"] as const).map(tab => (
              <button key={tab} style={tabBtn(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                {tab === "action_queue" && "Action Queue"}
                {tab === "pipeline" && "Pipeline Board"}
                {tab === "risk" && "Risk Signals"}
              </button>
            ))}
            <button
              onClick={() => { setLoading(true); loadData(); }}
              style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
              Loading...
            </div>
          )}

          {/* ══════════════════════════════════════════════
              TAB 1: ACTION QUEUE
          ══════════════════════════════════════════════ */}
          {!loading && activeTab === "action_queue" && (
            <div style={{ padding: "20px 24px" }}>

              {/* Tier filters */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", alignSelf: "center", marginRight: 4 }}>Filter:</span>
                <button style={filterBtn(tierFilter === "all")} onClick={() => setTierFilter("all")}>All ({returns.length})</button>
                <button style={filterBtn(tierFilter === "1", "#b82020")} onClick={() => setTierFilter("1")}>
                  Critical ({returns.filter(r => r.tier === 1).length})
                </button>
                <button style={filterBtn(tierFilter === "2", "#a07010")} onClick={() => setTierFilter("2")}>
                  High ({returns.filter(r => r.tier === 2).length})
                </button>
                <button style={filterBtn(tierFilter === "3")} onClick={() => setTierFilter("3")}>
                  Monitor ({returns.filter(r => r.tier === 3).length})
                </button>
              </div>

              {/* Today's returns */}
              {filteredReturns.filter(r => r.return_date === todayStr()).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <SectionHeader
                    label={`Today's returns — ${formatDate(todayStr())}`}
                    count={filteredReturns.filter(r => r.return_date === todayStr()).length}
                    amount={filteredReturns.filter(r => r.return_date === todayStr()).reduce((s, r) => s + Number(r.return_amount), 0)}
                    color="#b82020"
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredReturns
                      .filter(r => r.return_date === todayStr())
                      .map(ret => (
                        <ReturnCard
                          key={ret.id}
                          ret={ret}
                          clients={clients}
                          contactingId={contactingId}
                          noteForId={noteForId}
                          contactNote={contactNote}
                          setNoteForId={setNoteForId}
                          setContactNote={setContactNote}
                          onMarkContacted={markContacted}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Older returns (last 14 days) */}
              {filteredReturns.filter(r => r.return_date !== todayStr()).length > 0 && (
                <div>
                  <SectionHeader
                    label="Prior returns (last 14 days)"
                    count={filteredReturns.filter(r => r.return_date !== todayStr()).length}
                    amount={filteredReturns.filter(r => r.return_date !== todayStr()).reduce((s, r) => s + Number(r.return_amount), 0)}
                    color="var(--ink-3)"
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredReturns
                      .filter(r => r.return_date !== todayStr())
                      .map(ret => (
                        <ReturnCard
                          key={ret.id}
                          ret={ret}
                          clients={clients}
                          contactingId={contactingId}
                          noteForId={noteForId}
                          contactNote={contactNote}
                          setNoteForId={setNoteForId}
                          setContactNote={setContactNote}
                          onMarkContacted={markContacted}
                        />
                      ))}
                  </div>
                </div>
              )}

              {filteredReturns.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
                  {returns.length === 0
                    ? "No returns in the last 14 days. Upload the 3PM return report to populate this queue."
                    : "No returns match the selected filter."}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════
              TAB 2: PIPELINE BOARD
          ══════════════════════════════════════════════ */}
          {!loading && activeTab === "pipeline" && (
            <div style={{ padding: "20px 24px" }}>

              <p style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>
                Payments currently in the 4-business-day ACH cycle. Updates automatically as return and settlement reports are imported.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>

                {/* Stage 1: In-Flight */}
                <PipelineColumn
                  title="In-Flight"
                  subtitle="Day 0–1 · No verdict yet"
                  dot="#6366f1"
                  entries={inFlight}
                  emptyText="No payments pulled today"
                />

                {/* Stage 2: Return Window */}
                <PipelineColumn
                  title="Return Window"
                  subtitle="Day +2 · 3PM report due"
                  dot="#c48c28"
                  entries={returnWindow}
                  emptyText="None in return window"
                  highlight
                />

                {/* Stage 3: Processing (survived return window) */}
                <PipelineColumn
                  title="Processing"
                  subtitle="Day +3 · No return, likely clearing"
                  dot="var(--sage)"
                  entries={processing}
                  emptyText="None in processing"
                />

                {/* Stage 4: Clearing */}
                <PipelineColumn
                  title="Clearing Today"
                  subtitle="Day +4 · Settlement file due"
                  dot="#1a5fa8"
                  entries={clearing}
                  emptyText="No settlements due today"
                />
              </div>

              {pipeline.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 16 }}>
                  Pipeline is empty. Payments appear here when added with &quot;pending&quot; status.
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════
              TAB 3: RISK SIGNALS
          ══════════════════════════════════════════════ */}
          {!loading && activeTab === "risk" && (
            <div style={{ padding: "20px 24px" }}>

              {/* X-Code blocked clients */}
              {xBlocked.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <SectionHeader
                    label="⚠️ ACHWorks blocked — manual unlock required"
                    count={xBlocked.length}
                    color="#9a1010"
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {xBlocked.map(c => (
                      <div key={c.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", borderRadius: 10,
                        background: "rgba(190,40,40,0.06)", border: "1px solid rgba(190,40,40,0.2)",
                      }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{c.business_name}</p>
                          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace" }}>{c.invoice} · {c.last_return_code}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#b82020", fontFamily: "'DM Mono', monospace" }}>{money(Number(c.balance))}</p>
                          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>balance remaining</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Near X-code territory (3+ returns, not yet blocked) */}
              {nearXCode.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <SectionHeader
                    label="Approaching X-code territory (3+ total returns)"
                    count={nearXCode.length}
                    color="#c48c28"
                  />
                  <p style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
                    One more return and ACHWorks will automatically block these accounts.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {nearXCode.map(c => (
                      <div key={c.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", borderRadius: 10,
                        background: "rgba(196,140,40,0.06)", border: "1px solid rgba(196,140,40,0.2)",
                      }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{c.business_name}</p>
                          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{c.invoice} · {c.total_returns} total returns · last {c.last_return_date ? formatDate(c.last_return_date) : "—"}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>{money(Number(c.balance))}</p>
                          <p style={{ fontSize: 11, color: "#c48c28", fontFamily: "'DM Sans', sans-serif" }}>watch closely</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {xBlocked.length === 0 && nearXCode.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
                  No elevated risk signals detected. Portfolio looks clean.
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReturnCard({
  ret, clients, contactingId, noteForId, contactNote,
  setNoteForId, setContactNote, onMarkContacted,
}: {
  ret: ACHReturn;
  clients: Client[];
  contactingId: number | null;
  noteForId: number | null;
  contactNote: string;
  setNoteForId: (id: number | null) => void;
  setContactNote: (note: string) => void;
  onMarkContacted: (ret: ACHReturn) => void;
}) {
  const info = getReturnCodeInfo(ret.return_code);
  const colors = getTierColors(ret.tier as ReturnTier);
  const client = clients.find(c => c.invoice === ret.invoice);
  const isContacted = !!ret.contacted_at;
  const isShowingNote = noteForId === ret.id;

  return (
    <div style={{
      background: isContacted ? "var(--parchment-2)" : colors.bg,
      border: `1px solid ${isContacted ? "var(--border)" : colors.border}`,
      borderRadius: 12, padding: "14px 16px",
      opacity: isContacted ? 0.7 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>

        {/* Left: client info */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <TierBadge tier={ret.tier as ReturnTier} isXCode={ret.is_x_code} />
            {isContacted && (
              <span style={{ fontSize: 11, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif" }}>
                ✓ Contacted
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>
            {client?.business_name || ret.merchant_name}
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
            {ret.invoice} · {client?.owner_name || ""}
          </p>
        </div>

        {/* Center: return details */}
        <div style={{ minWidth: 180 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: colors.color, fontFamily: "'DM Sans', sans-serif" }}>
            {ret.return_code} — {info.description}
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>
            {info.action}
          </p>
          {ret.is_x_code && (
            <p style={{ fontSize: 11, fontWeight: 600, color: "#9a1010", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
              Go to ACH Works → remove block manually
            </p>
          )}
        </div>

        {/* Right: amounts + dates */}
        <div style={{ textAlign: "right", minWidth: 120 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: colors.color, fontFamily: "'DM Mono', monospace" }}>
            {money(Number(ret.return_amount))}
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            Pulled {formatDate(ret.pull_date)}
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
            Returned {formatDate(ret.return_date)}
          </p>
          {ret.settle_date && (
            <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
              Reversal settles {formatDate(ret.settle_date)}
            </p>
          )}
        </div>

        {/* Action button */}
        {!isContacted && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            {!isShowingNote ? (
              <button
                onClick={() => setNoteForId(ret.id)}
                style={{
                  background: "var(--ink-1)", color: "var(--gold-muted)",
                  border: "none", padding: "7px 14px", borderRadius: 8,
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
                }}>
                Mark contacted
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  placeholder="Add note (optional)"
                  value={contactNote}
                  onChange={e => setContactNote(e.target.value)}
                  style={{
                    borderRadius: 7, border: "1px solid var(--border-mid)", background: "var(--surface)",
                    padding: "6px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none",
                    fontFamily: "'DM Sans', sans-serif", width: 180,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => onMarkContacted(ret)}
                    disabled={contactingId === ret.id}
                    style={{
                      background: "var(--sage)", color: "white", border: "none",
                      padding: "6px 12px", borderRadius: 7, fontSize: 12,
                      fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}>
                    {contactingId === ret.id ? "Saving..." : "Confirm ✓"}
                  </button>
                  <button
                    onClick={() => { setNoteForId(null); setContactNote(""); }}
                    style={{
                      background: "transparent", color: "var(--ink-4)", border: "1px solid var(--border)",
                      padding: "6px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* If already contacted, show when + note */}
        {isContacted && (
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <p style={{ fontSize: 11, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif" }}>
              Contacted {new Date(ret.contacted_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
            {ret.contact_note && (
              <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                {ret.contact_note}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineColumn({
  title, subtitle, dot, entries, emptyText, highlight,
}: {
  title: string;
  subtitle: string;
  dot: string;
  entries: PipelineEntry[];
  emptyText: string;
  highlight?: boolean;
}) {
  const total = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div style={{
      background: highlight ? "rgba(196,140,40,0.04)" : "var(--parchment-2)",
      border: `1px solid ${highlight ? "rgba(196,140,40,0.2)" : "var(--border)"}`,
      borderRadius: 12, padding: "14px 14px", display: "flex", flexDirection: "column", gap: 0,
    }}>
      {/* Column header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
        </div>
        <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", paddingLeft: 13 }}>{subtitle}</p>
        {entries.length > 0 && (
          <p style={{ fontSize: 12, fontWeight: 600, color: dot, fontFamily: "'DM Mono', monospace", paddingLeft: 13, marginTop: 4 }}>
            {money(total)}
          </p>
        )}
      </div>

      {/* Entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 280 }}>
        {entries.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>
            {emptyText}
          </p>
        ) : entries.map(e => (
          <div key={e.invoice} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px",
          }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>
              {e.business_name}
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace" }}>{e.invoice}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", fontFamily: "'DM Mono', monospace" }}>{money(e.amount)}</p>
            </div>
            <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
              Settles {formatDate(e.settlement_date)}
            </p>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 10, textAlign: "center" }}>
          {entries.length} payment{entries.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
