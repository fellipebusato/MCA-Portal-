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
  ["totalTerm", "Total term (days)", "number", "25"],
];

export default function AddClientForm({
  newClient,
  setNewClient,
  addClient,
}: AddClientFormProps) {
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

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment frequency</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
            value={newClient.paymentFrequency || "daily"}
            onChange={(e) => setNewClient({ ...newClient, paymentFrequency: e.target.value })}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-4 mb-5">
        <p className="text-xs font-medium text-gray-500 mb-1">Quick summary</p>
        <p className="text-sm text-gray-700">
          {newClient.businessName || "Client"} will pay{" "}
          <span className="font-medium">
            ${Number(newClient.payment || 0).toLocaleString()}
          </span>{" "}
          {newClient.paymentFrequency || "daily"} on a{" "}
          <span className="font-medium">
            ${Number(newClient.payback || 0).toLocaleString()}
          </span>{" "}
          payback (funded{" "}
          <span className="font-medium">
            ${Number(newClient.funded || 0).toLocaleString()}
          </span>
          ).
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={addClient}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Create client
        </button>
      </div>
    </div>
  );
}