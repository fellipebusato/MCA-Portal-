"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type PaymentHistoryProps = {
  payments: any[];
  client?: any;
  isAdminView?: boolean;
  onPaymentAdded?: () => void;
};

const BANK_HOLIDAYS = new Set([
  "2025-01-01","2025-01-20","2025-02-17","2025-05-26","2025-06-19",
  "2025-07-04","2025-09-01","2025-10-13","2025-11-11","2025-11-27","2025-12-25",
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19",
  "2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18",
  "2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
  "2028-01-01","2028-01-17","2028-02-21","2028-05-29","2028-06-19",
  "2028-07-04","2028-09-04","2028-10-09","2028-11-11","2028-11-23","2028-12-25",
]);

function isWeekend(date: Date): boolean { return date.getDay() === 0 || date.getDay() === 6; }
function isHoliday(date: Date): boolean {
  const str = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  return BANK_HOLIDAYS.has(str);
}
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result) && !isHoliday(result)) added++;
  }
  return result;
}
function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function formatDate(date: string) {
  if (!date) return "—";
  const d = new Date(date);
  const utc = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function TypeBadge({ description }: { description: string }) {
  const desc = (description || "").toLowerCase();
  if (desc.includes("initial")) return <span className="inline-block rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">Initial credit</span>;
  if (desc.includes("return")) return <span className="inline-block rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">Returned</span>;
  if (desc.includes("missed")) return <span className="inline-block rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">Missed</span>;
  return <span className="inline-block rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Posted</span>;
}

function AddPaymentForm({ client, onSuccess, onCancel }: { client: any; onSuccess: () => void; onCancel: () => void; }) {
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
    setSaving(true);
    setError("");
    const debit = Number(amount);
    const currentBalance = Number(client.balance || 0);
    const newBalance = alreadySettled ? Math.max(currentBalance - debit, 0) : currentBalance;
    const { error: insertError } = await supabase.from("payments").insert({
      invoice: client.invoice, payment_date: achDate, ach_date: achDate,
      settlement_date: settlementStr, description: "Posted",
      credit: 0, debit, returns: 0, running_balance: alreadySettled ? newBalance : null,
    });
    if (insertError) { setError(insertError.code === "23505" ? "A payment with this date and amount already exists." : insertError.message); setSaving(false); return; }
    if (alreadySettled) { await supabase.from("clients").update({ balance: newBalance, status: "Good Standing" }).eq("id", client.id); }
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-emerald-900">Add payment</p>
        <button onClick={onCancel} className="text-xs text-emerald-700 hover:text-emerald-900">Cancel</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-emerald-800 mb-1">ACH date</label>
          <input type="date" className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-400 transition-colors" value={achDate} onChange={(e) => setAchDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-emerald-800 mb-1">Amount ($)</label>
          <input type="number" placeholder={client.payment ? String(client.payment) : "0.00"} className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-emerald-400 transition-colors" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} />
        </div>
        <div>
          <label className="block text-xs font-medium text-emerald-800 mb-1">Settles on</label>
          <div className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-gray-600">
            {settlementStr ? <span>{formatDate(settlementStr)}<span className={`ml-1.5 text-xs ${alreadySettled ? "text-emerald-600" : "text-blue-500"}`}>{alreadySettled ? "· settled" : "· pending"}</span></span> : "—"}
          </div>
        </div>
      </div>
      {amount && Number(amount) > 0 && (
        <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2 mb-3 text-xs text-gray-600">
          {alreadySettled
            ? <>Payment of <span className="font-medium text-gray-900">{money(Number(amount))}</span> — balance will update from <span className="font-medium">{money(Number(client.balance || 0))}</span> to <span className="font-medium text-emerald-700">{money(Math.max(Number(client.balance || 0) - Number(amount), 0))}</span></>
            : <>Payment of <span className="font-medium text-gray-900">{money(Number(amount))}</span> — will show as <span className="font-medium text-blue-600">Pending settlement</span> until {formatDate(settlementStr)}. Balance updates on settlement.</>}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button onClick={handleSave} disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save payment"}
      </button>
    </div>
  );
}

function EditPaymentRow({ payment, client, onSuccess, onCancel }: { payment: any; client: any; onSuccess: () => void; onCancel: () => void; }) {
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
    if (!achDate || !amount || isNaN(Number(amount)) || Number(amount) <= 0) { setError("Please enter a valid date and amount."); return; }
    setSaving(true);
    setError("");
    const debit = Number(amount);
    const oldDebit = Number(payment.debit || 0);
    const currentBalance = Number(client.balance || 0);
    let newBalance = currentBalance;
    if (payment.running_balance != null) newBalance = currentBalance + oldDebit;
    if (alreadySettled) newBalance = Math.max(newBalance - debit, 0);
    const { error: updateError } = await supabase.from("payments").update({ ach_date: achDate, payment_date: achDate, settlement_date: settlementStr, debit, running_balance: alreadySettled ? newBalance : null }).eq("id", payment.id);
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    if (alreadySettled || payment.running_balance != null) { await supabase.from("clients").update({ balance: newBalance }).eq("id", client.id); }
    setSaving(false);
    onSuccess();
  }

  return (
    <tr className="border-b border-blue-50 bg-blue-50">
      <td className="px-4 md:px-5 py-2" colSpan={7}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-medium text-blue-700 mb-1">ACH date</label>
            <input type="date" className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none" value={achDate} onChange={(e) => setAchDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-blue-700 mb-1">Amount ($)</label>
            <input type="number" className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs text-gray-900 w-28 focus:outline-none" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-blue-700 mb-1">Settlement</label>
            <div className="text-xs text-gray-500 py-1.5">{settlementStr ? `${formatDate(settlementStr)} (${alreadySettled ? "settled" : "pending"})` : "—"}</div>
          </div>
          {error && <p className="text-xs text-red-600 self-center">{error}</p>}
          <div className="flex gap-2 self-end pb-0.5">
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">{saving ? "Saving..." : "Save"}</button>
            <button onClick={onCancel} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function PaymentHistory({ payments, client, isAdminView, onPaymentAdded }: PaymentHistoryProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const hasPending = payments.some((p) => {
    if (!p.settlement_date) return false;
    const s = new Date(p.settlement_date);
    const today = new Date(); today.setHours(0,0,0,0);
    const desc = (p.description || "").toLowerCase();
    return s > today && !desc.includes("missed");
  });

  function handleSuccess() { setShowAddForm(false); setEditingId(null); onPaymentAdded?.(); }

  async function handleDelete(payment: any) {
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

  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">

      {/* Header row — sticky via page scroll (not table scroll) */}
      <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Payment history</h3>
          <p className="text-xs text-gray-400 mt-0.5">{payments.length} transaction{payments.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasPending && (
            <span className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              Some payments pending settlement
            </span>
          )}
          {/* Add payment — admin only */}
          {isAdminView && client && (
            <button
              onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                showAddForm ? "bg-gray-100 text-gray-600" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {showAddForm ? "Cancel" : "Add payment"}
            </button>
          )}
        </div>
      </div>

      {/* Add payment form */}
      {showAddForm && isAdminView && client && (
        <div className="px-4 md:px-5 pt-4">
          <AddPaymentForm client={client} onSuccess={handleSuccess} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      {/* Pending explanation */}
      {hasPending && (
        <div className="px-4 md:px-5 py-3 border-b border-gray-50">
          <p className="text-xs text-blue-600">
            Payments clear ACH Works immediately but take <span className="font-semibold">4 business days</span> to settle and apply to your balance. Pending payments are shown but do not yet affect your balance.
          </p>
        </div>
      )}

      {/* Table with its OWN scroll container so sticky thead works */}
      <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 bg-white sticky top-0 z-10">
              <th className="px-4 md:px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">ACH date</th>
              <th className="px-4 md:px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Settles</th>
              <th className="px-4 md:px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
              <th className="px-4 md:px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Credit</th>
              <th className="px-4 md:px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Debit</th>
              <th className="px-4 md:px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Returns</th>
              <th className="px-4 md:px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Balance</th>
              {isAdminView && <th className="px-4 md:px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedPayments.map((p, idx) => {
              const today = new Date(); today.setHours(0,0,0,0);
              const settlDate = p.settlement_date ? new Date(p.settlement_date) : null;
              if (settlDate) settlDate.setHours(0,0,0,0);
              const isPending = settlDate && settlDate > today && !(p.description || "").toLowerCase().includes("missed");
              const isEditing = editingId === p.id;
              const isDeleting = deletingId === p.id;

              return (
                <>
                  <tr key={p.id || idx} className={`border-b border-gray-50 transition-colors ${isEditing ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <td className="px-4 md:px-5 py-3 text-sm text-gray-700">{formatDate(p.ach_date || p.payment_date)}</td>
                    <td className="px-4 md:px-5 py-3 text-sm">
                      {isPending
                        ? <span className="text-blue-500 font-medium">{formatDate(p.settlement_date)}</span>
                        : <span className="text-gray-400">{p.settlement_date ? formatDate(p.settlement_date) : "—"}</span>}
                    </td>
                    <td className="px-4 md:px-5 py-3">
                      {isPending
                        ? <span className="inline-block rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-600">Pending settlement</span>
                        : <TypeBadge description={p.description} />}
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right text-sm">
                      {p.credit > 0 ? <span className="font-medium text-gray-900">{money(Number(p.credit))}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right text-sm">
                      {p.debit > 0 ? <span className={`font-medium ${isPending ? "text-blue-600" : "text-gray-900"}`}>{money(Number(p.debit))}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right text-sm">
                      {p.returns > 0 ? <span className="font-medium text-red-600">{money(Number(p.returns))}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right text-sm">
                      {isPending
                        ? <span className="text-gray-400 italic text-xs">pending</span>
                        : p.running_balance != null
                          ? <span className="font-medium text-gray-900">{money(Number(p.running_balance))}</span>
                          : <span className="text-gray-300">—</span>}
                    </td>
                    {isAdminView && (
                      <td className="px-4 md:px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => { setEditingId(isEditing ? null : p.id); setShowAddForm(false); }}
                            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${isEditing ? "bg-blue-100 text-blue-700" : "border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                            {isEditing ? "Cancel" : "Edit"}
                          </button>
                          <button onClick={() => handleDelete(p)} disabled={isDeleting}
                            className="rounded px-2 py-1 text-[10px] font-medium border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                            {isDeleting ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isEditing && client && (
                    <EditPaymentRow key={`edit-${p.id}`} payment={p} client={client} onSuccess={handleSuccess} onCancel={() => setEditingId(null)} />
                  )}
                </>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={isAdminView ? 8 : 7} className="px-5 py-8 text-center text-sm text-gray-400">No payment history yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}