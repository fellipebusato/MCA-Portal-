"use client";

type Payment = {
  id: number;
  payment_date: string;
  ach_date: string;
  settlement_date: string;
  description: string;
  credit: number;
  debit: number;
  returns: number;
  running_balance: number;
};

function money(amount: number) {
  if (!amount || amount === 0) return "—";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(date: string) {
  if (!date) return "—";
  const d = new Date(date);
  const utc = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utc.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function isPending(payment: Payment): boolean {
  const desc = (payment.description || "").toLowerCase();
  if (desc.includes("return") || desc.includes("missed") || desc.includes("initial")) return false;
  if (!payment.settlement_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const settles = new Date(payment.settlement_date);
  settles.setHours(0, 0, 0, 0);
  return settles > today;
}

function DescriptionBadge({ description, pending }: { description: string; pending: boolean }) {
  const desc = (description || "").toLowerCase().trim();
  const isInitial = desc.includes("initial") || (desc.includes("credit") && !desc.includes("posted"));
  const isReturned = desc.includes("return");
  const isMissed = desc.includes("missed");
  const isPosted = desc.includes("posted") && !isReturned && !isMissed && !isInitial;

  if (isInitial) {
    return (
      <span className="inline-block rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        Initial credit
      </span>
    );
  }
  if (isReturned) {
    return (
      <span className="inline-block rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Returned
      </span>
    );
  }
  if (isMissed) {
    return (
      <span className="inline-block rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Missed
      </span>
    );
  }
  if (isPosted && pending) {
    return (
      <span className="inline-block rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-600">
        Pending settlement
      </span>
    );
  }
  if (isPosted) {
    return (
      <span className="inline-block rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        Posted
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-gray-50 border border-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      {description}
    </span>
  );
}

export default function PaymentHistory({ payments }: { payments: Payment[] }) {
  if (!payments || payments.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-gray-100 p-8 text-center">
        <p className="text-sm text-gray-400">No payment history yet.</p>
      </div>
    );
  }

  const sorted = [...payments].sort((a, b) => {
    const dateA = a.ach_date || a.payment_date;
    const dateB = b.ach_date || b.payment_date;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const hasPending = sorted.some(p => isPending(p));

  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Payment history</h3>
          <p className="text-xs text-gray-400 mt-0.5">{payments.length} transactions</p>
        </div>
        {hasPending && (
          <div className="flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-100 px-3 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-xs text-blue-600 font-medium">Some payments pending settlement</span>
          </div>
        )}
      </div>

      {hasPending && (
        <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100 text-xs text-blue-700">
          Payments clear ACH Works immediately but take <strong>4 business days</strong> to settle and apply to your balance. Pending payments are shown but do not yet affect your balance.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">ACH date</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Settles</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Credit</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Debit</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Returns</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Balance</th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((payment, i) => {
              const pending = isPending(payment);
              const hasReturn = Number(payment.returns || 0) > 0;
              const hasCredit = Number(payment.credit || 0) > 0;
              const hasDebit = Number(payment.debit || 0) > 0;
              const achDate = payment.ach_date || payment.payment_date;
              const settlDate = payment.settlement_date || payment.payment_date;

              return (
                <tr
                  key={payment.id || i}
                  className={`border-b border-gray-50 ${
                    hasReturn ? "bg-red-50/30" : pending ? "bg-blue-50/20" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(achDate)}
                  </td>
                  <td className="px-5 py-3.5 text-sm whitespace-nowrap">
                    {hasReturn || hasCredit ? (
                      <span className="text-gray-300">—</span>
                    ) : pending ? (
                      <span className="text-blue-500 font-medium">{formatDate(settlDate)}</span>
                    ) : (
                      <span className="text-gray-400">{formatDate(settlDate)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <DescriptionBadge description={payment.description} pending={pending} />
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm">
                    {hasCredit ? (
                      <span className="font-medium text-blue-700">{money(Number(payment.credit))}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm">
                    {hasDebit ? (
                      <span className={pending ? "text-blue-400" : "text-gray-700"}>
                        {money(Number(payment.debit))}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm">
                    {hasReturn ? (
                      <span className="font-medium text-red-600">{money(Number(payment.returns))}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold whitespace-nowrap">
                    {pending ? (
                      <span className="text-gray-400 font-normal italic text-xs">pending</span>
                    ) : (
                      <span className="text-gray-900">{money(Number(payment.running_balance || 0))}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}