"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { addBusinessDays, toDateStr, formatDate, money } from "@/lib/holidays";
import type { Client, Payment } from "@/lib/types";

type PaymentHistoryProps = {
  payments: Payment[];
  client?: Client;
  isAdminView?: boolean;
  onPaymentAdded?: () => void;
};

// ── Status badge helpers ─────────────────────────────────────────────────────
function badge(label: string, bg: string, border: string, color: string) {
  return (
    <span style={{ display: "inline-block", borderRadius: 99, background: bg, border: `1px solid ${border}`, padding: "2px 10px", fontSize: 11, fontWeight: 500, color, fontFamily: "'DM Sans', sans-serif" }}>
      {label}
    </span>
  );
}

function TypeBadge({ description, isPending }: { description: string; isPending: boolean }) {
  if (isPending) return badge("Processing", "rgba(40,110,190,0.1)", "rgba(40,110,190,0.25)", "#1a5fa8");
  const desc = (description || "").toLowerCase();
  if (desc.includes("initial")) return badge("Initial credit", "rgba(40,110,190,0.08)", "rgba(40,110,190,0.2)", "#1a5fa8");
  if (desc.includes("return")) return badge("Returned", "rgba(190,60,40,0.1)", "rgba(190,60,40,0.25)", "#b83220");
  if (desc.includes("missed")) return badge("Missed", "rgba(196,140,40,0.1)", "rgba(196,140,40,0.25)", "#a07010");
  return badge("Settled", "rgba(34,139,34,0.1)", "rgba(34,139,34,0.25)", "#1a7a1a");
}

