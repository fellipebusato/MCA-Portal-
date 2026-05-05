"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/holidays";
import { logActivity } from "@/components/ActivityLog";
import type { Client } from "@/lib/types";

type ParsedRow = {
  date: string;
  description: string;
  credit: number;
  debit: number;
  returns: number;
  runningBalance: number;
  rowType: "funding" | "payment" | "return" | "unknown";
  returnCode: string;
};

function parseDate(raw: string): string {
  const parts = raw.trim().split("/");
  if (parts.length !== 3) return raw.trim();
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseMoney(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  return parseFloat(raw.replace(/[$,]/g, "").trim()) || 0;
}

function addBusinessDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00");
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return date.toISOString().split("T")[0];
}

function parseStatement(text: string): {
  rows: ParsedRow[];
  invoice: string;
  payback: number;
  currentBalance: number;
  merchantName: string;
} {
  const rows: ParsedRow[] = [];
  let invoice = "";
  let payback = 0;
  let currentBalance = 0;
  let merchantName = "";

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Try to grab merchant name and current balance from header
  for (const line of lines) {
    const balMatch = line.match(/current\s+balance[:\s]+\$?([\d,]+\.?\d*)/i);
    if (balMatch) currentBalance = parseMoney(balMatch[1]);

    // Merchant name is often on its own line after the heading
    if (/^[A-Z][a-zA-Z\s]+$/.test(line) && line.length > 3 && line.length < 60
      && !/date|description|credit|debit|returns|balance|merchant|payment|history/i.test(line)) {
      merchantName = line;
    }
  }

  // Find where the data rows start (after the header row)
  let dataStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/date/i.test(lines[i]) && /description/i.test(lines[i])) {
      dataStartIdx = i + 1;
      break;
    }
  }

  // Date pattern at start of line
  const datePattern = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.*)/;

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(datePattern);
    if (!match) continue;

    const date = parseDate(match[1]);
    const rest = match[2];

    // Extract description (everything before first dollar sign or standalone number)
    const descMatch = rest.match(/^([^$\d]+)/);
    const description = descMatch ? descMatch[1].trim() : rest.trim();

    // Extract all dollar amounts in order
    const amounts = (rest.match(/\$?[\d,]+\.\d{2}/g) || []).map(parseMoney);

    // Determine row type
    let rowType: ParsedRow["rowType"] = "unknown";
    let returnCode = "";
    let credit = 0, debit = 0, rets = 0, runningBalance = 0;

    if (/invoice\s*#?inv/i.test(description)) {
      // Funding row:
      // Invoice #INV99460 $9,800.00 $9,800.00
      // Credit = payback amount, Running Balance = same
      rowType = "funding";

      const invMatch = description.match(/inv\w+/i);
      if (invMatch && !invoice) invoice = invMatch[0].toUpperCase();

      // The credit amount IS the payback (total amount owed)
      if (amounts.length >= 1) {
        credit = amounts[0];
        payback = credit;
        runningBalance = amounts.length >= 2 ? amounts[amounts.length - 1] : amounts[0];
      }

    } else if (/returned\s+payment/i.test(description)) {
      // Return row:
      // Returned Payment R01 $395.00 $9,010.00
      // Returns column = amount returned, Running Balance = unchanged
      rowType = "return";

      const codeMatch = description.match(/R\d{2}/i);
      returnCode = codeMatch ? codeMatch[0].toUpperCase() : "R01";

      if (amounts.length >= 2) {
        rets = amounts[0];
        runningBalance = amounts[amounts.length - 1];
      } else if (amounts.length === 1) {
        rets = amounts[0];
      }

    } else if (/payment/i.test(description)) {
      // Payment row:
      // Payment $395.00 $9,405.00
      // Debit = amount received, Running Balance = new balance
      rowType = "payment";

      if (amounts.length >= 2) {
        debit = amounts[0];
        runningBalance = amounts[amounts.length - 1];
      } else if (amounts.length === 1) {
        debit = amounts[0];
      }
    }

    // Track current balance as we go — last running balance in the statement
    if (runningBalance > 0) currentBalance = runningBalance;

    rows.push({ date, description, credit, debit, returns: rets, runningBalance, rowType, returnCode });
  }

  return { rows, invoice, payback, currentBalance, merchantName };
}

