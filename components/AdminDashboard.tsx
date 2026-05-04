"use client";

import { useState } from "react";
import { CONTACT, PORTAL } from "@/lib/config";

type AdminDashboardProps = {
  clients: any[];
  payments: any[];
  openClient: (client: any) => void;
  handlePaymentUpload: (e: any) => void;
  deleteClient: (client: any) => void;
  updateClient: (client: any) => void;
  uploading?: boolean;
};

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Derives last payment date from the payments array directly —
// fixes the broken last_payment_date column that doesn't exist on clients table
function getLastPaymentDate(clientInvoice: string, allPayments: any[]): Date | null {
  const clientPayments = allPayments.filter((p) => {
    if (p.invoice?.trim().toLowerCase() !== clientInvoice?.trim().toLowerCase()) return false;
    const desc = (p.description || "").toLowerCase();
    return !desc.includes("missed") && !desc.includes("return") && !desc.includes("initial");
  });
  if (clientPayments.length === 0) return null;
  const sorted = [...clientPayments].sort((a, b) => {
    const da = new Date(a.settlement_date || a.ach_date || a.payment_date).getTime();
    const db = new Date(b.settlement_date || b.ach_date || b.payment_date).getTime();
    return db - da;
  });
  const latest = sorted[0];
  const dateStr = latest.settlement_date || latest.ach_date || latest.payment_date;
  return dateStr ? new Date(dateStr) : null;
}