// ── Add Payment Form ─────────────────────────────────────────────────────────
function AddPaymentForm({ client, onSuccess, onCancel }: {
  client: Client; onSuccess: () => void; onCancel: () => void;
}) {
  const [achDate, setAchDate] = useState(toDateStr(new Date()));
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date();
  const parsedDate = achDate ? new Date(achDate + "T00:00:00") : null;
  const settlementDate = parsedDate ? addBusinessDays(parsedDate, 4) : null;
  const settlementStr = settlementDate ? toDateStr(settlementDate) : "";
  const alreadySettled = settlementDate ? settlementDate <= today : false;

  async function handleSave() {
    if (!achDate) { setError("Please enter an ACH date."); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { setError("Please enter a valid amount."); return; }
    setSaving(true); setError("");
    const debit = Number(amount);
    const currentBalance = Number(client.balance || 0);
    const newBalance = alreadySettled ? Math.max(currentBalance - debit, 0) : currentBalance;
    const { error: insertError } = await supabase.from("payments").insert({
      invoice: client.invoice, payment_date: achDate, ach_date: achDate,
      settlement_date: settlementStr, description: "Posted",
      credit: 0, debit, returns: 0,
      running_balance: alreadySettled ? newBalance : null,
    });
    if (insertError) {
      setError(insertError.code === "23505" ? "A payment with this date and amount already exists." : insertError.message);
      setSaving(false); return;
    }
    if (alreadySettled) {
      await supabase.from("clients").update({ balance: newBalance, status: "Good Standing" }).eq("id", client.id);
    }
    setSaving(false); onSuccess();
  }

  return (
    <div style={{ background: "var(--sage-surface)", border: "1px solid var(--sage-border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--sage)", fontFamily: "'DM Sans', sans-serif" }}>Add payment</p>
        <button onClick={onCancel} style={{ fontSize: 12, color: "var(--sage)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--sage)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif" }}>ACH date</label>
          <input type="date" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--sage-border)", background: "var(--surface)", padding: "8px 10px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
            value={achDate} onChange={e => setAchDate(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--sage)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif" }}>Amount ($)</label>
          <input type="number" placeholder={client.payment ? String(client.payment) : "0.00"}
            style={{ width: "100%", borderRadius: 8, border: "1px solid var(--sage-border)", background: "var(--surface)", padding: "8px 10px", fontSize: 13, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
            value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--sage)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif" }}>Settles on</label>
          <div style={{ borderRadius: 8, border: "1px solid var(--sage-border)", background: "var(--surface)", padding: "8px 10px", fontSize: 13, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>
            {settlementStr ? `${formatDate(settlementStr)} · ${alreadySettled ? "settled" : "pending"}` : "—"}
          </div>
        </div>
      </div>
      {amount && Number(amount) > 0 && (
        <div style={{ borderRadius: 8, background: "var(--surface)", border: "1px solid var(--sage-border)", padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>
          {alreadySettled
            ? <>Payment of <strong>{money(Number(amount))}</strong> — balance updates from <strong>{money(Number(client.balance || 0))}</strong> to <strong style={{ color: "var(--sage)" }}>{money(Math.max(Number(client.balance || 0) - Number(amount), 0))}</strong></>
            : <>Payment of <strong>{money(Number(amount))}</strong> — will show as <strong style={{ color: "#1a5fa8" }}>Processing</strong> until {formatDate(settlementStr)}. Balance updates on settlement.</>}
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: "var(--sienna)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>{error}</p>}
      <button onClick={handleSave} disabled={saving}
        style={{ background: "var(--sage)", color: "white", border: "none", padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving..." : "Save payment"}
      </button>
    </div>
  );
}

// ── Edit Payment Row ─────────────────────────────────────────────────────────
function EditPaymentRow({ payment, client, onSuccess, onCancel }: {
  payment: Payment; client: Client; onSuccess: () => void; onCancel: () => void;
}) {
  const [achDate, setAchDate] = useState(payment.ach_date || payment.payment_date || "");
  const [amount, setAmount] = useState(String(payment.debit || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date();
  const parsedDate = achDate ? new Date(achDate + "T00:00:00") : null;
  const settlementDate = parsedDate ? addBusinessDays(parsedDate, 4) : null;
  const settlementStr = settlementDate ? toDateStr(settlementDate) : "";
  const alreadySettled = settlementDate ? settlementDate <= today : false;

  async function handleSave() {
    if (!achDate || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid date and amount."); return;
    }
    setSaving(true); setError("");
    const debit = Number(amount);
    const oldDebit = Number(payment.debit || 0);
    const currentBalance = Number(client.balance || 0);
    let newBalance = currentBalance;
    if (payment.running_balance != null) newBalance = currentBalance + oldDebit;
    if (alreadySettled) newBalance = Math.max(newBalance - debit, 0);
    const { error: updateError } = await supabase.from("payments").update({
      ach_date: achDate, payment_date: achDate, settlement_date: settlementStr,
      debit, running_balance: alreadySettled ? newBalance : null,
    }).eq("id", payment.id);
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    if (alreadySettled || payment.running_balance != null) {
      await supabase.from("clients").update({ balance: newBalance }).eq("id", client.id);
    }
    setSaving(false); onSuccess();
  }

  return (
    <tr style={{ background: "rgba(40,110,190,0.04)", borderBottom: "1px solid rgba(40,110,190,0.1)" }}>
      <td colSpan={7} style={{ padding: "10px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#1a5fa8", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>ACH Date</label>
            <input type="date" style={{ borderRadius: 7, border: "1px solid rgba(40,110,190,0.3)", background: "var(--surface)", padding: "7px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
              value={achDate} onChange={e => setAchDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#1a5fa8", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>Amount ($)</label>
            <input type="number" style={{ borderRadius: 7, border: "1px solid rgba(40,110,190,0.3)", background: "var(--surface)", padding: "7px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", width: 100, fontFamily: "'DM Sans', sans-serif" }}
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-4)", paddingBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
            {settlementStr ? `Settles ${formatDate(settlementStr)} (${alreadySettled ? "settled" : "pending"})` : "—"}
          </div>
          {error && <p style={{ fontSize: 11, color: "var(--sienna)", fontFamily: "'DM Sans', sans-serif", alignSelf: "center" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, paddingBottom: 2 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ background: "#1a5fa8", color: "white", border: "none", padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={onCancel}
              style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PaymentHistory({ payments, client, isAdminView, onPaymentAdded }: PaymentHistoryProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const hasPending = payments.some(p => {
    if (!p.settlement_date) return false;
    const s = new Date(p.settlement_date); s.setHours(0, 0, 0, 0);
    const desc = (p.description || "").toLowerCase();
    return s > today && !desc.includes("missed") && !desc.includes("return");
  });

  function handleSuccess() { setShowAddForm(false); setEditingId(null); onPaymentAdded?.(); }

  async function handleDelete(payment: Payment) {
    const confirmed = confirm(
      `Are you sure you want to delete this payment?\n\nDate: ${formatDate(payment.ach_date || payment.payment_date)}\nAmount: ${money(Number(payment.debit || payment.returns || payment.credit || 0))}\n\nThis will also reverse the balance adjustment if the payment had settled.`
    );
    if (!confirmed) return;
    setDeletingId(payment.id);
    if (payment.running_balance != null && payment.debit > 0 && client) {
      const restoredBalance = Number(client.balance || 0) + Number(payment.debit);
      await supabase.from("clients").update({ balance: restoredBalance }).eq("id", client.id);
    }
    await supabase.from("payments").delete().eq("id", payment.id);
    setDeletingId(null);
    onPaymentAdded?.();
  }

  const sortedPayments = [...payments].reverse();

  const thStyle: React.CSSProperties = {
    padding: "10px 20px", fontSize: 10, fontWeight: 600, color: "var(--ink-4)",
    textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "left",
    borderBottom: "1px solid var(--border)", fontFamily: "'DM Sans', sans-serif",
    background: "var(--parchment-2)", position: "sticky", top: 0, zIndex: 1,
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(30,16,4,0.06)" }}>

      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Payment History</h3>
          <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{payments.length} transaction{payments.length !== 1 ? "s" : ""}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {hasPending && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#1a5fa8", fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a5fa8", display: "inline-block" }} />
              Pending payments
            </span>
          )}
          {isAdminView && client && (
            <button
              onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: showAddForm ? "var(--parchment-2)" : "var(--sage-surface)", color: showAddForm ? "var(--ink-3)" : "var(--sage)", border: `1px solid ${showAddForm ? "var(--border-mid)" : "var(--sage-border)"}` }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {showAddForm ? "Cancel" : "+ Add payment"}
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && isAdminView && client && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <AddPaymentForm client={client} onSuccess={handleSuccess} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      {/* Pending notice */}
      {hasPending && (
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "rgba(40,110,190,0.04)" }}>
          <p style={{ fontSize: 12, color: "#1a5fa8", fontFamily: "'DM Sans', sans-serif" }}>
            Payments done via ACH takes <strong>4 business days</strong> to settle and apply to your balance. Pending payments are shown but do not yet affect your balance.
          </p>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr>
              <th style={thStyle}>ACH Date</th>
              <th style={thStyle}>Settles</th>
              <th style={thStyle}>Type</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Credit</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Debit</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Returns</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
              {isAdminView && <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedPayments.map((p, idx) => {
              const settlDate = p.settlement_date ? new Date(p.settlement_date) : null;
              if (settlDate) settlDate.setHours(0, 0, 0, 0);
              const desc = (p.description || "").toLowerCase();
              const isPending = !!(settlDate && settlDate > today && !desc.includes("missed") && !desc.includes("return"));
              const isReturn = desc.includes("return");
              const isMissed = desc.includes("missed");
              const isEditing = editingId === p.id;
              const isDeleting = deletingId === p.id;

              const rowBg = isReturn
                ? "rgba(190,60,40,0.04)"
                : isMissed
                ? "rgba(196,140,40,0.04)"
                : isPending
                ? "rgba(40,110,190,0.03)"
                : isEditing
                ? "rgba(40,110,190,0.06)"
                : "transparent";

              const tdStyle: React.CSSProperties = {
                padding: "11px 20px", fontSize: 13, color: "var(--ink-2)",
                borderBottom: "1px solid var(--border)", fontFamily: "'DM Sans', sans-serif",
              };

              return (
                <React.Fragment key={p.id || idx}>
                  <tr style={{ background: rowBg }}>
                    <td style={tdStyle}>{formatDate(p.ach_date || p.payment_date)}</td>
                    <td style={tdStyle}>
                      {isPending
                        ? <span style={{ color: "#1a5fa8", fontWeight: 500 }}>{formatDate(p.settlement_date)}</span>
                        : <span style={{ color: "var(--ink-4)" }}>{p.settlement_date ? formatDate(p.settlement_date) : "—"}</span>}
                    </td>
                    <td style={tdStyle}>
                      <TypeBadge description={p.description} isPending={isPending} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {p.credit > 0
                        ? <span style={{ fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>{money(Number(p.credit))}</span>
                        : <span style={{ color: "var(--ink-5)" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {p.debit > 0
                        ? <span style={{ fontWeight: 500, color: isPending ? "#1a5fa8" : "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>{money(Number(p.debit))}</span>
                        : <span style={{ color: "var(--ink-5)" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {p.returns > 0
                        ? <span style={{ fontWeight: 600, color: "#b83220", fontFamily: "'DM Mono', monospace" }}>{money(Number(p.returns))}</span>
                        : <span style={{ color: "var(--ink-5)" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {isPending
                        ? <span style={{ color: "var(--ink-4)", fontSize: 11, fontStyle: "italic" }}>pending</span>
                        : p.running_balance != null
                        ? <span style={{ fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>{money(Number(p.running_balance))}</span>
                        : <span style={{ color: "var(--ink-5)" }}>—</span>}
                    </td>
                    {isAdminView && (
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          <button
                            onClick={() => { setEditingId(isEditing ? null : p.id); setShowAddForm(false); }}
                            style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: isEditing ? "rgba(40,110,190,0.1)" : "transparent", color: isEditing ? "#1a5fa8" : "var(--ink-4)", border: isEditing ? "1px solid rgba(40,110,190,0.2)" : "1px solid var(--border-mid)" }}>
                            {isEditing ? "Cancel" : "Edit"}
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={isDeleting}
                            style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: "transparent", color: "var(--sienna)", border: "1px solid var(--sienna-border)", opacity: isDeleting ? 0.4 : 1 }}>
                            {isDeleting ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isEditing && client && (
                    <EditPaymentRow
                      payment={p}
                      client={client}
                      onSuccess={handleSuccess}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </React.Fragment>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={isAdminView ? 8 : 7} style={{ padding: "40px", textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
                  No payment history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
