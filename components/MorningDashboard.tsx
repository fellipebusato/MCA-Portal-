"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/holidays";

type TodayStats = {
  expectedSettlements: { invoice: string; business_name: string; amount: number }[];
  returnsSettling: { invoice: string; business_name: string; amount: number }[];
  notInFile: { invoice: string; business_name: string; amount: number }[];
  confirmedSettled: { invoice: string; business_name: string; amount: number }[];
};

export default function MorningDashboard({ clients }: { clients: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const dayOfWeek = today.getDay(); // 0=Sun, 5=Fri

  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];
  const monthDay = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  async function loadTodayStats() {
    setLoading(true);

    // Payments that settle today (ACH sent 4 business days ago)
    const { data: settlingToday } = await supabase
      .from("payments")
      .select("invoice, debit, description")
      .eq("settlement_date", todayStr)
      .gt("debit", 0);

    // Returns that settle today
    const { data: returnsToday } = await supabase
      .from("payments")
      .select("invoice, returns, description")
      .eq("settlement_date", todayStr)
      .gt("returns", 0);

    const expectedSettlements: TodayStats["expectedSettlements"] = [];
    const confirmedSettled: TodayStats["confirmedSettled"] = [];
    const returnsSettling: TodayStats["returnsSettling"] = [];

    for (const p of settlingToday || []) {
      const client = clients.find(c => c.invoice === p.invoice);
      if (!client) continue;
      const desc = (p.description || "").toLowerCase();
      if (desc.includes("missed") || desc.includes("return")) continue;
      if (desc.includes("posted")) {
        confirmedSettled.push({ invoice: p.invoice, business_name: client.business_name, amount: Number(p.debit) });
      } else {
        expectedSettlements.push({ invoice: p.invoice, business_name: client.business_name, amount: Number(p.debit) });
      }
    }

    for (const p of returnsToday || []) {
      const client = clients.find(c => c.invoice === p.invoice);
      if (!client) continue;
      returnsSettling.push({ invoice: p.invoice, business_name: client.business_name, amount: Number(p.returns) });
    }

    // Who was expected but NOT in today file (missed)
    const notInFile: TodayStats["notInFile"] = [];
    if (dayOfWeek === 5) { // Friday — settlement day
      for (const client of clients) {
        const alreadySettling = confirmedSettled.some(s => s.invoice === client.invoice) ||
          expectedSettlements.some(s => s.invoice === client.invoice);
        if (!alreadySettling && Number(client.balance) > 0) {
          // Check if they had a payment 4 business days ago
          notInFile.push({ invoice: client.invoice, business_name: client.business_name, amount: Number(client.payment) });
        }
      }
    }

    setStats({ expectedSettlements, returnsSettling, notInFile, confirmedSettled });
    setLoading(false);
  }

  useEffect(() => {
    if (expanded && !stats) loadTodayStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const netExpected = (stats?.confirmedSettled.reduce((s, p) => s + p.amount, 0) || 0) +
    (stats?.expectedSettlements.reduce((s, p) => s + p.amount, 0) || 0) -
    (stats?.returnsSettling.reduce((s, p) => s + p.amount, 0) || 0);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 20, boxShadow: "0 1px 4px rgba(30,16,4,0.06)", overflow: "hidden" }}>

      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--parchment-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="6" stroke="var(--ink-3)" strokeWidth="1.3"/>
              <path d="M7.5 4v3.5l2.5 2" stroke="var(--ink-3)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Today&apos;s settlement picture</p>
            <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{dayName}, {monthDay} · Internal only</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {stats && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sage)", fontFamily: "'DM Mono', monospace" }}>
              Net {money(netExpected)}
            </span>
          )}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: "var(--ink-4)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {loading && (
            <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
              Loading today&apos;s data...
            </div>
          )}

          {!loading && stats && (
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Summary row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  {
                    label: "Settling today",
                    value: money((stats.confirmedSettled.reduce((s, p) => s + p.amount, 0)) + (stats.expectedSettlements.reduce((s, p) => s + p.amount, 0))),
                    sub: `${stats.confirmedSettled.length + stats.expectedSettlements.length} clients`,
                    color: "var(--sage)",
                  },
                  {
                    label: "Returns settling today",
                    value: money(stats.returnsSettling.reduce((s, p) => s + p.amount, 0)),
                    sub: `${stats.returnsSettling.length} client${stats.returnsSettling.length !== 1 ? "s" : ""} · reduces receivables`,
                    color: "var(--sienna)",
                  },
                  {
                    label: "Net expected today",
                    value: money(netExpected),
                    sub: "After returns",
                    color: "var(--ink-1)",
                  },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{item.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 500, color: item.color, fontFamily: "'Cormorant Garamond', serif", lineHeight: 1 }}>{item.value}</p>
                    <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* Confirmed settled */}
              {stats.confirmedSettled.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--sage)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
                    ✅ {stats.confirmedSettled.length} confirmed settled
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {stats.confirmedSettled.map(p => (
                      <div key={p.invoice} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", padding: "6px 12px", background: "var(--sage-surface)", borderRadius: 8 }}>
                        <span>{p.business_name}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "var(--sage)" }}>{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Returns settling */}
              {stats.returnsSettling.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--sienna)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
                    ⚠️ {stats.returnsSettling.length} return{stats.returnsSettling.length !== 1 ? "s" : ""} settling today
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {stats.returnsSettling.map(p => (
                      <div key={p.invoice} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", padding: "6px 12px", background: "var(--sienna-surface)", borderRadius: 8 }}>
                        <span>{p.business_name}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "var(--sienna)" }}>-{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Not in file */}
              {stats.notInFile.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#c48c28", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
                    🔍 {stats.notInFile.length} expected but not confirmed — review needed
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {stats.notInFile.map(p => (
                      <div key={p.invoice} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", padding: "6px 12px", background: "rgba(196,140,40,0.08)", border: "1px solid rgba(196,140,40,0.2)", borderRadius: 8 }}>
                        <span>{p.business_name}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: "#c48c28" }}>{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.confirmedSettled.length === 0 && stats.returnsSettling.length === 0 && stats.notInFile.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
                  No settlement activity found for today. Upload the daily file to see today&apos;s picture.
                </div>
              )}

              <button
                onClick={() => { setStats(null); loadTodayStats(); }}
                style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                ↻ Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
