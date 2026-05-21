"use client";
import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function moneyM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return money(n);
}
function pct(n: number) { return `${Math.round(n * 100)}%`; }
function todayStr() { return new Date().toISOString().split("T")[0]; }

function isFundedThisMonth(client: any): boolean {
  if (!client.funded_date) return false;
  const funded = new Date(client.funded_date + "T00:00:00");
  const now = new Date();
  return funded.getMonth() === now.getMonth() && funded.getFullYear() === now.getFullYear();
}
function isPaymentExpectedToday(client: any): boolean {
  const today = new Date();
  const dow = today.getDay();
  if (dow === 0 || dow === 6) return false;
  if (client.payment_frequency === "daily") return true;
  if (client.payment_frequency === "weekly") {
    const dayMap: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
    return (dayMap[client.payment_day?.toLowerCase() || ""] ?? -1) === dow;
  }
  return false;
}

function GoldRule() {
  return <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent 5%, rgba(196,154,90,0.7) 50%, transparent 95%)" }} />;
}
function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "32px 0 20px" }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.14em", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}
const surfaceCard: React.CSSProperties = {
  background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14,
  padding: "20px 22px", boxShadow: "0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
  position: "relative", overflow: "hidden",
};

export default function PortfolioAnalysis({ clients, openClient }: { clients: any[]; openClient: (c: any) => void }) {
  const [todayPayments, setTodayPayments] = useState<any[]>([]);
  const [confirmedTodayInvoices, setConfirmedTodayInvoices] = useState<Set<string>>(new Set());
  const [monthlyReturnsByInvoice, setMonthlyReturnsByInvoice] = useState<Record<string, number>>({});
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    trigger: false, returns: false, weekly: false, xcodes: false,
  });
  function togglePanel(key: string) { setExpandedPanels(p => ({ ...p, [key]: !p[key] })); }

  const today = todayStr();

  useEffect(() => {
    async function load() {
      if (!clients.length) return;
      const allInvoices = clients.map(c => c.invoice);
      const now = new Date();

      const { data: todayData } = await supabase.from("payments").select("*").eq("payment_date", today);
      setTodayPayments(todayData || []);
      setConfirmedTodayInvoices(new Set(
        (todayData || []).filter((p: any) => p.debit > 0 && !(p.description || "").toLowerCase().includes("missed")).map((p: any) => p.invoice)
      ));

      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { data: mrd } = await supabase
        .from("payments").select("invoice, returns")
        .in("invoice", allInvoices).gte("payment_date", monthStart).gt("returns", 0);
      const counts: Record<string, number> = {};
      for (const row of mrd || []) counts[row.invoice] = (counts[row.invoice] || 0) + 1;
      setMonthlyReturnsByInvoice(counts);
    }
    load();
  }, [clients, today]);

  const totalFunded = useMemo(() => clients.reduce((s, c) => s + Number(c.funded || 0), 0), [clients]);
  const totalBalance = useMemo(() => clients.reduce((s, c) => s + Number(c.balance || 0), 0), [clients]);
  const returnsToday = useMemo(() => {
    const rows = todayPayments.filter(p => p.returns > 0 || (p.description || "").toLowerCase().includes("return"));
    return { count: rows.length, sum: rows.reduce((s: number, p: any) => s + Number(p.returns || 0), 0) };
  }, [todayPayments]);
  const xCodesActive = useMemo(() => {
    const xi = new Set(todayPayments.filter((p: any) => {
      const d = (p.description || "").toUpperCase();
      return d.includes("X0") || /\bX\d/.test(d);
    }).map((p: any) => p.invoice));
    return clients.filter(c => c.x_code_blocked === true || xi.has(c.invoice)).length;
  }, [clients, todayPayments]);
  const expectedToday = useMemo(() => clients.filter(isPaymentExpectedToday), [clients]);
  const confirmedTodayCount = useMemo(
    () => expectedToday.filter(c => confirmedTodayInvoices.has(c.invoice)).length,
    [expectedToday, confirmedTodayInvoices]
  );

  const triggerRiskClients = useMemo(() =>
    clients.filter(c => c.trigger_status === "Bad" && !isFundedThisMonth(c))
      .sort((a, b) => Number(b.trigger_shortfall || 0) - Number(a.trigger_shortfall || 0)),
    [clients]
  );
  const highReturnClients = useMemo(() =>
    clients.filter(c => c.payment_frequency === "daily" && (monthlyReturnsByInvoice[c.invoice] || 0) >= 3)
      .sort((a, b) => (monthlyReturnsByInvoice[b.invoice] || 0) - (monthlyReturnsByInvoice[a.invoice] || 0)),
    [clients, monthlyReturnsByInvoice]
  );
  const weeklyReturnedClients = useMemo(() =>
    clients.filter(c => c.payment_frequency === "weekly" && (monthlyReturnsByInvoice[c.invoice] || 0) >= 1)
      .sort((a, b) => (monthlyReturnsByInvoice[b.invoice] || 0) - (monthlyReturnsByInvoice[a.invoice] || 0)),
    [clients, monthlyReturnsByInvoice]
  );
  const xCodeActiveClients = useMemo(() => {
    const xi = new Set(todayPayments.filter((p: any) => {
      const d = (p.description || "").toUpperCase();
      return d.includes("X0") || /\bX\d/.test(d);
    }).map((p: any) => p.invoice));
    return clients.filter(c => c.x_code_blocked === true || xi.has(c.invoice));
  }, [clients, todayPayments]);
  const refinancingEligible = useMemo(() =>
    clients.filter(c => Number(c.percentage_paid || 0) >= 0.5 && c.status === "Good Standing"),
    [clients]
  );

  const riskSignalCount = useMemo(() => {
    const ts = new Set(triggerRiskClients.map(c => c.id));
    const hs = new Set(highReturnClients.map(c => c.id));
    const ws = new Set(weeklyReturnedClients.map(c => c.id));
    const xs = new Set(xCodeActiveClients.map(c => c.id));
    const m: Record<number, number> = {};
    for (const c of clients) {
      m[c.id] = (ts.has(c.id) ? 1 : 0) + (hs.has(c.id) ? 1 : 0) + (ws.has(c.id) ? 1 : 0) + (xs.has(c.id) ? 1 : 0);
    }
    return m;
  }, [clients, triggerRiskClients, highReturnClients, weeklyReturnedClients, xCodeActiveClients]);

  const payingWell = useMemo(() => clients.filter(c => riskSignalCount[c.id] === 0), [clients, riskSignalCount]);
  const atRisk = useMemo(() => clients.filter(c => riskSignalCount[c.id] === 1), [clients, riskSignalCount]);
  const critical = useMemo(() => clients.filter(c => (riskSignalCount[c.id] || 0) >= 2), [clients, riskSignalCount]);
  const needsAttentionNow = useMemo(() =>
    critical.sort((a, b) => (riskSignalCount[b.id] || 0) - (riskSignalCount[a.id] || 0)).slice(0, 10),
    [critical, riskSignalCount]
  );

  function RiskRow({ client, children, accent }: { client: any; children: React.ReactNode; accent: string }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 8, cursor: "pointer" }}
        onClick={() => openClient(client)}>{children}</div>
    );
  }
  function ShowToggle({ panelKey, total, accent }: { panelKey: string; total: number; accent: string }) {
    if (total <= 5) return null;
    return (
      <button onClick={() => togglePanel(panelKey)}
        style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${accent}30`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: accent, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, padding: "5px 10px" }}>
        {expandedPanels[panelKey] ? "↑ Show less" : `↓ Show all ${total}`}
      </button>
    );
  }

  return (
    <div style={{ minHeight: "calc(100vh - 108px)", background: "var(--parchment)", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: "28px 32px 40px" }}>

        {/* ── Morning Briefing ── */}
        <div style={{ background: "linear-gradient(160deg, #0D1B2A 0%, #081420 100%)", border: "1px solid rgba(196,154,90,0.32)", borderRadius: 14, padding: "24px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(196,154,90,0.1)", position: "relative", overflow: "hidden" }}>
          <GoldRule />
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ flex: "0 0 auto", paddingRight: 36 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 10 }}>Returns Today</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1 }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 56, fontWeight: 400, color: returnsToday.count > 0 ? "#E8756A" : "#C4A050" }}>{returnsToday.count}</span>
                {returnsToday.count > 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#E8756A" }}>{moneyM(returnsToday.sum)}</span>}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{returnsToday.count === 0 ? "none today" : "returned today"}</div>
            </div>
            <div style={{ width: 1, background: "rgba(196,154,90,0.15)", alignSelf: "stretch", marginRight: 36 }} />
            <div style={{ flex: "0 0 auto", paddingRight: 36 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 10 }}>X-Codes Active</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 56, fontWeight: 400, color: xCodesActive > 0 ? "#E8756A" : "#C4A050", lineHeight: 1 }}>{xCodesActive}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{xCodesActive === 0 ? "none active" : "blocked"}</div>
            </div>
            <div style={{ width: 1, background: "rgba(196,154,90,0.15)", alignSelf: "stretch", marginRight: 36 }} />
            <div style={{ flex: "0 0 auto", paddingRight: 40 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 10 }}>Payments Today</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, lineHeight: 1 }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 400, color: "#7DC898" }}>{confirmedTodayCount}</span>
                <span style={{ fontSize: 18, color: "rgba(255,255,255,0.25)" }}>/ {expectedToday.length}</span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>confirmed / expected</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 10 }}>Portfolio</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 400, color: "#C4A050", lineHeight: 1 }}>{moneyM(totalBalance)}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6, textAlign: "right" }}>
                {clients.length} clients · {moneyM(totalFunded)} funded
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3, textAlign: "right" }}>
                {clients.filter(c => c.payment_frequency === "daily").length} daily · {clients.filter(c => c.payment_frequency === "weekly").length} weekly
              </div>
            </div>
          </div>
        </div>

        {/* ── Portfolio Health ── */}
        <SectionDivider label="Portfolio Health" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 0 }}>

          {/* Distribution */}
          <div style={surfaceCard}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Performance Distribution</div>
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 18, marginBottom: 14 }}>
              {payingWell.length > 0 && <div style={{ flex: payingWell.length, background: "#7DC898" }} title={`${payingWell.length} paying well`} />}
              {atRisk.length > 0 && <div style={{ flex: atRisk.length, background: "#c48c28" }} title={`${atRisk.length} at risk`} />}
              {critical.length > 0 && <div style={{ flex: critical.length, background: "#b83220" }} title={`${critical.length} critical`} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { label: "Paying Well", count: payingWell.length, color: "#7DC898", desc: "no active risk signals" },
                { label: "At Risk", count: atRisk.length, color: "#c48c28", desc: "1 risk signal active" },
                { label: "Critical", count: critical.length, color: "#b83220", desc: "2+ risk signals" },
              ].map(({ label, count, color, desc }) => (
                <div key={label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 400, color: count > 0 && label !== "Paying Well" ? color : "var(--ink-1)" }}>{count}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3 }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Renewal Eligible</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: "var(--sage)" }}>{refinancingEligible.length}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)" }}>≥50% paid · Good Standing</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Avg % Paid</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: "var(--ink-2)" }}>
                    {clients.length > 0 ? pct(clients.reduce((s, c) => s + Number(c.percentage_paid || 0), 0) / clients.length) : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)" }}>across all active clients</div>
                </div>
              </div>
            </div>
          </div>

          {/* Needs Attention Now */}
          <div style={{ ...surfaceCard, borderLeft: "4px solid #b83220", borderRadius: "4px 14px 14px 4px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#b83220", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Needs Attention Now</div>
            <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 14 }}>Clients with 2+ active risk signals — act first</div>
            {needsAttentionNow.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No clients with multiple risk signals.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {needsAttentionNow.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "rgba(184,50,32,0.05)", border: "1px solid rgba(184,50,32,0.15)", borderRadius: 8, cursor: "pointer" }} onClick={() => openClient(c)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.business_name}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{c.invoice}{c.sales_rep ? ` · ${c.sales_rep}` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-2)" }}>{money(Number(c.balance || 0))}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#b83220", marginTop: 2 }}>{riskSignalCount[c.id]} signals</div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── Risk Signals ── */}
        <SectionDivider label="Risk Signals" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Trigger Risk */}
          <div style={{ ...surfaceCard, borderLeft: "4px solid #b83220", borderRadius: "4px 14px 14px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#b83220", textTransform: "uppercase", letterSpacing: "0.1em" }}>Trigger Risk</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>Funded before this month · &lt;3% of month-start balance paid</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#b83220", background: "rgba(184,50,32,0.1)", border: "1px solid rgba(184,50,32,0.25)", borderRadius: 99, padding: "3px 11px" }}>{triggerRiskClients.length}</span>
            </div>
            {triggerRiskClients.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No trigger risk clients this month.</div>
              : <>
                  <div style={expandedPanels.trigger ? { maxHeight: 400, overflowY: "auto", paddingRight: 2 } : {}}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(expandedPanels.trigger ? triggerRiskClients : triggerRiskClients.slice(0, 5)).map(c => (
                        <RiskRow key={c.id} client={c} accent="#b83220">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.business_name}</div>
                            <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{c.invoice}{c.sales_rep ? ` · ${c.sales_rep}` : ""}</div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-2)" }}>{money(Number(c.balance || 0))}</div>
                            {Number(c.trigger_shortfall) > 0 && <div style={{ fontSize: 10, color: "#b83220", fontWeight: 700 }}>{money(Number(c.trigger_shortfall))} short</div>}
                          </div>
                        </RiskRow>
                      ))}
                    </div>
                  </div>
                  <ShowToggle panelKey="trigger" total={triggerRiskClients.length} accent="#b83220" />
                </>
            }
          </div>

          {/* High Returns — Daily */}
          <div style={{ ...surfaceCard, borderLeft: "4px solid #D4461E", borderRadius: "4px 14px 14px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#D4461E", textTransform: "uppercase", letterSpacing: "0.1em" }}>High Returns — Daily</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>Daily clients · 3+ returned payments this month</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#D4461E", background: "rgba(212,70,30,0.1)", border: "1px solid rgba(212,70,30,0.25)", borderRadius: 99, padding: "3px 11px" }}>{highReturnClients.length}</span>
            </div>
            {highReturnClients.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No daily clients with 3+ returns this month.</div>
              : <>
                  <div style={expandedPanels.returns ? { maxHeight: 400, overflowY: "auto", paddingRight: 2 } : {}}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(expandedPanels.returns ? highReturnClients : highReturnClients.slice(0, 5)).map(c => {
                        const rc = monthlyReturnsByInvoice[c.invoice] || 0;
                        return (
                          <RiskRow key={c.id} client={c} accent="#D4461E">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.business_name}</div>
                              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{c.invoice}{c.sales_rep ? ` · ${c.sales_rep}` : ""}</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-2)" }}>{money(Number(c.balance || 0))}</div>
                              <div style={{ fontSize: 10, color: "#D4461E", fontWeight: 700 }}>{rc} return{rc !== 1 ? "s" : ""} this month</div>
                            </div>
                          </RiskRow>
                        );
                      })}
                    </div>
                  </div>
                  <ShowToggle panelKey="returns" total={highReturnClients.length} accent="#D4461E" />
                </>
            }
          </div>

          {/* Weekly Returned */}
          <div style={{ ...surfaceCard, borderLeft: "4px solid var(--sienna)", borderRadius: "4px 14px 14px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sienna)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Weekly Returned</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>Weekly clients · any return this month (1 = ~25% of monthly)</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sienna)", background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", borderRadius: 99, padding: "3px 11px" }}>{weeklyReturnedClients.length}</span>
            </div>
            {weeklyReturnedClients.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No weekly clients with returns this month.</div>
              : <>
                  <div style={expandedPanels.weekly ? { maxHeight: 400, overflowY: "auto", paddingRight: 2 } : {}}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(expandedPanels.weekly ? weeklyReturnedClients : weeklyReturnedClients.slice(0, 5)).map(c => {
                        const rc = monthlyReturnsByInvoice[c.invoice] || 0;
                        return (
                          <RiskRow key={c.id} client={c} accent="var(--sienna)">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.business_name}</div>
                              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{c.invoice}{c.sales_rep ? ` · ${c.sales_rep}` : ""}</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-2)" }}>{money(Number(c.balance || 0))}</div>
                              <div style={{ fontSize: 10, color: "var(--sienna)", fontWeight: 700 }}>{rc}× returned this month</div>
                            </div>
                          </RiskRow>
                        );
                      })}
                    </div>
                  </div>
                  <ShowToggle panelKey="weekly" total={weeklyReturnedClients.length} accent="var(--sienna)" />
                </>
            }
          </div>

          {/* X-Codes Active */}
          <div style={{ ...surfaceCard, borderLeft: "4px solid #6D28D9", borderRadius: "4px 14px 14px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6D28D9", textTransform: "uppercase", letterSpacing: "0.1em" }}>X-Codes Active</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>Account blocked · collection halted</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6D28D9", background: "rgba(109,40,217,0.08)", border: "1px solid rgba(109,40,217,0.25)", borderRadius: 99, padding: "3px 11px" }}>{xCodeActiveClients.length}</span>
            </div>
            {xCodeActiveClients.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No X-code blocks detected.</div>
              : <>
                  <div style={expandedPanels.xcodes ? { maxHeight: 400, overflowY: "auto", paddingRight: 2 } : {}}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(expandedPanels.xcodes ? xCodeActiveClients : xCodeActiveClients.slice(0, 5)).map(c => (
                        <RiskRow key={c.id} client={c} accent="#6D28D9">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.business_name}</div>
                            <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>
                              {c.invoice}{c.last_return_code ? ` · Code: ${c.last_return_code}` : ""}{c.sales_rep ? ` · ${c.sales_rep}` : ""}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-2)" }}>{money(Number(c.balance || 0))}</div>
                            <div style={{ fontSize: 10, color: "#6D28D9", fontWeight: 700 }}>blocked</div>
                          </div>
                        </RiskRow>
                      ))}
                    </div>
                  </div>
                  <ShowToggle panelKey="xcodes" total={xCodeActiveClients.length} accent="#6D28D9" />
                </>
            }
          </div>
        </div>

        <div style={{ marginTop: 40, textAlign: "center", fontSize: 11, color: "var(--ink-5)", lineHeight: 1.6 }}>
          This portal is a personal organizational tool operated independently by Fellipe Busato.<br />
          It is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions.
        </div>
      </div>
    </div>
  );
}
