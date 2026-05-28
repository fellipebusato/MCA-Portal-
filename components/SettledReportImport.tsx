"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { money, toDateStr, isBusinessDay } from "@/lib/holidays";
import { logActivity } from "@/components/ActivityLog";
import type { Client } from "@/lib/types";

type SettledRow = {
  invoice: string;
  date: string;
  amount: number;
  client: Client | null;
  status: "matched" | "unmatched";
  achDate: string;
  settleDate: string;
};

type ImportResult = {
  imported: number;
  skipped: number;
  unmatched: number;
};

function parseMoney(raw: string): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/[$,\s]/g, "")) || 0;
}

function normalizeInvoice(raw: string): string {
  return raw.trim().replace(/^invoice\s*#?/i, "").toUpperCase();
}

function parseDateValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.includes("T")) return value.split("T")[0];
  const parts = value.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return value;
}

function parseXLSRows(text: string): { invoice: string; date: string; amount: number }[] {
  const results: { invoice: string; date: string; amount: number }[] = [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    const ns = "urn:schemas-microsoft-com:office:spreadsheet";
    let rows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "Row"));
    if (rows.length === 0) rows = Array.from(xmlDoc.getElementsByTagName("Row"));
    if (rows.length === 0) return results;

    const headerRow = rows[0];
    let headerCells = Array.from(headerRow.getElementsByTagNameNS(ns, "Data"));
    if (headerCells.length === 0) headerCells = Array.from(headerRow.getElementsByTagName("Data"));

    let typeCol = 1;
    let dateCol = 2;
    let invoiceCol = 3;
    let amountCol = 6;

    headerCells.forEach((cell, idx) => {
      const val = (cell.textContent || "").trim().toLowerCase();
      if (val === "type") typeCol = idx;
      if (val.includes("date")) dateCol = idx;
      if (val.includes("inv") || val === "inv#" || val === "invoice") invoiceCol = idx;
      if (val === "amount") amountCol = idx;
    });

    for (let i = 1; i < rows.length; i++) {
      let cells = Array.from(rows[i].getElementsByTagNameNS(ns, "Data"));
      if (cells.length === 0) cells = Array.from(rows[i].getElementsByTagName("Data"));
      if (cells.length < 4) continue;

      const type = (cells[typeCol]?.textContent || "").trim().toLowerCase();
      const dateRaw = (cells[dateCol]?.textContent || "").trim();
      const invoice = (cells[invoiceCol]?.textContent || "").trim();
      const amount = parseMoney(cells[amountCol]?.textContent || "");

      if (!invoice || !amount || isNaN(amount)) continue;
      if (!type || !["payment", "credit memo"].includes(type)) continue;

      const date = parseDateValue(dateRaw);
      if (!date) continue;

      results.push({ invoice, date, amount });
    }
  } catch (err) {
    console.error("Settled report parse error:", err);
  }
  return results;
}

function parseCSVRows(text: string): { invoice: string; date: string; amount: number }[] {
  const results: { invoice: string; date: string; amount: number }[] = [];
  const rows = text.split("\n").map(r => r.trim()).filter(Boolean);
  if (rows.length <= 1) return results;

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(",");
    const invoice = cols[3]?.trim();
    const date = cols[2]?.trim();
    const amount = parseMoney(cols[6]?.trim() || "0");
    if (!invoice || !date || !amount || isNaN(amount)) continue;
    results.push({ invoice, date: parseDateValue(date), amount });
  }

  return results;
}

function subtractBusinessDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00");
  let subtracted = 0;
  while (subtracted < days) {
    date.setDate(date.getDate() - 1);
    if (isBusinessDay(date)) subtracted++;
  }
  return toDateStr(date);
}