export default function StatementImport({
  clients,
  onImportComplete,
}: {
  clients: Client[];
  onImportComplete: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [processing, setProcessing] = useState(false);
  const [parsed, setParsed] = useState<{
    rows: ParsedRow[];
    invoice: string;
    payback: number;
    currentBalance: number;
    merchantName: string;
    client: Client | null;
  } | null>(null);
  const [result, setResult] = useState({ payments: 0, returns: 0, skipped: 0 });

  function handleParse() {
    if (!pasteText.trim()) return;

    const { rows, invoice, payback, currentBalance, merchantName } = parseStatement(pasteText);

    const client = clients.find(c =>
      c.invoice.trim().toLowerCase() === invoice.trim().toLowerCase()
    ) || null;

    setParsed({ rows, invoice, payback, currentBalance, merchantName, client });
    setStep("review");
  }

  async function handleImport() {
    if (!parsed) return;
    setProcessing(true);

    let importedPayments = 0;
    let importedReturns = 0;
    let skipped = 0;

    const paymentRows = parsed.rows.filter(r => r.rowType === "payment");
    const returnRows = parsed.rows.filter(r => r.rowType === "return");

    // Import payments
    for (const row of paymentRows) {
      const settlementDate = addBusinessDays(row.date, 4);

      const { error } = await supabase.from("payments").insert({
        invoice: parsed.invoice,
        payment_date: row.date,
        ach_date: row.date,
        settlement_date: settlementDate,
        description: "Posted",
        credit: 0,
        debit: row.debit,
        returns: 0,
        running_balance: row.runningBalance,
      });

      if (error && error.code === "23505") { skipped++; continue; }
      if (error) { console.error("Payment insert error:", error); continue; }
      importedPayments++;
    }

    // Import returns
    for (const row of returnRows) {
      const { data: existing } = await supabase
        .from("returns")
        .select("id")
        .eq("invoice", parsed.invoice)
        .eq("return_date", row.date)
        .eq("return_amount", row.returns)
        .limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      await supabase.from("returns").insert({
        invoice: parsed.invoice,
        merchant_name: parsed.merchantName || parsed.client?.business_name || "",
        return_date: row.date,
        settle_date: addBusinessDays(row.date, 4),
        return_code: row.returnCode || "R01",
        return_amount: row.returns,
      });

      await supabase.from("payments").insert({
        invoice: parsed.invoice,
        payment_date: row.date,
        ach_date: row.date,
        settlement_date: row.date,
        description: `Returned — ${row.returnCode || "R01"}`,
        credit: 0,
        debit: 0,
        returns: row.returns,
        running_balance: row.runningBalance,
      });

      await logActivity(
        parsed.invoice,
        "return",
        `Payment returned — ${row.returnCode || "R01"}`,
        `${money(row.returns)} returned on ${row.date} · Insufficient funds`
      );

      importedReturns++;
    }

    // Update client balance to match statement current balance
    if (parsed.client) {
      await supabase.from("clients").update({
        balance: parsed.currentBalance,
        total_returns: (parsed.client.total_returns || 0) + importedReturns,
      }).eq("id", parsed.client.id);
    }

    // Log the full import
    await logActivity(
      parsed.invoice,
      "funded",
      "CFG statement imported",
      `${importedPayments} payments and ${importedReturns} returns imported · Balance updated to ${money(parsed.currentBalance)}`
    );

    setResult({ payments: importedPayments, returns: importedReturns, skipped });
    setStep("done");
    setProcessing(false);
    onImportComplete();
  }

  function reset() {
    setPasteText("");
    setParsed(null);
    setStep("paste");
    setResult({ payments: 0, returns: 0, skipped: 0 });
  }

  // ── Step: Paste ──────────────────────────────────────────────────────────
  if (step === "paste") {
    return (
      <div className="rounded-xl bg-white border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="#4F46E5" strokeWidth="1.3"/>
              <path d="M6 6h4M6 9h4M6 12h2" stroke="#4F46E5" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Import CFG statement</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Open the PDF, select all text, copy and paste it below
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 mb-4">
          <p className="text-xs font-medium text-indigo-800 mb-1">How to copy from PDF:</p>
          <p className="text-xs text-indigo-600 leading-relaxed">
            Open the CFG statement PDF → click anywhere in the table → Ctrl+A (select all) → Ctrl+C (copy) → click below and Ctrl+V (paste)
          </p>
        </div>

        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-700 font-mono focus:outline-none focus:border-gray-400 transition-colors resize-none"
          rows={10}
          placeholder={`Paste the CFG statement here. Example:\n\nMerchant Payment History\nDaniel Aletras\nCurrent Balance: $5,165.00\n\nDate Description Credit Debit Returns Running Balance\n12/12/2025 Invoice #INV99460 $9,800.00 $9,800.00\n12/26/2025 Payment $395.00 $9,405.00\n1/6/2026 Returned Payment R01 $395.00 $9,010.00`}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={!pasteText.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Parse statement →
          </button>
          <p className="text-xs text-gray-400">You will review before anything is saved</p>
        </div>
      </div>
    );
  }

  // ── Step: Review ─────────────────────────────────────────────────────────
  if (step === "review" && parsed) {
    const paymentRows = parsed.rows.filter(r => r.rowType === "payment");
    const returnRows = parsed.rows.filter(r => r.rowType === "return");
    const totalPaid = paymentRows.reduce((sum, r) => sum + r.debit, 0);
    const totalReturned = returnRows.reduce((sum, r) => sum + r.returns, 0);

    return (
      <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Review before importing</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Confirm the parsed data looks correct before saving anything
          </p>
        </div>

        {/* Summary strip */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Invoice</p>
              <p className="text-sm font-semibold text-gray-900">{parsed.invoice || "Not found"}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Payback amount</p>
              <p className="text-sm font-semibold text-gray-900">{money(parsed.payback)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Current balance</p>
              <p className="text-sm font-semibold text-indigo-600">{money(parsed.currentBalance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Client in portal</p>
              {parsed.client ? (
                <p className="text-sm font-semibold text-emerald-600">✓ {parsed.client.business_name}</p>
              ) : (
                <p className="text-sm font-semibold text-red-500">⚠ Not found — add client first</p>
              )}
            </div>
          </div>
        </div>

        {/* Client not found warning */}
        {!parsed.client && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-xs font-medium text-amber-800">
              Invoice {parsed.invoice} does not match any client in your portal. Please add the client first using + Add client, then come back to import their statement.
            </p>
          </div>
        )}

        {/* Payments table */}
        {paymentRows.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Payments — {paymentRows.length} rows · {money(totalPaid)} total received
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="pb-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="pb-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Running balance</th>
                    <th className="pb-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Settles</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-xs text-gray-700">{row.date}</td>
                      <td className="py-2 text-xs font-medium text-emerald-600 text-right">{money(row.debit)}</td>
                      <td className="py-2 text-xs text-gray-500 text-right">{money(row.runningBalance)}</td>
                      <td className="py-2 text-xs text-gray-400 text-right">{addBusinessDays(row.date, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Returns table */}
        {returnRows.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Returns — {returnRows.length} rows · {money(totalReturned)} total returned
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="pb-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Code</th>
                    <th className="pb-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="pb-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Running balance</th>
                  </tr>
                </thead>
                <tbody>
                  {returnRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-xs text-gray-700">{row.date}</td>
                      <td className="py-2 text-xs font-medium text-red-600">{row.returnCode || "R01"}</td>
                      <td className="py-2 text-xs font-medium text-red-600 text-right">{money(row.returns)}</td>
                      <td className="py-2 text-xs text-gray-500 text-right">{money(row.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="px-5 py-4 flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={processing || !parsed.client}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {processing
              ? "Importing..."
              : parsed.client
              ? `Import ${paymentRows.length} payment${paymentRows.length !== 1 ? "s" : ""} + ${returnRows.length} return${returnRows.length !== 1 ? "s" : ""}`
              : "Add client first"}
          </button>
          <button
            onClick={reset}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            ← Start over
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l4 4 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Import complete</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {result.payments} payments imported · {result.returns} returns imported
            {result.skipped > 0 && ` · ${result.skipped} duplicates skipped`}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        The client&apos;s balance has been updated to match the statement. All payments and returns are now visible in their payment history and activity log.
      </p>
      <button
        onClick={reset}
        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        Import another statement
      </button>
    </div>
  );
}