function businessDaysSinceDate(date: Date | null): string {
  if (!date) return "No payments recorded";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (d >= today) return "Paid today";
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function isUrgent(date: Date | null): boolean {
  if (!date) return true;
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 7;
}

function StatusBadge({ status }: { status: string }) {
  const isGood = status === "Good Standing";
  const isDefault = status === "Default";
  const styles = isGood
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : isDefault
    ? "bg-red-50 text-red-700 border border-red-200"
    : "bg-amber-50 text-amber-700 border border-amber-200";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function buildGeneralEmail(client: any): string {
  const to = client.client_email || "";
  const subject = encodeURIComponent(`Your MCA Account — Action Required`);
  const body = encodeURIComponent(
    `Hello ${client.owner_name || client.business_name},\n\n` +
    `Your account (${client.invoice}) is not in good standing. ` +
    `Please contact me directly or log in to your portal for instructions:\n\n` +
    `${PORTAL.url}\n\n` +
    `Best regards,\n${CONTACT.name}\n${CONTACT.email}\n${CONTACT.phone}`
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

const EDIT_FIELDS: [string, string, string][] = [
  ["business_name", "Business name", "text"],
  ["invoice", "Invoice #", "text"],
  ["owner_name", "Owner name", "text"],
  ["client_email", "Client email", "text"],
  ["funded_date", "Funded date", "date"],
  ["funded", "Funded amount", "text"],
  ["payback", "Payback amount", "text"],
  ["balance", "Current balance", "text"],
  ["payment", "Payment amount", "text"],
  ["total_term", "Total term (business days)", "text"],
  ["status", "Status", "text"],
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export default function AdminDashboard({
  clients, payments, openClient, handlePaymentUpload,
  deleteClient, updateClient, uploading = false,
}: AdminDashboardProps) {
  const [editingClient, setEditingClient] = useState<any>(null);
  const [filterAttention, setFilterAttention] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const totalBalance = clients.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  const attentionClients = clients.filter((c) => c.status !== "Good Standing");
  const goodClients = clients.filter((c) => c.status === "Good Standing");
  const dailyClients = clients.filter((c) => c.payment_frequency === "daily").length;
  const weeklyClients = clients.filter((c) => c.payment_frequency === "weekly").length;

  const baseClients = filterAttention ? attentionClients : clients;
  const displayedClients = searchQuery.trim()
    ? baseClients.filter((c) => {
        const q = searchQuery.toLowerCase();
        return (
          c.business_name?.toLowerCase().includes(q) ||
          c.invoice?.toLowerCase().includes(q) ||
          c.owner_name?.toLowerCase().includes(q)
        );
      })
    : baseClients;

  return (
    <div className="space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-gray-100 p-5 cursor-pointer hover:border-gray-200 transition-colors"
          onClick={() => { setFilterAttention(false); setSearchQuery(""); }}>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total clients</p>
          <p className="text-2xl font-semibold text-gray-900">{clients.length}</p>
          <p className="text-xs text-gray-400 mt-1">{dailyClients} daily · {weeklyClients} weekly</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Open balance</p>
          <p className="text-2xl font-semibold text-gray-900">{money(totalBalance)}</p>
          <p className="text-xs text-gray-400 mt-1">Across all clients</p>
        </div>
        <div
          className={`rounded-xl border p-5 cursor-pointer transition-colors ${
            filterAttention ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100 hover:border-amber-200"
          }`}
          onClick={() => { setFilterAttention(true); setSearchQuery(""); }}
        >
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Needs attention</p>
          <p className={`text-2xl font-semibold ${attentionClients.length > 0 ? "text-amber-600" : "text-gray-900"}`}>
            {attentionClients.length}
          </p>
          <p className="text-xs text-amber-600 mt-1 font-medium">
            {attentionClients.length > 0 ? "Click to review →" : "All accounts current"}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5 cursor-pointer hover:border-gray-200 transition-colors"
          onClick={() => { setFilterAttention(false); setSearchQuery(""); }}>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Good standing</p>
          <p className="text-2xl font-semibold text-emerald-600">{goodClients.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            {clients.length > 0 ? `${Math.round((goodClients.length / clients.length) * 100)}% of portfolio` : "—"}
          </p>
        </div>
      </div>

      {/* Upload banner */}
      <div className="rounded-xl bg-white border border-gray-100 p-5 flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${uploading ? "bg-blue-50" : "bg-emerald-50"}`}>
          {uploading ? (
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="#3b82f6" strokeWidth="2" strokeDasharray="22" strokeDashoffset="8"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2v10M5 6l4-4 4 4M2 14h14" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            {uploading ? "Processing payments..." : "Upload daily payments report"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {uploading
              ? "Matching invoices and updating balances — please wait."
              : "Upload your ACH Works .xls file. Payments matched by invoice number automatically."}
          </p>
        </div>
        <label className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors flex-shrink-0 ${
          uploading
            ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
        }`}>
          {uploading ? "Uploading..." : "Choose file"}
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={handlePaymentUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Edit panel */}
      {editingClient && (
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Editing — {editingClient.business_name}</h3>
            <button onClick={() => setEditingClient(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {EDIT_FIELDS.map(([field, label, type]) => (
              <div key={field}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input type={type}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                  value={editingClient[field] || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, [field]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment frequency</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 bg-white"
                value={editingClient.payment_frequency || "daily"}
                onChange={(e) => setEditingClient({ ...editingClient, payment_frequency: e.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {editingClient.payment_frequency === "weekly" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Weekly payment day</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 bg-white"
                  value={editingClient.payment_day || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, payment_day: e.target.value })}>
                  <option value="">Select a day</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { updateClient(editingClient); setEditingClient(null); }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
              Save changes
            </button>
            <button onClick={() => setEditingClient(null)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Attention panel */}
      {filterAttention && attentionClients.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                {attentionClients.length} {attentionClients.length === 1 ? "account" : "accounts"} need attention
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">These clients have missed payments or returned transactions.</p>
            </div>
            <button onClick={() => setFilterAttention(false)} className="text-xs text-amber-600 hover:text-amber-800 font-medium">
              ← Show all clients
            </button>
          </div>
          <div className="space-y-3">
            {attentionClients.map((client) => {
              const lastDate = getLastPaymentDate(client.invoice, payments);
              const urgent = isUrgent(lastDate);
              return (
                <div key={client.id} className="rounded-lg bg-white border border-amber-100 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 ${urgent ? "bg-red-100" : "bg-amber-100"}`}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 6v4M9 12v.5" stroke={urgent ? "#dc2626" : "#92400e"} strokeWidth="1.8" strokeLinecap="round"/>
                        <circle cx="9" cy="9" r="7.5" stroke={urgent ? "#dc2626" : "#92400e"} strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openClient(client)}>
                      <p className="text-sm font-semibold text-gray-900">{client.business_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {client.invoice} · {client.payment_frequency === "weekly"
                          ? `Weekly${client.payment_day ? ` (${client.payment_day.charAt(0).toUpperCase() + client.payment_day.slice(1)}s)` : ""}`
                          : "Daily"} · {money(Number(client.payment))} per payment
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${urgent ? "text-red-600" : "text-amber-600"}`}>
                        {businessDaysSinceDate(lastDate)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Last payment</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{money(Number(client.balance || 0))}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Balance</p>
                    </div>
                    <StatusBadge status={client.status} />
                    {client.client_email && (
                      <a href={buildGeneralEmail(client)} onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1 3l5 3.5L11 3M1 3h10v7H1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Email
                      </a>
                    )}
                    <div className="text-xs text-gray-400 cursor-pointer" onClick={() => openClient(client)}>View →</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Client roster */}
      <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 flex-shrink-0">
            {filterAttention ? `Needs attention (${displayedClients.length})` : "Client roster"}
            {searchQuery && ` — ${displayedClients.length} result${displayedClients.length !== 1 ? "s" : ""}`}
          </h3>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search name or invoice..."
                className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors w-48 text-gray-700 placeholder:text-gray-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  ×
                </button>
              )}
            </div>
            {filterAttention && (
              <button onClick={() => setFilterAttention(false)} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Show all →</button>
            )}
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Business</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Invoice</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Balance</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Schedule</th>
              {filterAttention && (
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Last payment</th>
              )}
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedClients.map((client) => {
              const lastDate = getLastPaymentDate(client.invoice, payments);
              const scheduleLabel = client.payment_frequency === "weekly"
                ? `Weekly${client.payment_day ? ` · ${client.payment_day.charAt(0).toUpperCase() + client.payment_day.slice(1)}s` : ""}`
                : "Daily";
              return (
                <tr key={client.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openClient(client)}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{client.business_name}</p>
                    <p className="text-xs text-gray-400">{client.owner_name}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{client.invoice}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{money(Number(client.balance || 0))}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{scheduleLabel}</td>
                  {filterAttention && (
                    <td className="px-5 py-3.5 text-sm font-medium text-amber-600">
                      {businessDaysSinceDate(lastDate)}
                    </td>
                  )}
                  <td className="px-5 py-3.5"><StatusBadge status={client.status} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingClient({ ...client })}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => deleteClient(client)}
                        className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {displayedClients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                  {searchQuery ? `No clients matching "${searchQuery}"` : filterAttention ? "No clients need attention right now." : "No clients yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}