export default function SettledReportImport({
  clients,
  onImportComplete,
}: {
  clients: Client[];
  onImportComplete: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [parsedRows, setParsedRows] = useState<SettledRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult>({ imported: 0, skipped: 0, unmatched: 0 });

  function buildRows(text: string): SettledRow[] {
    const rawRows = parseXLSRows(text);
    const rows = rawRows.length > 0 ? rawRows : parseCSVRows(text);
    return rows.map(row => {
      const normalizedInvoice = normalizeInvoice(row.invoice);
      const client = clients.find(c => c.invoice.trim().toUpperCase() === normalizedInvoice) || null;
      const date = parseDateValue(row.date);
      const achDate = date ? subtractBusinessDays(date, 4) : "";
      const status: "matched" | "unmatched" = client ? "matched" : "unmatched";
      return {
        invoice: normalizedInvoice,
        date,
        amount: row.amount,
        client,
        status,
        achDate,
        settleDate: date,
      };
    }).filter(r => r.invoice && r.date && r.amount > 0);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");

    const reader = new FileReader();
    reader.onload = ev => {
      const text = String(ev.target?.result || "");
      const rows = buildRows(text);
      if (rows.length === 0) {
        setError("We could not parse any settled rows from that file. Please upload the NetSuite XML Spreadsheet export.");
        setParsedRows([]);
        setStep("upload");
        return;
      }
      setParsedRows(rows);
      setStep("review");
    };
    reader.onerror = () => {
      setError("Unable to read the uploaded file. Please try a different export.");
      setParsedRows([]);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setProcessing(true);
    let imported = 0;
    let skipped = 0;

    const matched = parsedRows.filter(row => row.client);
    const unmatched = parsedRows.filter(row => !row.client);
    const groupedByInvoice = new Map<string, SettledRow[]>();

    for (const row of matched) {
      const invoices = groupedByInvoice.get(row.invoice) || [];
      invoices.push(row);
      groupedByInvoice.set(row.invoice, invoices);
    }

    for (const row of matched) {
      const existingReq = await supabase
        .from("payments")
        .select("id")
        .eq("invoice", row.invoice)
        .eq("ach_date", row.achDate)
        .eq("settlement_date", row.settleDate)
        .eq("debit", row.amount)
        .limit(1);

      if (existingReq.error) {
        console.error("Existing payment lookup failed", existingReq.error);
      }

      if (existingReq.data && existingReq.data.length > 0) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("payments").insert({
        invoice: row.invoice,
        payment_date: row.achDate,
        ach_date: row.achDate,
        settlement_date: row.settleDate,
        description: "Posted",
        credit: 0,
        debit: row.amount,
        returns: 0,
        running_balance: null,
        payment_status: "settled",
      });

      if (error) {
        if (error.code === "23505") {
          skipped++;
          continue;
        }
        console.error("Payment insert error:", error);
        skipped++;
        continue;
      }

      imported++;
    }

    for (const [invoice, clientRows] of Array.from(groupedByInvoice.entries())) {
      const client = clientRows[0].client;
      if (!client) continue;

      const { data: positions } = await supabase
        .from("positions")
        .select("id, balance, status, invoice")
        .eq("client_id", client.id);

      if (positions && positions.length > 0) {
        for (const row of clientRows) {
          const position = positions.find((p: any) => (p.invoice || "").trim().toUpperCase() === row.invoice);
          if (!position) continue;
          const currentBalance = Number(position.balance || 0);
          const nextBalance = Math.max(0, currentBalance - row.amount);
          await supabase.from("positions").update({
            balance: nextBalance,
            status: nextBalance === 0 ? "completed" : "active",
          }).eq("id", position.id);
        }

        const { data: updatedPositions } = await supabase
          .from("positions")
          .select("balance")
          .eq("client_id", client.id);

        const combinedBalance = (updatedPositions || []).reduce((sum: number, p: any) => sum + Number(p.balance || 0), 0);
        const amountSettled = clientRows.reduce((sum: number, r: SettledRow) => sum + r.amount, 0);

        await supabase.from("clients").update({
          balance: combinedBalance,
          paid: Number(client.paid || 0) + amountSettled,
        }).eq("id", client.id);
      } else {
        const amountSettled = clientRows.reduce((sum: number, r: SettledRow) => sum + r.amount, 0);
        const newBalance = Math.max(0, Number(client.balance || 0) - amountSettled);
        await supabase.from("clients").update({
          balance: newBalance,
          paid: Number(client.paid || 0) + amountSettled,
        }).eq("id", client.id);
      }

    }

    for (const row of matched) {
      await logActivity(
        row.invoice,
        "funded",
        "Settled payment imported",
        `${money(row.amount)} settled on ${row.date}`
      );
    }

    setResult({
      imported,
      skipped,
      unmatched: unmatched.length,
    });
    setStep("done");
    setProcessing(false);
    onImportComplete();
  }

  function reset() {
    setFileName("");
    setError("");
    setParsedRows([]);
    setStep("upload");
    setResult({ imported: 0, skipped: 0, unmatched: 0 });
  }

  const matchedRows = parsedRows.filter(row => row.status === "matched");
  const unmatchedRows = parsedRows.filter(row => row.status === "unmatched");
  const totalAmount = matchedRows.reduce((sum: number, row: SettledRow) => sum + row.amount, 0);

  if (step === "upload") {
    return (
      <div className="rounded-xl bg-white border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <span className="text-lg">📄</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Import 5PM settled report</p>
            <p className="text-xs text-gray-500 mt-1">Upload the NetSuite XML Spreadsheet export from the 5PM settlement report.</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-500">Upload file</label>
          <input
            type="file"
            accept=".xml,.xls,.csv,text/xml"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-700"
          />
          {fileName && (
            <p className="text-xs text-gray-500">Selected file: {fileName}</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="rounded-lg border border-dashed border-gray-200 bg-slate-50 p-3 text-xs text-gray-500">
            Expected format: NetSuite XML Spreadsheet rows with invoice, date, and amount.
          </div>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Review settlement import</p>
          <p className="text-xs text-gray-400 mt-1">Confirm matched invoices and row totals before applying.</p>
        </div>

        <div className="px-5 py-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Rows</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{parsedRows.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Matched</p>
            <p className="mt-2 text-sm font-semibold text-emerald-600">{matchedRows.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Amount</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{money(totalAmount)}</p>
          </div>
        </div>

        <div className="px-5 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs text-gray-500">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-3 font-semibold uppercase tracking-wider">Invoice</th>
                  <th className="py-3 font-semibold uppercase tracking-wider">Settle date</th>
                  <th className="py-3 font-semibold uppercase tracking-wider text-right">Amount</th>
                  <th className="py-3 font-semibold uppercase tracking-wider">Status</th>
                  <th className="py-3 font-semibold uppercase tracking-wider">Client</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row, index) => (
                  <tr key={`${row.invoice}-${index}`} className="border-b border-gray-100">
                    <td className="py-3 text-sm font-medium text-gray-900">{row.invoice}</td>
                    <td className="py-3 text-sm text-gray-600">{row.date}</td>
                    <td className="py-3 text-sm font-semibold text-right text-slate-900">{money(row.amount)}</td>
                    <td className={`py-3 text-sm font-medium ${row.status === "matched" ? "text-emerald-600" : "text-amber-600"}`}>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${row.status === "matched" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {row.status === "matched" ? "Matched" : "Unmatched"}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-gray-600">{row.client?.business_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unmatchedRows.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800">Unmatched invoices</p>
              <p className="text-xs text-amber-700 mt-1">These rows did not match an existing portal invoice and will not be imported.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {unmatchedRows.slice(0, 8).map((row, idx) => (
                  <div key={idx} className="rounded-xl bg-white border border-amber-100 px-3 py-2 text-xs text-amber-800">
                    {row.invoice} · {money(row.amount)} · {row.date}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-gray-500">Only matched rows will be written to Supabase. Unmatched invoices are shown above.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleImport}
              disabled={processing || matchedRows.length === 0}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {processing ? "Applying…" : `Apply ${matchedRows.length} matched row${matchedRows.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ← Choose another file
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <span className="text-lg">✅</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Import complete</p>
          <p className="text-xs text-gray-500 mt-1">
            {result.imported} settled row{result.imported !== 1 ? "s" : ""} imported.
            {result.skipped > 0 && ` ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""} skipped.`}
            {result.unmatched > 0 && ` ${result.unmatched} unmatched row${result.unmatched !== 1 ? "s" : ""} ignored.`}
          </p>
        </div>
      </div>
      <button
        onClick={reset}
        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Import another report
      </button>
    </div>
  );
}
