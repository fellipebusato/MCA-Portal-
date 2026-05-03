"use client";

import PaymentHistory from "./PaymentHistory";

type ClientDashboardProps = {
  selectedClient: any;
  payments: any[];
};

const PAYMENT_LINK =
  "https://zohosecurepay.com/checkout/iuh0ui5-xp013mz2w5xz9/CFG-Merchant-Solutions-Payment-Portal";

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(date: string) {
  if (!date) return "—";
  const d = new Date(date);
  // Fix timezone offset so date doesn't shift by a day
  const utc = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export default function ClientDashboard({
  selectedClient,
  payments,
}: ClientDashboardProps) {
  const percentPaid =
    100 -
    (Number(selectedClient.balance || 0) / Number(selectedClient.payback || 1)) * 100;
  const safePercent = Math.max(0, Math.min(100, percentPaid));

  const isGoodStanding = selectedClient.status === "Good Standing";
  const paymentFrequency =
    selectedClient.payment_frequency === "weekly" ? "Weekly" : "Daily";

  const totalPaid = Number(selectedClient.payback || 0) - Number(selectedClient.balance || 0);

  return (
    <div className="space-y-5">

      {/* Header card */}
      <div className="rounded-xl bg-white border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Account</p>
            <h2 className="text-xl font-semibold text-gray-900">
              {selectedClient.business_name}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {selectedClient.invoice} · Funded {formatDate(selectedClient.funded_date)}
            </p>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400 mb-1">Need help?</p>
            <p className="text-sm font-medium text-gray-900">fbusato@cfgms.com</p>
            <p className="text-sm text-gray-500">+1 (917) 920-0881</p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Funded</p>
          <p className="text-xl font-semibold text-gray-900">
            {money(Number(selectedClient.funded || 0))}
          </p>
        </div>

        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payback</p>
          <p className="text-xl font-semibold text-gray-900">
            {money(Number(selectedClient.payback || 0))}
          </p>
        </div>

        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance</p>
          <p className="text-xl font-semibold text-gray-900">
            {money(Number(selectedClient.balance || 0))}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {money(totalPaid)} paid so far
          </p>
        </div>

        <div className="rounded-xl bg-white border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            {paymentFrequency} payment
          </p>
          <p className="text-xl font-semibold text-gray-900">
            {money(Number(selectedClient.payment || 0))}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl bg-white border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-900">Repayment progress</p>
          <p className="text-sm font-semibold text-gray-900">{Math.round(safePercent)}% paid</p>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-2.5 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${safePercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <p className="text-xs text-gray-400">{money(totalPaid)} paid</p>
          <p className="text-xs text-gray-400">{money(Number(selectedClient.balance || 0))} remaining</p>
        </div>
      </div>

      {/* Standing banner */}
      {isGoodStanding ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">Account in good standing</p>
            <p className="text-xs text-emerald-600 mt-0.5">Your payments are up to date. Keep it up.</p>
          </div>
        </div>
      ) : (
        <a
          href={PAYMENT_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl bg-red-50 border border-red-100 p-4 hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 5v4M8 11v.5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.2"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-red-800">Account needs attention — click to make a payment</p>
              <p className="text-xs text-red-600 mt-0.5">One or more payments require action. Click here to pay now.</p>
            </div>
            <svg className="ml-auto" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </a>
      )}

      {/* Payment history */}
      <PaymentHistory payments={payments} />
    </div>
  );
}