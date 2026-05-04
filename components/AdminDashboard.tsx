"use client";

import { useState } from "react";
import { CONTACT, PORTAL } from "@/lib/config";
import MonthlyRiskPanel from "@/components/MonthlyRiskPanel";
import type { Client, Payment } from "@/lib/types";

type AdminDashboardProps = {
  clients: Client[];
  payments: Payment[];
  openClient: (client: Client) => void;
  handlePaymentUpload: (e: any) => void;
  deleteClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  uploading?: boolean;
  currentPage: number;
  totalPages: number;
  totalClients: number;
  onPageChange: (page: number) => void;
  searchInput: string;
  onSearchChange: (val: string) => void;
  filterAttention: boolean;
  onFilterAttention: (val: boolean) => void;
  orgId: string;
};

const PAYMENT_STATUS_OPTIONS = [
  { value: "active",     label: "Active",           description: "Normal — expected in every upload" },
  { value: "paused",     label: "On Pause",         description: "Agreed break — set start and end dates below" },
  { value: "frozen",     label: "Frozen",           description: "Account blocked — flag immediately" },
  { value: "paid_off",   label: "Paid Off",         description: "Balance zero — exclude from tracking" },
  { value: "weekly_off", label: "Weekly — Off Day", description: "Weekly client, today is not their day" },
];

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function getLastPaymentDate(clientInvoice: string, allPayments: Payment[]): Date | null {
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

function getPauseLabel(client: Client): string | null {
  if (client.payment_status !== "paused") return null;
  if (!client.pause_end) return "On Pause";
  const end = new Date(client.pause_end + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "Pause expired";
  if (daysLeft === 0) return "Pause ends today";
  if (daysLeft === 1) return "Pause ends tomorrow";
  return `Pause ends in ${daysLeft} days`;
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

function PaymentStatusBadge({ client }: { client: Client }) {
  const status = client.payment_status || "active";
  const map: Record<string, { label: string; styles: string }> = {
    active:     { label: "Active",       styles: "bg-gray-50 text-gray-600 border border-gray-200" },
    paused:     { label: getPauseLabel(client) || "On Pause", styles: "bg-blue-50 text-blue-700 border border-blue-200" },
    frozen:     { label: "Frozen",       styles: "bg-red-50 text-red-700 border border-red-200" },
    paid_off:   { label: "Paid Off",     styles: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    weekly_off: { label: "Weekly — Off", styles: "bg-purple-50 text-purple-700 border border-purple-200" },
  };
  const config = map[status] || map.active;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${config.styles}`}>
      {config.label}
    </span>
  );
}

function buildGeneralEmail(client: Client): string {
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
  ["status", "Account standing", "text"],
  ["fico_score", "FICO / Credit score", "text"],
  ["avg_monthly_revenue", "Avg monthly revenue ($)", "text"],
  ["time_in_business_months", "Time in business (months)", "text"],
  ["sic_code", "SIC code", "text"],
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export default function AdminDashboard({
  clients, payments, openClient, handlePaymentUpload,
  deleteClient, updateClient, uploading = false,
  currentPage, totalPages, totalClients, onPageChange,
  searchInput, onSearchChange,
  filterAttention, onFilterAttention, orgId,
}: AdminDashboardProps) {
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const totalBalance = clients.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  const attentionClients = clients.filter((c) => c.status !== "Good Standing");
  const goodClients = clients.filter((c) => c.status === "Good Standing");
  const pausedClients = clients.filter((c) => c.payment_status === "paused").length;
  const frozenClients = clients.filter((c) => c.payment_status === "frozen").length;
  const dailyClients = clients.filter((c) => c.payment_frequency === "daily").length;
  const weeklyClients = clients.filter((c) => c.payment_frequency === "weekly").length;

  const isPaused = editingClient?.payment_status === "paused";

  return (
    <div className="space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-gray-100 p-5 cursor-pointer hover:border-gray-200 transition-colors"
          onClick={() => { onFilterAttention(false); onSearchChange(""); }}>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total clients</p>
          <p className="text-2xl font-semibold text-gray-900">{totalClients}</p>
          <p className="text-xs text-gray-400 mt-1">
            {dailyClients} daily · {weeklyClients} weekly
            {pausedClients > 0 && ` · ${pausedClients} paused`}
            {frozenClients > 0 && ` · ${frozenClients} frozen`}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Open balance</p>
          <p className="text-2xl font-semibold text-gray-900">{money(totalBalance)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {totalPages > 1 ? `Page ${currentPage} of ${totalPages}` : "Across all clients"}
          </p>
        </div>
        <div
          className={`rounded-xl border p-5 cursor-pointer transition-colors ${
            filterAttention ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100 hover:border-amber-200"
          }`}
          onClick={() => onFilterAttention(!filterAttention)}>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Needs attention</p>
          <p className={`text-2xl font-semibold ${attentionClients.length > 0 ? "text-amber-600" : "text-gray-900"}`}>
            {attentionClients.length}
          </p>
          <p className="text-xs text-amber-600 mt-1 font-medium">
            {filterAttention ? "← Show all" : attentionClients.length > 0 ? "Click to filter →" : "All accounts current"}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-5 cursor-pointer hover:border-gray-200 transition-colors"
          onClick={() => { onFilterAttention(false); onSearchChange(""); }}>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Good standing</p>
          <p className="text-2xl font-semibold text-emerald-600">{goodClients.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            {clients.length > 0 ? `${Math.round((goodClients.length / clients.length) * 100)}% this page` : "—"}
          </p>
        </div>
      </div>

      {/* Monthly Risk Panel */}
      <MonthlyRiskPanel clients={clients} orgId={orgId} />

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
          <input type="file" accept=".csv,.xls,.xlsx" onChange={handlePaymentUpload} disabled={uploading} className="hidden" />
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
                  value={(editingClient as any)[field] || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, [field]: e.target.value } as Client)} />
              </div>
            ))}

            {/* Payment frequency */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment frequency</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 bg-white"
                value={editingClient.payment_frequency || "daily"}
                onChange={(e) => setEditingClient({ ...editingClient, payment_frequency: e.target.value as "daily" | "weekly" })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {/* Business profile */}
<div className="col-span-2 md:col-span-3 pt-2 border-t border-gray-100 mt-1">
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Business profile</p>
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    <div>
      <label className="block text-xs text-gray-400 mb-1">State</label>
      <select
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 bg-white"
        value={(editingClient as any).state || ""}
        onChange={(e) => setEditingClient({ ...editingClient, state: e.target.value } as Client)}>
        <option value="">Select state</option>
        {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"].map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
    <div>
      <label className="block text-xs text-gray-400 mb-1">Business type</label>
      <select
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 bg-white"
        value={(editingClient as any).business_type || ""}
        onChange={(e) => setEditingClient({ ...editingClient, business_type: e.target.value } as any)}>
        <option value="">Select type</option>
        <option value="llc">LLC</option>
        <option value="sole_prop">Sole Proprietorship</option>
        <option value="corp">Corporation</option>
        <option value="partnership">Partnership</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div>
      <label className="block text-xs text-gray-400 mb-1">Position</label>
      <select
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 bg-white"
        value={(editingClient as any).position || ""}
        onChange={(e) => setEditingClient({ ...editingClient, position: Number(e.target.value) } as any)}>
        <option value="">Select position</option>
        <option value="1">1st position</option>
        <option value="2">2nd position</option>
        <option value="3">3rd position</option>
        <option value="4">4th+ position</option>
      </select>
    </div>
  </div>
</div>

            {/* Weekly payment day */}
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

            {/* Payment status */}
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-gray-400 mb-2">Payment status</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PAYMENT_STATUS_OPTIONS.map((opt) => {
                  const current = editingClient.payment_status || "active";
                  const isSelected = current === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditingClient({
                        ...editingClient,
                        payment_status: opt.value as any,
                        // Clear pause dates if switching away from paused
                        pause_start: opt.value === "paused" ? editingClient.pause_start : null,
                        pause_end: opt.value === "paused" ? editingClient.pause_end : null,
                      })}
                      className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        isSelected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                      }`}>
                      <p className={`text-xs font-semibold ${isSelected ? "text-white" : "text-gray-900"}`}>{opt.label}</p>
                      <p className={`text-[10px] mt-0.5 ${isSelected ? "text-gray-300" : "text-gray-400"}`}>{opt.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pause dates — only shown when On Pause is selected */}
            {isPaused && (
              <div className="col-span-2 md:col-span-3">
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                  <p className="text-xs font-semibold text-blue-900 mb-3">
                    Pause schedule
                    <span className="ml-2 text-[10px] font-normal text-blue-500">
                      Payments will automatically resume after the end date
                    </span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-blue-800 mb-1">Pause start date</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                        value={editingClient.pause_start || ""}
                        onChange={(e) => setEditingClient({ ...editingClient, pause_start: e.target.value || null })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-800 mb-1">Pause end date</label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                        value={editingClient.pause_end || ""}
                        onChange={(e) => setEditingClient({ ...editingClient, pause_end: e.target.value || null })}
                      />
                      {editingClient.pause_end && (() => {
                        const end = new Date(editingClient.pause_end + "T00:00:00");
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysLeft < 0) return <p className="text-[10px] text-red-500 mt-1">End date is in the past — client will resume immediately on next upload</p>;
                        if (daysLeft === 0) return <p className="text-[10px] text-amber-600 mt-1">Ends today — client resumes on next upload</p>;
                        return <p className="text-[10px] text-blue-500 mt-1">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining — resumes automatically after this date</p>;
                      })()}
                    </div>
                  </div>
                </div>
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
            <button onClick={() => onFilterAttention(false)} className="text-xs text-amber-600 hover:text-amber-800 font-medium">
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
                    {client.payment_status !== "active" && <PaymentStatusBadge client={client} />}
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
            {filterAttention ? "Needs attention" : "Client roster"}
            <span className="ml-2 text-xs font-normal text-gray-400">{totalClients} total</span>
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
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {searchInput && (
                <button onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
              )}
            </div>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Business</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Invoice</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Balance</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Schedule</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Payment status</th>
              {filterAttention && (
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Last payment</th>
              )}
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Standing</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const lastDate = getLastPaymentDate(client.invoice, payments);
              const paymentStatus = client.payment_status || "active";
              const scheduleLabel = client.payment_frequency === "weekly"
                ? `Weekly${client.payment_day ? ` · ${client.payment_day.charAt(0).toUpperCase() + client.payment_day.slice(1)}s` : ""}`
                : "Daily";
              const rowBg = paymentStatus === "paused"
                ? "bg-blue-50/30"
                : paymentStatus === "frozen"
                ? "bg-red-50/30"
                : paymentStatus === "paid_off"
                ? "bg-emerald-50/20"
                : "";
              return (
                <tr key={client.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${rowBg}`}
                  onClick={() => openClient(client)}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{client.business_name}</p>
                    <p className="text-xs text-gray-400">{client.owner_name}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{client.invoice}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{money(Number(client.balance || 0))}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{scheduleLabel}</td>
                  <td className="px-5 py-3.5">
                    <PaymentStatusBadge client={client} />
                  </td>
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
            {clients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  {searchInput ? `No clients matching "${searchInput}"` : filterAttention ? "No clients need attention right now." : "No clients yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Page {currentPage} of {totalPages} · {totalClients} clients total
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => onPageChange(1)} disabled={currentPage === 1}
                className="rounded px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">«</button>
              <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
                className="rounded px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-300">…</span>
                  ) : (
                    <button key={p} onClick={() => onPageChange(p as number)}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                        currentPage === p ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                      }`}>{p}</button>
                  )
                )}
              <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
                className="rounded px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
              <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}
                className="rounded px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}