"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/holidays";
import type { Position, Client } from "@/lib/types";

type PositionsPanelProps = {
  client: Client;
  isAdminView?: boolean;
  onPositionAdded?: () => void;
};

export default function PositionsPanel({ client, isAdminView, onPositionAdded }: PositionsPanelProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newInvoice, setNewInvoice] = useState("");
  const [newPayback, setNewPayback] = useState("");
  const [newFundedDate, setNewFundedDate] = useState("");

  async function loadPositions() {
    setLoading(true);
    const { data } = await supabase
      .from("positions")
      .select("*")
      .eq("client_id", client.id)
      .order("position_order", { ascending: true });
    setPositions((data || []) as Position[]);
    setLoading(false);
  }

  useEffect(() => { loadPositions(); }, [client.id]);

  async function handleAddPosition() {
    if (!newInvoice.trim() || !newPayback) return;
    setAdding(true);

    const nextOrder = positions.length + 1;

    const { error } = await supabase.from("positions").insert({
      client_id: client.id,
      invoice: newInvoice.trim().toUpperCase(),
      payback: Number(newPayback),
      balance: Number(newPayback),
      funded_date: newFundedDate || null,
      position_order: nextOrder,
      status: nextOrder === 1 ? "active" : "active",
    });

    if (error) { alert(error.message); setAdding(false); return; }

    setNewInvoice("");
    setNewPayback("");
    setNewFundedDate("");
    setShowAdd(false);
    setAdding(false);
    await loadPositions();
    onPositionAdded?.();
  }

  async function markCompleted(pos: Position) {
    await supabase.from("positions").update({ status: "completed", balance: 0 }).eq("id", pos.id);
    await loadPositions();
  }

  if (loading) return null;
  if (positions.length === 0 && !isAdminView) return null;

  // Combined totals
  const totalPayback = positions.reduce((sum, p) => sum + Number(p.payback), 0);
  const totalBalance = positions.reduce((sum, p) => sum + Number(p.balance), 0);
  const totalPaid = totalPayback - totalBalance;
  const combinedPct = totalPayback > 0 ? Math.round((totalPaid / totalPayback) * 100) : 0;

  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Invoice positions</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {positions.length} position{positions.length !== 1 ? "s" : ""} · {money(totalBalance)} combined balance · {combinedPct}% paid overall
          </p>
        </div>
        {isAdminView && (
          <button
            onClick={() => setShowAdd(v => !v)}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
            + Add position
          </button>
        )}
      </div>

      {/* Add position form */}
      {showAdd && isAdminView && (
        <div className="px-5 py-4 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs font-semibold text-indigo-800 mb-3">New invoice position</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-indigo-700 mb-1">Invoice #</label>
              <input
                type="text"
                placeholder="INV100133"
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 uppercase placeholder:normal-case placeholder:text-gray-300"
                value={newInvoice}
                onChange={e => setNewInvoice(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-xs text-indigo-700 mb-1">Payback amount ($)</label>
              <input
                type="number"
                placeholder="11272"
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400"
                value={newPayback}
                onChange={e => setNewPayback(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-indigo-700 mb-1">Funded date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400"
                value={newFundedDate}
                onChange={e => setNewFundedDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAddPosition}
              disabled={adding || !newInvoice.trim() || !newPayback}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-40">
              {adding ? "Adding..." : `Add as position ${positions.length + 1}`}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewInvoice(""); setNewPayback(""); setNewFundedDate(""); }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Positions list */}
      <div className="divide-y divide-gray-50">
        {positions.map((pos, idx) => {
          const paid = Number(pos.payback) - Number(pos.balance);
          const pct = Number(pos.payback) > 0 ? Math.round((paid / Number(pos.payback)) * 100) : 0;
          const isCompleted = pos.status === "completed" || Number(pos.balance) === 0;
          const isCurrent = !isCompleted && (idx === 0 || positions[idx - 1]?.status === "completed");

          return (
            <div key={pos.id} className={`px-5 py-4 ${isCompleted ? "bg-emerald-50/30" : isCurrent ? "bg-white" : "bg-gray-50/50"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {/* Position badge */}
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${
                    isCompleted ? "bg-emerald-100 text-emerald-700" :
                    isCurrent ? "bg-indigo-100 text-indigo-700" :
                    "bg-gray-100 text-gray-400"
                  }`}>
                    {pos.position_order}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{pos.invoice}</p>
                      {isCompleted && (
                        <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Paid in full
                        </span>
                      )}
                      {isCurrent && !isCompleted && (
                        <span className="rounded-full bg-indigo-100 border border-indigo-200 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                          Active
                        </span>
                      )}
                      {!isCurrent && !isCompleted && (
                        <span className="rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                          Queued
                        </span>
                      )}
                    </div>
                    {pos.funded_date && (
                      <p className="text-xs text-gray-400 mt-0.5">Funded {formatDate(pos.funded_date)}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-wrap">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Payback</p>
                    <p className="text-sm font-medium text-gray-700">{money(Number(pos.payback))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Paid</p>
                    <p className="text-sm font-medium text-emerald-600">{money(paid)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Balance</p>
                    <p className={`text-sm font-semibold ${isCompleted ? "text-emerald-600" : "text-gray-900"}`}>
                      {isCompleted ? "$0.00" : money(Number(pos.balance))}
                    </p>
                  </div>
                  {isAdminView && !isCompleted && Number(pos.balance) === 0 && (
                    <button
                      onClick={() => markCompleted(pos)}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                      Mark complete
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-gray-400">{pct}% paid</p>
                  <p className="text-[10px] text-gray-400">{money(paid)} of {money(Number(pos.payback))}</p>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${isCompleted ? "bg-emerald-500" : "bg-indigo-500"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {positions.length === 0 && isAdminView && (
          <div className="px-5 py-6 text-center text-xs text-gray-400">
            No positions yet. Click + Add position to add the first invoice.
          </div>
        )}
      </div>

      {/* Combined summary footer */}
      {positions.length > 1 && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">Combined total</p>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Total payback</p>
                <p className="text-xs font-semibold text-gray-700">{money(totalPayback)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Total paid</p>
                <p className="text-xs font-semibold text-emerald-600">{money(totalPaid)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Remaining</p>
                <p className="text-xs font-semibold text-gray-900">{money(totalBalance)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}