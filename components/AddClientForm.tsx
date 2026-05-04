"use client";

type AddClientFormProps = {
  newClient: any;
  setNewClient: (c: any) => void;
  addClient: () => void;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function calcTotalTerm(payback: string, payment: string, frequency: string): number {
  const p = parseFloat(payback);
  const d = parseFloat(payment);
  if (!p || !d || d === 0) return 0;
  const rawPayments = Math.ceil(p / d);
  // Weekly: 1 payment = 5 business days
  return frequency === "weekly" ? rawPayments * 5 : rawPayments;
}

export default function AddClientForm({
  newClient,
  setNewClient,
  addClient,
}: AddClientFormProps) {
  const isWeekly = newClient.paymentFrequency === "weekly";
  const totalTerm = calcTotalTerm(newClient.payback, newClient.payment, newClient.paymentFrequency);
  const rawPayments = newClient.payback && newClient.payment
    ? Math.ceil(parseFloat(newClient.payback) / parseFloat(newClient.payment))
    : 0;

  function handleChange(field: string, value: string) {
    setNewClient({ ...newClient, [field]: value });
  }

  function handleFrequencyChange(value: string) {
    setNewClient({ ...newClient, paymentFrequency: value, paymentDay: "" });
  }

  function handleSubmit() {
    // Inject calculated total term before saving
    setNewClient((prev: any) => ({ ...prev, totalTerm: String(totalTerm) }));
    setTimeout(() => addClient(), 0);
  }

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-900">Add new client</h2>
        <p className="text-sm text-gray-400 mt-0.5">Fill in the details below to create a new MCA account.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Business name</label>
          <input type="text" placeholder="LOFTY LLC"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.businessName || ""} onChange={(e) => handleChange("businessName", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Invoice #</label>
          <input type="text" placeholder="INV96955"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.invoice || ""} onChange={(e) => handleChange("invoice", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Owner name</label>
          <input type="text" placeholder="John Smith"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.ownerName || ""} onChange={(e) => handleChange("ownerName", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Client email</label>
          <input type="email" placeholder="client@business.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.clientEmail || ""} onChange={(e) => handleChange("clientEmail", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Funded date</label>
          <input type="date"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.fundedDate || ""} onChange={(e) => handleChange("fundedDate", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Funded amount ($)</label>
          <input type="number" placeholder="25000"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.funded || ""} onChange={(e) => handleChange("funded", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Payback amount ($)</label>
          <input type="number" placeholder="31250"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.payback || ""} onChange={(e) => handleChange("payback", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment amount ($)</label>
          <input type="number" placeholder="1250"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
            value={newClient.payment || ""} onChange={(e) => handleChange("payment", e.target.value)} />
        </div>

        {/* Payment frequency */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment frequency</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
            value={newClient.paymentFrequency || "daily"}
            onChange={(e) => handleFrequencyChange(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Payment day — only for weekly */}
        {isWeekly && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Weekly payment day</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
              value={newClient.paymentDay || ""}
              onChange={(e) => handleChange("paymentDay", e.target.value)}>
              <option value="">Select a day</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Auto-calculated total term — read only */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Total term (auto-calculated)</label>
          <div className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
            {totalTerm > 0 ? (
              <span>
                <span className="font-semibold text-gray-900">{totalTerm} business days</span>
                <span className="text-gray-400 ml-1">
                  ({rawPayments} {isWeekly ? "weekly" : "daily"} payment{rawPayments !== 1 ? "s" : ""})
                </span>
              </span>
            ) : (
              <span className="text-gray-300">Enter payback ÷ payment amount</span>
            )}
          </div>
        </div>

      </div>

      {/* Quick summary */}
      {totalTerm > 0 && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-4 mb-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Quick summary</p>
          <p className="text-sm text-gray-700">
            <span className="font-medium">{newClient.businessName || "Client"}</span> will make{" "}
            <span className="font-medium">{rawPayments} {isWeekly ? "weekly" : "daily"} payment{rawPayments !== 1 ? "s" : ""}</span>{" "}
            of <span className="font-medium">{newClient.payment ? `$${parseFloat(newClient.payment).toLocaleString()}` : "—"}</span>
            {isWeekly && newClient.paymentDay
              ? ` every ${newClient.paymentDay.charAt(0).toUpperCase() + newClient.paymentDay.slice(1)}`
              : ""}{" "}
            on a <span className="font-medium">{newClient.payback ? `$${parseFloat(newClient.payback).toLocaleString()}` : "—"}</span> payback
            {" "}(funded <span className="font-medium">{newClient.funded ? `$${parseFloat(newClient.funded).toLocaleString()}` : "—"}</span>)
            {" "}over <span className="font-medium">{totalTerm} business days</span>.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isWeekly && !newClient.paymentDay || totalTerm === 0}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create client
        </button>
        {isWeekly && !newClient.paymentDay && (
          <p className="text-xs text-amber-600">Please select a weekly payment day</p>
        )}
        {totalTerm === 0 && (
          <p className="text-xs text-gray-400">Enter payback and payment amounts to calculate term</p>
        )}
      </div>
    </div>
  );
}