"use client";

type AddClientFormProps = {
  newClient: any;
  setNewClient: (c: any) => void;
  addClient: () => void;
};

const FIELDS: [string, string, string, string][] = [
  ["businessName", "Business name", "text", "LOFTY LLC"],
  ["invoice", "Invoice #", "text", "INV96955"],
  ["ownerName", "Owner name", "text", "John Smith"],
  ["clientEmail", "Client email", "email", "client@business.com"],
  ["fundedDate", "Funded date", "date", ""],
  ["funded", "Funded amount ($)", "number", "25000"],
  ["payback", "Payback amount ($)", "number", "31250"],
  ["payment", "Payment amount ($)", "number", "1250"],
  ["totalTerm", "Total term (business days)", "number", "75"],
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export default function AddClientForm({
  newClient,
  setNewClient,
  addClient,
}: AddClientFormProps) {
  const isWeekly = newClient.paymentFrequency === "weekly";

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-900">Add new client</h2>
        <p className="text-sm text-gray-400 mt-0.5">Fill in the details below to create a new MCA account.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {FIELDS.map(([field, label, type, placeholder]) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
            <input
              type={type}
              placeholder={placeholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient[field] || ""}
              onChange={(e) => setNewClient({ ...newClient, [field]: e.target.value })}
            />
          </div>
        ))}

        {/* Payment frequency */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment frequency</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
            value={newClient.paymentFrequency || "daily"}
            onChange={(e) => setNewClient({ ...newClient, paymentFrequency: e.target.value, paymentDay: "" })}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Payment day — only show for weekly */}
        {isWeekly && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Weekly payment day</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
              value={newClient.paymentDay || ""}
              onChange={(e) => setNewClient({ ...newClient, paymentDay: e.target.value })}
            >
              <option value="">Select a day</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick summary */}
      <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-4 mb-5">
        <p className="text-xs font-medium text-gray-500 mb-1">Quick summary</p>
        <p className="text-sm text-gray-700">
          {newClient.businessName || "Client"} will pay{" "}
          <span className="font-medium">${Number(newClient.payment || 0).toLocaleString()}</span>{" "}
          {newClient.paymentFrequency === "weekly"
            ? `every ${newClient.paymentDay ? newClient.paymentDay.charAt(0).toUpperCase() + newClient.paymentDay.slice(1) : "week"}`
            : "daily (business days)"}{" "}
          on a{" "}
          <span className="font-medium">${Number(newClient.payback || 0).toLocaleString()}</span>{" "}
          payback (funded{" "}
          <span className="font-medium">${Number(newClient.funded || 0).toLocaleString()}</span>
          ) over{" "}
          <span className="font-medium">{newClient.totalTerm || "—"} business days</span>.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={addClient}
          disabled={isWeekly && !newClient.paymentDay}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create client
        </button>
        {isWeekly && !newClient.paymentDay && (
          <p className="text-xs text-amber-600 self-center">Please select a weekly payment day</p>
        )}
      </div>
    </div>
  );
}