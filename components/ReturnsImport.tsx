"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/holidays";
import { logActivity } from "@/components/ActivityLog";
import type { Client } from "@/lib/types";

type ReturnRow = {
  merchant: string;
  invoice: string;
  processor: string;
  returnDate: string;
  settleDate: string;
  returnCode: string;
  returnAmount: number;
};

type MatchedReturn = ReturnRow & {
  client: Client | null;
  status: "matched" | "not_found" | "duplicate";
};

const RETURN_CODES: Record<string, string> = {
  R01: "Insufficient funds",
  R02: "Account closed",
  R03: "No account / unable to locate",
  R04: "Invalid account number",
  R07: "Authorization revoked by customer",
  R08: "Payment stopped",
  R10: "Customer advises not authorized",
  R16: "Account frozen",
  R20: "Non-transaction account",
  R29: "Corporate customer advises not authorized",
};

function parseReturnDate(raw: string): string {
  const parts = raw.trim().split("/");
  if (parts.length !== 3) return raw;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseReturnEmail(text: string): ReturnRow[] {
  const results: ReturnRow[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes("merchant") && l.toLowerCase().includes("inv")
  );
  if (headerIdx === -1) return results;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(/\t|\s{2,}/).map(c => c.trim()).filter(Boolean);
    if (cols.length < 6) continue;

    const invIdx = cols.findIndex(c => c.toUpperCase().includes("INV"));
    if (invIdx === -1) continue;

    const rawInv = cols[invIdx].replace(/invoice\s*#/gi, "").trim();

    const amountRaw = cols[cols.length - 1].replace(/[,$]/g, "").trim();
    const amount = parseFloat(amountRaw);
    if (isNaN(amount)) continue;

    const codeIdx = cols.findIndex(c => /^R\d{2}$/.test(c));
    if (codeIdx === -1) continue;

    const returnCode = cols[codeIdx];

    const dateCols = cols.filter(c => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
    if (dateCols.length < 2) continue;

    const returnDate = parseReturnDate(dateCols[0]);
    const settleDate = parseReturnDate(dateCols[1]);

    const merchant = cols.slice(0, invIdx).join(" ").trim();
    const processor = cols[invIdx + 1] || "ACHWorks";

    results.push({
      merchant,
      invoice: rawInv,
      processor,
      returnDate,
      settleDate,
      returnCode,
      returnAmount: amount,
    });
  }

  return results;
}

export default function ReturnsImport({
  clients,
  orgId,
  onImportComplete,
}: {
  clients: Client[];
  orgId: string;
  onImportComplete: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<MatchedReturn[]>([]);
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState({ imported: 0, skipped: 0, notFound: 0 });

  function handleParse() {
    if (!pasteText.trim()) return;
    const rows = parseReturnEmail(pasteText);

    const matched: MatchedReturn[] = rows.map(row => {
      const client = clients.find(c =>
        c.invoice.trim().toLowerCase() === row.invoice.trim().toLowerCase()
      ) || null;
      return { ...row, client, status: client ? "matched" : "not_found" };
    });

    setParsed(matched);
    setStep("review");
  }

  async function handleImport() {
    setProcessing(true);
    let imported = 0;
    let skipped = 0;
    let notFound = 0;

    for (const row of parsed) {
      if (row.status === "not_found") { notFound++; continue; }
      if (row.status === "duplicate") { skipped++; continue; }
      if (!row.client) { notFound++; continue; }

      const client = row.client;

      // Check for duplicate
      const { data: existing } = await supabase
        .from("returns")
        .select("id")
        .eq("invoice", row.invoice)
        .eq("return_date", row.returnDate)
        .eq("return_amount", row.returnAmount)
        .limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      // Insert return record
      const { error: returnError } = await supabase.from("returns").insert({
        invoice: row.invoice,
        merchant_name: row.merchant,
        return_date: row.returnDate,
        settle_date: row.settleDate,
        return_code: row.returnCode,
        return_amount: row.returnAmount,
      });

      if (returnError) { console.error("Return insert error:", returnError); continue; }

      // Insert into payments table
      await supabase.from("payments").insert({
        invoice: row.invoice,
        payment_date: row.returnDate,
        ach_date: row.returnDate,
        settlement_date: row.settleDate,
        description: `Returned — ${row.returnCode}`,
        credit: 0,
        debit: 0,
        returns: row.returnAmount,
        running_balance: Number(client.balance),
      });

      // Extend total_term — balance unchanged
      const termExtension = client.payment_frequency === "weekly" ? 5 : 1;
      const newTotalTerm = Number(client.total_term) + termExtension;
      const newTotalReturns = Number(client.total_returns || 0) + 1;

      const needsAttention = client.payment_frequency === "weekly"
        ? newTotalReturns >= 1
        : newTotalReturns >= 5;

      await supabase.from("clients").update({
        total_term: newTotalTerm,
        total_returns: newTotalReturns,
        last_return_date: row.returnDate,
        status: needsAttention ? "Needs Attention" : client.status,
      }).eq("id", client.id);

      // Log to activity log
      await logActivity(
        row.invoice,
        "return",
        `Payment returned — ${row.returnCode}`,
        `${money(row.returnAmount)} returned on ${row.returnDate} · ${RETURN_CODES[row.returnCode] || "Unknown reason"} · Term extended +${termExtension} day${termExtension > 1 ? "s" : ""}`
      );

      imported++;
    }

    setResult({ imported, skipped, notFound });
    setStep("done");
    setProcessing(false);
    onImportComplete();
  }

  function reset() {
    setPasteText("");
    setParsed([]);
    setStep("paste");
    setResult({ imported: 0, skipped: 0, notFound: 0 });
  }

  // ── Step: Paste ──────────────────────────────────────────
  if (step === "paste") {
    return (
      <div className="rounded-xl bg-white border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v5M8 10v.5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="6.5" stroke="#dc2626" strokeWidth="1.2"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Import returned payments</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Copy the table from your daily CFG returns email and paste it below
            </p>
          </div>
        </div>

        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-700 font-mono focus:outline-none focus:border-gray-400 transition-colors resize-none"
          rows={8}
          placeholder={`Paste the returns email table here. Example:\n\nMerchant\tINV#\tProcessor\tReturn Date\tSettle Date\tReturn Code\tReturn Amount\nGYA CONSTRUCTION LLC\tInvoice #INV99918\tACHWorks\t5/1/2026\t5/5/2026\tR01\t269.00`}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={!pasteText.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Parse returns →
          </button>
          <p className="text-xs text-gray-400">You will review before anything is saved</p>
        </div>
      </div>
    );
  }

  // ── Step: Review ─────────────────────────────────────────
  if (step === "review") {
    const matched = parsed.filter(r => r.status === "matched");
    const notFound = parsed.filter(r => r.status === "not_found");

    return (
      <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Review before importing</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {matched.length} matched · {notFound.length} not found — confirm before saving
          </p>
        </div>

        {matched.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Will be imported ({matched.length})
            </p>
            <div className="space-y-2">
              {matched.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{row.client?.business_name || row.merchant}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.invoice}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-red-600">{money(row.returnAmount)}</p>
                      <p className="text-xs text-gray-400">returned</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-700">{row.returnCode}</p>
                      <p className="text-xs text-gray-400">{RETURN_CODES[row.returnCode] || "Unknown"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Return: {row.returnDate}</p>
                      <p className="text-xs text-gray-400">Settles: {row.settleDate}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-amber-600 font-medium">
                        +{row.client?.payment_frequency === "weekly" ? "5" : "1"} day term extension
                      </p>
                      <p className="text-xs text-gray-400">balance unchanged</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {notFound.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Invoice not found — will be skipped ({notFound.length})
            </p>
            <div className="space-y-1.5">
              {notFound.map((row, idx) => (
                <div key={idx} className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="font-mono">{row.invoice}</span>
                  <span>{row.merchant}</span>
                  <span>{money(row.returnAmount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={processing || matched.length === 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {processing ? "Importing..." : `Import ${matched.length} return${matched.length !== 1 ? "s" : ""}`}
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

  // ── Step: Done ───────────────────────────────────────────
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
            {result.imported} imported · {result.skipped} duplicates skipped · {result.notFound} not found
          </p>
        </div>
      </div>
      <button
        onClick={reset}
        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        Import another batch
      </button>
    </div>
  );
}