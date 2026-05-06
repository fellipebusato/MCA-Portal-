"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Position = {
  id: number;
  client_id: number;
  invoice: string;
  payback: number;
  balance: number;
  funded_date: string | null;
  position_order: number;
  status: string;
};

type Client = {
  id: number;
  business_name: string;
  invoice: string;
  balance: number;
  payback: number;
  payment: number;
  [key: string]: any;
};

function money(n: number) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

type FundingsPanelProps = {
  client: Client;
  isAdminView?: boolean;
  onFundingAdded?: () => void;
  onBalanceChange?: (combinedBalance: number, combinedPayback: number) => void;
};

export default function FundingsPanel({ client, isAdminView, onFundingAdded, onBalanceChange }: FundingsPanelProps) {
  const [fundings, setFundings] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newInvoice, setNewInvoice] = useState("");
  const [newPayback, setNewPayback] = useState("");
  const [newFundedDate, setNewFundedDate] = useState("");

  async function loadFundings() {
    setLoading(true);
    const { data } = await supabase
      .from("positions")
      .select("*")
      .eq("client_id", client.id)
      .order("position_order", { ascending: true });
    const list = (data || []) as Position[];
    setFundings(list);

    if (list.length > 0) {
      const positionsBalance = list.reduce((sum, p) => sum + Number(p.balance), 0);
      const positionsPayback = list.reduce((sum, p) => sum + Number(p.payback), 0);
      onBalanceChange?.(
        Number(client.balance || 0) + positionsBalance,
        Number(client.payback || 0) + positionsPayback
      );
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFundings(); }, [client.id]);

  async function handleAddFunding() {
    if (!newInvoice.trim() || !newPayback) return;
    setAdding(true);
    const nextOrder = fundings.length + 1;
    const { error } = await supabase.from("positions").insert({
      client_id: client.id,
      invoice: newInvoice.trim().toUpperCase(),
      payback: Number(newPayback),
      balance: Number(newPayback),
      funded_date: newFundedDate || null,
      position_order: nextOrder,
      status: "active",
    });
    if (error) { alert(error.message); setAdding(false); return; }
    setNewInvoice(""); setNewPayback(""); setNewFundedDate("");
    setShowAdd(false); setAdding(false);
    await loadFundings();
    onFundingAdded?.();
  }

  async function markCompleted(funding: Position) {
    await supabase.from("positions").update({ status: "completed", balance: 0 }).eq("id", funding.id);
    await loadFundings();
  }

  if (loading) return null;
  if (fundings.length === 0 && !isAdminView) return null;

  const totalPayback = fundings.reduce((sum, p) => sum + Number(p.payback), 0);
  const totalBalance = fundings.reduce((sum, p) => sum + Number(p.balance), 0);
  const totalPaid = totalPayback - totalBalance;
  const combinedPct = totalPayback > 0 ? Math.round((totalPaid / totalPayback) * 100) : 0;
  const trueCombinedBalance = Number(client.balance || 0) + totalBalance;

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 8,
    border: "1px solid var(--border-mid)",
    background: "var(--surface)",
    padding: "8px 10px",
    fontSize: 13,
    color: "var(--ink-1)",
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: "border-box",
  };

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Add-on fundings</p>
          <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {fundings.length} funding{fundings.length !== 1 ? "s" : ""} · {money(trueCombinedBalance)} combined balance · {combinedPct}% paid overall
          </p>
        </div>
        {isAdminView && (
          <button onClick={() => setShowAdd(v => !v)}
            style={{ borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)", padding: "6px 14px", fontSize: 12, fontWeight: 500, color: "#6366f1", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            + Add funding
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && isAdminView && (
        <div style={{ padding: "16px 20px", background: "rgba(99,102,241,0.04)", borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6366f1", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>New add-on funding</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#6366f1", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif" }}>Invoice #</label>
              <input type="text" placeholder="INV100133" style={inputStyle}
                value={newInvoice} onChange={e => setNewInvoice(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#6366f1", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif" }}>Payback amount ($)</label>
              <input type="number" placeholder="11272" style={inputStyle}
                value={newPayback} onChange={e => setNewPayback(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#6366f1", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif" }}>Funded date</label>
              <input type="date" style={inputStyle}
                value={newFundedDate} onChange={e => setNewFundedDate(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={handleAddFunding} disabled={adding || !newInvoice.trim() || !newPayback}
              style={{ background: "#6366f1", color: "white", border: "none", padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: adding || !newInvoice.trim() || !newPayback ? 0.5 : 1 }}>
              {adding ? "Adding..." : `Add as funding ${fundings.length + 1}`}
            </button>
            <button onClick={() => { setShowAdd(false); setNewInvoice(""); setNewPayback(""); setNewFundedDate(""); }}
              style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Fundings list */}
      <div>
        {fundings.map((funding, idx) => {
          const paid = Number(funding.payback) - Number(funding.balance);
          const pct = Number(funding.payback) > 0 ? Math.round((paid / Number(funding.payback)) * 100) : 0;
          const isCompleted = funding.status === "completed" || Number(funding.balance) === 0;
          const isCurrent = !isCompleted && (idx === 0 || fundings[idx - 1]?.status === "completed");

          const rowBg = isCompleted ? "rgba(34,139,34,0.03)" : isCurrent ? "var(--surface)" : "var(--parchment-2)";
          const numBg = isCompleted ? "rgba(34,139,34,0.12)" : isCurrent ? "rgba(99,102,241,0.12)" : "var(--parchment-3)";
          const numColor = isCompleted ? "var(--sage)" : isCurrent ? "#6366f1" : "var(--ink-4)";
          const barColor = isCompleted ? "var(--sage)" : "#6366f1";

          return (
            <div key={funding.id} style={{ padding: "16px 20px", background: rowBg, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: numBg, color: numColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>
                    {funding.position_order}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{funding.invoice}</p>
                      {isCompleted && <span style={{ borderRadius: 99, background: "rgba(34,139,34,0.1)", border: "1px solid rgba(34,139,34,0.25)", padding: "1px 8px", fontSize: 10, fontWeight: 500, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif" }}>Paid in full</span>}
                      {isCurrent && !isCompleted && <span style={{ borderRadius: 99, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", padding: "1px 8px", fontSize: 10, fontWeight: 500, color: "#6366f1", fontFamily: "'DM Sans', sans-serif" }}>Active</span>}
                      {!isCurrent && !isCompleted && <span style={{ borderRadius: 99, background: "var(--parchment-3)", border: "1px solid var(--border)", padding: "1px 8px", fontSize: 10, fontWeight: 500, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>Queued</span>}
                    </div>
                    {funding.funded_date && (
                      <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>Funded {formatDate(funding.funded_date)}</p>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>Payback</p>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Mono', monospace" }}>{money(Number(funding.payback))}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>Paid</p>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--sage)", fontFamily: "'DM Mono', monospace" }}>{money(paid)}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>Balance</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: isCompleted ? "var(--sage)" : "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>
                      {isCompleted ? "$0.00" : money(Number(funding.balance))}
                    </p>
                  </div>
                  {isAdminView && !isCompleted && Number(funding.balance) === 0 && (
                    <button onClick={() => markCompleted(funding)}
                      style={{ borderRadius: 8, border: "1px solid var(--sage-border)", background: "var(--sage-surface)", padding: "5px 12px", fontSize: 11, fontWeight: 500, color: "var(--sage)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      Mark complete
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{pct}% paid</p>
                  <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{money(paid)} of {money(Number(funding.payback))}</p>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: "var(--parchment-3)", overflow: "hidden" }}>
                  <div style={{ height: 5, borderRadius: 99, background: barColor, width: `${Math.min(100, pct)}%`, transition: "width 0.5s ease" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Combined total */}
      {fundings.length > 1 && (
        <div style={{ padding: "12px 20px", background: "var(--parchment-2)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>Combined total</p>
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "Total payback", value: money(totalPayback) },
              { label: "Total paid", value: money(totalPaid), color: "var(--sage)" },
              { label: "Remaining", value: money(totalBalance) },
            ].map(item => (
              <div key={item.label} style={{ textAlign: "right" }}>
                <p style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{item.label}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: item.color || "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
