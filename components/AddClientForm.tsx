"use client";

import type { NewClientForm } from "@/lib/types";

type AddClientFormProps = {
  newClient: NewClientForm;
  setNewClient: (c: NewClientForm) => void;
  addClient: () => void;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const BUSINESS_TYPES = [
  { value: "llc",         label: "LLC" },
  { value: "sole_prop",   label: "Sole Proprietorship" },
  { value: "corp",        label: "Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "other",       label: "Other" },
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function calcTotalTerm(payback: string, payment: string, frequency: string): number {
  const p = parseFloat(payback);
  const d = parseFloat(payment);
  if (!p || !d || d === 0) return 0;
  const rawPayments = Math.ceil(p / d);
  return frequency === "weekly" ? rawPayments * 5 : rawPayments;
}

function calcFactorRate(funded: string, payback: string): string {
  const f = parseFloat(funded);
  const p = parseFloat(payback);
  if (!f || !p || f === 0) return "—";
  return (p / f).toFixed(2) + "x";
}

function calcDebtToRevenue(payback: string, avgRev: string): string {
  const p = parseFloat(payback);
  const r = parseFloat(avgRev);
  if (!p || !r || r === 0) return "—";
  return ((p / r) * 100).toFixed(1) + "%";
}

export default function AddClientForm({ newClient, setNewClient, addClient }: AddClientFormProps) {
  const isWeekly = newClient.paymentFrequency === "weekly";
  const totalTerm = calcTotalTerm(newClient.payback, newClient.payment, newClient.paymentFrequency);
  const rawPayments = newClient.payback && newClient.payment
    ? Math.ceil(parseFloat(newClient.payback) / parseFloat(newClient.payment))
    : 0;
  const factorRate = calcFactorRate(newClient.funded, newClient.payback);
  const debtToRevenue = calcDebtToRevenue(newClient.payback, newClient.avgMonthlyRevenue);

  function handleChange(field: keyof NewClientForm, value: string) {
    setNewClient({ ...newClient, [field]: value });
  }

  function handleFrequencyChange(value: string) {
    setNewClient({ ...newClient, paymentFrequency: value as "daily" | "weekly", paymentDay: "" });
  }

  function handleSubmit() {
    addClient();
  }

  const canSubmit = !!(
    newClient.businessName &&
    newClient.invoice &&
    newClient.funded &&
    newClient.payback &&
    newClient.payment &&
    totalTerm > 0 &&
    (!isWeekly || newClient.paymentDay)
  );

  return (
    <div className="space-y-5">

      {/* Deal information */}
      <div className="rounded-xl bg-white border border-gray-100 p-6">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-gray-900">Deal information</h2>
          <p className="text-xs text-gray-400 mt-0.5">Core MCA deal terms and contact details</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Business name <span className="text-red-400">*</span></label>
            <input type="text" placeholder="LOFTY LLC"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.businessName} onChange={(e) => handleChange("businessName", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Invoice # <span className="text-red-400">*</span></label>
            <input type="text" placeholder="INV96955"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.invoice} onChange={(e) => handleChange("invoice", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Owner name</label>
            <input type="text" placeholder="John Smith"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.ownerName} onChange={(e) => handleChange("ownerName", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Client email</label>
            <input type="email" placeholder="client@business.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.clientEmail} onChange={(e) => handleChange("clientEmail", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Funded date</label>
            <input type="date"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.fundedDate} onChange={(e) => handleChange("fundedDate", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Position</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
              value={newClient.position} onChange={(e) => handleChange("position", e.target.value)}>
              <option value="">Select position</option>
              <option value="1">1st position</option>
              <option value="2">2nd position</option>
              <option value="3">3rd position</option>
              <option value="4">4th+ position</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Funded amount ($) <span className="text-red-400">*</span></label>
            <input type="number" placeholder="25000"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.funded} onChange={(e) => handleChange("funded", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Payback amount ($) <span className="text-red-400">*</span></label>
            <input type="number" placeholder="31250"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.payback} onChange={(e) => handleChange("payback", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment amount ($) <span className="text-red-400">*</span></label>
            <input type="number" placeholder="1250"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.payment} onChange={(e) => handleChange("payment", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment frequency</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
              value={newClient.paymentFrequency}
              onChange={(e) => handleFrequencyChange(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          {isWeekly && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Weekly payment day</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
                value={newClient.paymentDay}
                onChange={(e) => handleChange("paymentDay", e.target.value)}>
                <option value="">Select a day</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Auto-calculated fields */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Total term (auto-calculated)</label>
            <div className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              {totalTerm > 0 ? (
                <span>
                  <span className="font-semibold text-gray-900">{totalTerm} business days</span>
                  <span className="text-gray-400 ml-1">({rawPayments} {isWeekly ? "weekly" : "daily"} payment{rawPayments !== 1 ? "s" : ""})</span>
                </span>
              ) : (
                <span className="text-gray-300">Enter payback ÷ payment</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Factor rate (auto-calculated)</label>
            <div className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
              <span className={factorRate === "—" ? "text-gray-300" : "font-semibold text-gray-900"}>{factorRate}</span>
            </div>
          </div>

        </div>
      </div>

      {/* Business profile */}
      <div className="rounded-xl bg-white border border-gray-100 p-6">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-gray-900">Business profile</h2>
          <p className="text-xs text-gray-400 mt-0.5">Used for portfolio analysis and risk assessment — optional but recommended</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">State</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
              value={newClient.state} onChange={(e) => handleChange("state", e.target.value)}>
              <option value="">Select state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Business type</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400 transition-colors bg-white"
              value={newClient.businessType} onChange={(e) => handleChange("businessType", e.target.value)}>
              <option value="">Select type</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">SIC code</label>
            <input type="text" placeholder="7389"
              maxLength={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.sicCode} onChange={(e) => handleChange("sicCode", e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <p className="text-[10px] text-gray-400 mt-1">4-digit Standard Industry Classification code</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">FICO / Credit score</label>
            <input type="number" placeholder="650" min="300" max="850"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.ficoScore} onChange={(e) => handleChange("ficoScore", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Avg monthly revenue ($)</label>
            <input type="number" placeholder="50000"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.avgMonthlyRevenue} onChange={(e) => handleChange("avgMonthlyRevenue", e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Time in business (months)</label>
            <input type="number" placeholder="36"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
              value={newClient.timeInBusinessMonths} onChange={(e) => handleChange("timeInBusinessMonths", e.target.value)} />
            {newClient.timeInBusinessMonths && Number(newClient.timeInBusinessMonths) > 0 && (
              <p className="text-[10px] text-gray-400 mt-1">
                {Math.floor(Number(newClient.timeInBusinessMonths) / 12)} yr{Math.floor(Number(newClient.timeInBusinessMonths) / 12) !== 1 ? "s" : ""} {Number(newClient.timeInBusinessMonths) % 12} mo
              </p>
            )}
          </div>

          {/* Debt to revenue — auto calculated */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Debt-to-revenue ratio (auto)</label>
            <div className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
              <span className={debtToRevenue === "—" ? "text-gray-300" : "font-semibold text-gray-900"}>{debtToRevenue}</span>
              {debtToRevenue !== "—" && (
                <span className={`ml-2 text-[10px] ${
                  parseFloat(debtToRevenue) > 50 ? "text-red-500" :
                  parseFloat(debtToRevenue) > 30 ? "text-amber-500" : "text-emerald-500"
                }`}>
                  {parseFloat(debtToRevenue) > 50 ? "High" : parseFloat(debtToRevenue) > 30 ? "Moderate" : "Low"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Payback ÷ monthly revenue</p>
          </div>

        </div>
      </div>

      {/* Quick summary */}
      {totalTerm > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deal summary</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Funded</p>
              <p className="text-sm font-semibold text-gray-900">
                {newClient.funded ? `$${parseFloat(newClient.funded).toLocaleString()}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Payback</p>
              <p className="text-sm font-semibold text-gray-900">
                {newClient.payback ? `$${parseFloat(newClient.payback).toLocaleString()}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Factor rate</p>
              <p className="text-sm font-semibold text-gray-900">{factorRate}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Term</p>
              <p className="text-sm font-semibold text-gray-900">
                {totalTerm > 0 ? `${totalTerm} days · ${rawPayments} payments` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Payment</p>
              <p className="text-sm font-semibold text-gray-900">
                {newClient.payment ? `$${parseFloat(newClient.payment).toLocaleString()} ${isWeekly ? "weekly" : "daily"}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">FICO</p>
              <p className={`text-sm font-semibold ${
                !newClient.ficoScore ? "text-gray-300" :
                Number(newClient.ficoScore) >= 700 ? "text-emerald-600" :
                Number(newClient.ficoScore) >= 600 ? "text-amber-600" : "text-red-600"
              }`}>
                {newClient.ficoScore || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Debt/Revenue</p>
              <p className="text-sm font-semibold text-gray-900">{debtToRevenue}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">State · Position</p>
              <p className="text-sm font-semibold text-gray-900">
                {[newClient.state || "—", newClient.position ? `${newClient.position}${["st","nd","rd"][Number(newClient.position)-1] || "th"} pos` : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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