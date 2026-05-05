"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/holidays";
import { logActivity } from "@/components/ActivityLog";
import type { Client, Position } from "@/lib/types";

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

// NetSuite dates = settlement dates
// ACH debit = 4 business days BEFORE settlement
function subtractBusinessDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00");
  let subtracted = 0;
  while (subtracted < days) {
    date.setDate(date.getDate() - 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) subtracted++;
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

  // Pass 1: Scan entire text for INV##### pattern
  const globalInvMatch = text.match(/INV\d+/i);
  if (globalInvMatch) invoice = globalInvMatch[0].toUpperCase();

  // Pass 2: Header info
  for (const line of lines) {
    const balMatch = line.match(/current\s+balance[:\s]+\$?([\d,]+\.?\d*)/i);
    if (balMatch) currentBalance = parseMoney(balMatch[1]);

    if (
      /^[A-Z][a-zA-Z\s]+$/.test(line) &&
      line.length > 3 && line.length < 60 &&
      !/date|description|credit|debit|returns|balance|merchant|payment|history|invoice|portal|admin/i.test(line)
    ) {
      merchantName = line;
    }
  }

  // Pass 3: Find data start
  let dataStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/date/i.test(lines[i]) && /description/i.test(lines[i])) {
      dataStartIdx = i + 1;
      break;
    }
  }

  // Pass 4: Parse rows
  const datePattern = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.*)/;

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(datePattern);
    if (!match) continue;

    const date = parseDate(match[1]);
    const rest = match[2];

    const descMatch = rest.match(/^([^$\d]+)/);
    const description = descMatch ? descMatch[1].trim() : rest.trim();
    const amounts = (rest.match(/\$?[\d,]+\.\d{2}/g) || []).map(parseMoney);

    let rowType: ParsedRow["rowType"] = "unknown";
    let returnCode = "";
    let credit = 0, debit = 0, rets = 0, runningBalance = 0;

    if (/invoice/i.test(description) && amounts.length >= 1) {
      rowType = "funding";
      const invMatch = description.match(/INV\d+/i);
      if (invMatch && !invoice) invoice = invMatch[0].toUpperCase();
      if (amounts.length >= 2) { credit = amounts[0]; payback = credit; runningBalance = amounts[amounts.length - 1]; }
      else { credit = amounts[0]; payback = credit; runningBalance = amounts[0]; }

    } else if (/returned\s+payment/i.test(description)) {
      rowType = "return";
      const codeMatch = description.match(/R\d{2}/i);
      returnCode = codeMatch ? codeMatch[0].toUpperCase() : "R01";
      if (amounts.length >= 2) { rets = amounts[0]; runningBalance = amounts[amounts.length - 1]; }
      else if (amounts.length === 1) { rets = amounts[0]; }

    } else if (/payment/i.test(description)) {
      rowType = "payment";
      if (amounts.length >= 2) { debit = amounts[0]; runningBalance = amounts[amounts.length - 1]; }
      else if (amounts.length === 1) { debit = amounts[0]; }
    }

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
  const [manualInvoice, setManualInvoice] = useState("");
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [processing, setProcessing] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [parsed, setParsed] = useState<{
    rows: ParsedRow[];
    invoice: string;
    payback: number;
    currentBalance: number;
    merchantName: string;
    client: Client | null;
    matchedPosition: Position | null;
  } | null>(null);
  const [result, setResult] = useState({ payments: 0, returns: 0, skipped: 0 });

  async function loadPositionsForClient(clientId: number) {
    const { data } = await supabase
      .from("positions")
      .select("*")
      .eq("client_id", clientId)
      .order("position_order", { ascending: true });
    setPositions((data || []) as Position[]);
    return (data || []) as Position[];
  }

  function handleParse() {
    if (!pasteText.trim()) return;

    const result = parseStatement(pasteText);
    if (manualInvoice.trim()) result.invoice = manualInvoice.trim().toUpperCase();

    // Match to client — check both main invoice and positions
    let matchedClient: Client | null = null;
    let matchedPosition: Position | null = null;

    // First try direct client invoice match
    matchedClient = clients.find(c =>
      c.invoice.trim().toLowerCase() === result.invoice.trim().toLowerCase()
    ) || null;

    // If not found, check positions table
    if (!matchedClient) {
      // We'll check positions after setting state — handled in useEffect
    }

    setParsed({ ...result, client: matchedClient, matchedPosition: null });
    setStep("review");

    // Load positions if client found
    if (matchedClient) {
      loadPositionsForClient(matchedClient.id).then(pos => {
        const mp = pos.find(p => p.invoice.toLowerCase() === result.invoice.toLowerCase()) || null;
        setParsed(prev => prev ? { ...prev, matchedPosition: mp } : prev);
      });
    }
  }

  // Also search positions for invoice match when client not found directly
  useEffect(() => {
    if (step === "review" && parsed && !parsed.client && parsed.invoice) {
      // Search positions table for this invoice
      supabase
        .from("positions")
        .select("*, clients(*)")
        .eq("invoice", parsed.invoice)
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data && (data as any).clients) {
            const client = (data as any).clients as Client;
            const position = { ...data, clients: undefined } as Position;
            setParsed(prev => prev ? { ...prev, client, matchedPosition: position } : prev);
            loadPositionsForClient(client.id);
          }
        });
    }
  }, [step, parsed?.invoice]);

  async function handleImport() {
    if (!parsed) return;
    setProcessing(true);

    let importedPayments = 0;
    let importedReturns = 0;
    let skipped = 0;

    const paymentRows = parsed.rows.filter(r => r.rowType === "payment");
    const returnRows = parsed.rows.filter(r => r.rowType === "return");

    // Import payments — NetSuite date = settlement, ACH = 4 biz days prior
    for (const row of paymentRows) {
      const achDate = subtractBusinessDays(row.date, 4);

      const { error } = await supabase.from("payments").insert({
        invoice: parsed.invoice,
        payment_date: achDate,
        ach_date: achDate,
        settlement_date: row.date,
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
        .eq("return_date", subtractBusinessDays(row.date, 4))
        .eq("return_amount", row.returns)
        .limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      await supabase.from("returns").insert({
        invoice: parsed.invoice,
        merchant_name: parsed.merchantName || parsed.client?.business_name || "",
        return_date: subtractBusinessDays(row.date, 4),
        settle_date: row.date,
        return_code: row.returnCode || "R01",
        return_amount: row.returns,
      });

      await supabase.from("payments").insert({
        invoice: parsed.invoice,
        payment_date: subtractBusinessDays(row.date, 4),
        ach_date: subtractBusinessDays(row.date, 4),
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
        `${money(row.returns)} returned · settled ${row.date} · Insufficient funds`
      );

      importedReturns++;
    }

    // Update position balance if this invoice is a position
    if (parsed.matchedPosition) {
      await supabase.from("positions").update({
        balance: parsed.currentBalance,
        status: parsed.currentBalance === 0 ? "completed" : "active",
      }).eq("id", parsed.matchedPosition.id);
    }

    // Update client combined balance
    if (parsed.client) {
      // Recalculate combined balance from all positions
      const { data: allPositions } = await supabase
        .from("positions")
        .select("balance")
        .eq("client_id", parsed.client.id);

      if (allPositions && allPositions.length > 0) {
        const combinedBalance = allPositions.reduce((sum, p) => sum + Number(p.balance), 0);
        await supabase.from("clients").update({
          balance: combinedBalance,
          total_returns: (parsed.client.total_returns || 0) + importedReturns,
        }).eq("id", parsed.client.id);
      } else {
        // No positions — update directly
        await supabase.from("clients").update({
          balance: parsed.currentBalance,
          total_returns: (parsed.client.total_returns || 0) + importedReturns,
        }).eq("id", parsed.client.id);
      }
    }

    await logActivity(
      parsed.invoice,
      "funded",
      "CFG statement imported",
      `${importedPayments} payments and ${importedReturns} returns imported · Balance set to ${money(parsed.currentBalance)}`
    );

    setResult({ payments: importedPayments, returns: importedReturns, skipped });
    setStep("done");
    setProcessing(false);
    onImportComplete();
  }

  function reset() {
    setPasteText("");
    setManualInvoice("");
    setParsed(null);
    setPositions([]);
    setStep("paste");
    setResult({ payments: 0, returns: 0, skipped: 0 });
  }

  // ── Step: Paste ────────────────────────────────────────────────────────────
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
              NetSuite dates are settlement dates — ACH debit dates calculated automatically (4 business days prior)
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 mb-4">
          <p className="text-xs font-medium text-indigo-800 mb-1">How to copy from the PDF:</p>
          <p className="text-xs text-indigo-600 leading-relaxed">
            Open the CFG statement PDF → click anywhere → <strong>Ctrl+A</strong> → <strong>Ctrl+C</strong> → click below → <strong>Ctrl+V</strong>
          </p>
          <p className="text-xs text-indigo-500 mt-1.5">
            For add-on clients, import one invoice at a time. Each invoice links to the same client automatically.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Invoice # <span className="font-normal text-gray-400">— type it in if auto-detection misses it</span>
          </label>
          <input
            type="text"
            placeholder="INV98613"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition-colors w-52 uppercase placeholder:normal-case placeholder:text-gray-300"
            value={manualInvoice}
            onChange={e => setManualInvoice(e.target.value.toUpperCase())}
          />
        </div>

        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-700 font-mono focus:outline-none focus:border-gray-400 transition-colors resize-none"
          rows={10}
          placeholder={`Paste the full CFG statement text here...`}
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
          <p className="text-xs text-gray-400">You will review everything before anything saves</p>
        </div>
      </div>
    );
  }

  // ── Step: Review ───────────────────────────────────────────────────────────
  if (step === "review" && parsed) {
    const paymentRows = parsed.rows.filter(r => r.rowType === "payment");
    const returnRows = parsed.rows.filter(r => r.rowType === "return");
    const totalPaid = paymentRows.reduce((sum, r) => sum + r.debit, 0);
    const totalReturned = returnRows.reduce((sum, r) => sum + r.returns, 0);
    const isPositionMatch = !!parsed.matchedPosition;
    const hasOtherPositions = positions.length > 1;

    return (
      <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Review before importing</p>
          <p className="text-xs text-gray-400 mt-0.5">Confirm the parsed data looks correct before saving anything</p>
        </div>

        {/* Summary */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Invoice</p>
              <p className="text-sm font-semibold text-gray-900">{parsed.invoice || "Not found"}</p>
              {isPositionMatch && (
                <p className="text-[10px] text-indigo-500 mt-0.5">Position {parsed.matchedPosition?.position_order}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Payback amount</p>
              <p className="text-sm font-semibold text-gray-900">{money(parsed.payback)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                {hasOtherPositions ? "This invoice balance" : "Current balance"}
              </p>
              <p className="text-sm font-semibold text-indigo-600">{money(parsed.currentBalance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Client in portal</p>
              {parsed.client ? (
                <div>
                  <p className="text-sm font-semibold text-emerald-600">✓ {parsed.client.business_name}</p>
                  {hasOtherPositions && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{positions.length} invoice positions</p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-red-500">⚠ Not found</p>
              )}
            </div>
          </div>
        </div>

        {/* Multi-position notice */}
        {hasOtherPositions && parsed.client && (
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <p className="text-xs font-medium text-indigo-800">
              Add-on client — {positions.length} invoice positions
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {positions.map(p => (
                <span key={p.id} className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${
                  p.invoice === parsed.invoice
                    ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                    : "bg-white border-gray-200 text-gray-500"
                }`}>
                  {p.invoice} · {money(Number(p.balance))}
                  {p.invoice === parsed.invoice ? " ← importing" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Client not found */}
        {!parsed.client && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5">
              <path d="M8 5v4M8 11v.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="6.5" stroke="#D97706" strokeWidth="1.2"/>
            </svg>
            <div>
              <p className="text-xs font-medium text-amber-800">
                Invoice <span className="font-mono">{parsed.invoice || "not detected"}</span> not found.
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {!parsed.invoice
                  ? "Type the invoice number in the field above and parse again."
                  : "Add the client first, then add this as a position in their client view, then import."}
              </p>
              <button onClick={reset} className="mt-2 text-xs font-medium text-amber-800 underline underline-offset-2">
                ← Go back and fix
              </button>
            </div>
          </div>
        )}

        {/* Payments table */}
        {paymentRows.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Payments — {paymentRows.length} rows · {money(totalPaid)} total received
            </p>
            <p className="text-[10px] text-gray-400 mb-3">Settlement date from NetSuite · ACH debit = 4 business days prior</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Settlement date", "Amount", "Running balance", "ACH debit date"].map(h => (
                      <th key={h} className={`pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${h === "Settlement date" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-xs font-medium text-gray-700">{row.date}</td>
                      <td className="py-2 text-xs font-semibold text-emerald-600 text-right">{money(row.debit)}</td>
                      <td className="py-2 text-xs text-gray-500 text-right">{money(row.runningBalance)}</td>
                      <td className="py-2 text-xs text-gray-400 text-right">{subtractBusinessDays(row.date, 4)}</td>
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Returns — {returnRows.length} rows · {money(totalReturned)} total returned
            </p>
            <p className="text-[10px] text-gray-400 mb-3">Settlement date from NetSuite · ACH date = 4 business days prior</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Settlement date", "Code", "Amount", "Running balance"].map(h => (
                      <th key={h} className={`pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${h === "Settlement date" || h === "Code" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {returnRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-xs font-medium text-gray-700">{row.date}</td>
                      <td className="py-2 text-xs font-semibold text-red-600">{row.returnCode || "R01"}</td>
                      <td className="py-2 text-xs font-semibold text-red-600 text-right">{money(row.returns)}</td>
                      <td className="py-2 text-xs text-gray-500 text-right">{money(row.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
          <button onClick={reset} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            ← Start over
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Done ─────────────────────────────────────────────────────────────
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
            {result.payments} payment{result.payments !== 1 ? "s" : ""} imported · {result.returns} return{result.returns !== 1 ? "s" : ""} imported
            {result.skipped > 0 && ` · ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""} skipped`}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Client balance updated. All payments visible in payment history and activity log.
      </p>
      <button onClick={reset} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        Import another statement
      </button>
    </div>
  );
}