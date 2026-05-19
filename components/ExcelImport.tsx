"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

interface ClientRow {
  invoice: string;
  business_name: string;
  sales_rep: string;
  ach_works_name: string;
  funded_date: string;
  funded: number;
  payback: number;
  paid: number;
  balance: number;
  payment: number;
  percentage_paid: number;
  trigger_status: string;
  trigger_shortfall: number;
  default_watch: boolean;
  status: string;
}

interface MonthlyRow {
  invoice: string;
  year: number;
  month: number;
  total_paid: number;
}

interface PaymentRow {
  invoice: string;
  payment_date: string;
  settlement_date: string;
  ach_date: string;
  description: string;
  credit: number;
  debit: number;
  returns: number;
}

const S = {
  wrap: { padding: "32px", maxWidth: 860, margin: "0 auto" } as React.CSSProperties,
  h1: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: "var(--ink-1)", marginBottom: 4 } as React.CSSProperties,
  sub: { fontSize: 12, color: "var(--ink-4)", marginBottom: 24, lineHeight: 1.6 } as React.CSSProperties,
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px", boxShadow: "0 2px 10px rgba(30,16,4,0.05)", marginBottom: 18 } as React.CSSProperties,
  btnP: { padding: "10px 24px", borderRadius: 8, border: "1px solid rgba(200,146,42,0.4)", background: "#C8922A", color: "#0D1B2A", fontSize: 13, fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
  btnS: { padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" } as React.CSSProperties,
  stat: { background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "14px 16px", textAlign: "center" as const } as React.CSSProperties,
  statNum: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: "#C8922A" },
  statLbl: { fontSize: 10, color: "var(--ink-4)", marginTop: 2, textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  bar: { background: "var(--border)", borderRadius: 99, height: 8, overflow: "hidden", marginTop: 8 } as React.CSSProperties,
  fill: (p: number) => ({ height: "100%", background: "#C8922A", width: `${p}%`, transition: "width 0.3s", borderRadius: 99 } as React.CSSProperties),
  err: { padding: "10px 14px", background: "#FFF1F2", border: "1px solid #FCA5A5", borderRadius: 7, fontSize: 12, color: "#991B1B", marginTop: 10 } as React.CSSProperties,
};

// Parse a value that might be a number, string with commas, or null
function safeNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).replace(/[$,%]/g, "").replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Check if a column header is a date column (format: M/D/YYYY or YYYY-MM-DD or Excel serial)
function isDateCol(key: string): boolean {
  // Match patterns like "5/21/2026", "2026-05-21", "05/21/2026"
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(key) ||
    /^\d{4}-\d{2}-\d{2}/.test(key) ||
    /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(key);
}

function parseColDate(key: string): Date | null {
  try {
    const d = new Date(key);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2030) return d;
    return null;
  } catch { return null; }
}

function dateToStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function ExcelImport({ onComplete }: { onComplete: () => void }) {
  const [preview, setPreview] = useState<{ clients: ClientRow[]; monthly: MonthlyRow[]; payments: PaymentRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setDebugInfo("");

    try {
      const buf = await file.arrayBuffer();
      // Use raw:true to get raw values, not formatted strings
      // cellDates:false so dates come as serial numbers we handle manually
      const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Get the sheet as array of arrays to find the header row
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!aoa.length) { setError("No data found in file."); return; }

      // Find header row — look for row containing "INVOICE"
      let headerIdx = 0;
      for (let i = 0; i < Math.min(5, aoa.length); i++) {
        if (aoa[i]?.some((v: any) => String(v || "").toUpperCase() === "INVOICE")) {
          headerIdx = i;
          break;
        }
      }

      const headers: string[] = (aoa[headerIdx] || []).map((v: any) => String(v == null ? "" : v));
      const dataRows = aoa.slice(headerIdx + 1);

      // Helper to get column index
      const col = (name: string) => headers.findIndex(h => h === name);
      const colI = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

      // Map header indices
      const iInvoice = col("INVOICE");
      const iName = col("BUSINESS NAME");
      const iSalesRep = col("Sales Rep");
      const iACH = col("ACHWorks");
      const iFundedDate = col("Date Funded");
      const iFunded = col("FUNDED");
      const iPayback = col("PAYBACK");
      const iPayment = col("Daily Payment");
      const iBalance = col("Merchants Balance");
      const iPctPaid = col("Percentage Paid");
      const iTrigger = col("TRIGGER");
      const iMar = col("Mar");
      const iCompleted = col("Completed");
      const iDefaultWatch = col("Default Watch");

      setDebugInfo(`Headers found: INVOICE@${iInvoice}, FUNDED@${iFunded}, PAYBACK@${iPayback}, Balance@${iBalance}, TRIGGER@${iTrigger}`);

      if (iInvoice < 0 || iFunded < 0) {
        setError(`Could not find required columns. Found ${headers.length} columns. First 10: ${headers.slice(0, 10).join(", ")}`);
        return;
      }

      // Identify date columns — Excel stores dates as serial numbers
      // Date columns are after the known static columns
      // We know static columns end around index 39, date columns start after that
      // Excel date serial: 1 = Jan 1, 1900. 2026-05-21 ≈ 45797
      const EXCEL_DATE_MIN = 40000; // ~2009
      const EXCEL_DATE_MAX = 50000; // ~2036

      // Find date column indices by checking if the header is a number in date range
      // OR if it looks like a date string
      const dateColIndices: { idx: number; date: Date }[] = [];
      headers.forEach((h, idx) => {
        // Try numeric serial
        const serial = parseFloat(h);
        if (!isNaN(serial) && serial > EXCEL_DATE_MIN && serial < EXCEL_DATE_MAX) {
          // Convert Excel serial to date
          const d = new Date((serial - 25569) * 86400 * 1000);
          dateColIndices.push({ idx, date: d });
          return;
        }
        // Try date string formats
        if (isDateCol(h)) {
          const d = parseColDate(h);
          if (d) dateColIndices.push({ idx, date: d });
        }
      });

      // If no date cols found by serial, try looking at actual cell values in the header row
      // Some exports format dates as strings like "5/21/2026"
      if (dateColIndices.length === 0) {
        headers.forEach((h, idx) => {
          // Check if any data row has a numeric value that could be a payment
          // Skip known static columns
          if (idx < 40) return;
          const sampleVals = dataRows.slice(0, 10).map(r => r?.[idx]).filter(v => v != null);
          const hasNumeric = sampleVals.some(v => typeof v === "number" && v > 0 && v < 100000);
          if (hasNumeric && h) {
            // Try to parse header as date
            const d = parseColDate(String(h));
            if (d) dateColIndices.push({ idx, date: d });
          }
        });
      }

      const mayCols = dateColIndices.filter(({ date: d }) => d.getFullYear() === 2026 && d.getMonth() === 4);
      const priorCols = dateColIndices.filter(({ date: d }) => !(d.getFullYear() === 2026 && d.getMonth() === 4));

      // Build month map
      const monthMap = new Map<string, { year: number; month: number; indices: number[] }>();
      priorCols.forEach(({ idx, date: d }) => {
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!monthMap.has(key)) monthMap.set(key, { year: d.getFullYear(), month: d.getMonth() + 1, indices: [] });
        monthMap.get(key)!.indices.push(idx);
      });

      const clients: ClientRow[] = [];
      const monthly: MonthlyRow[] = [];
      const payments: PaymentRow[] = [];

      for (const row of dataRows) {
        if (!row || !row[iInvoice]) continue;
        const invoice = String(row[iInvoice]).trim();
        if (!invoice || invoice === "INVOICE") continue;
        if (iCompleted >= 0 && String(row[iCompleted] || "").toLowerCase() === "yes") continue;

        const funded = safeNum(row[iFunded]);
        const payback = safeNum(row[iPayback]);
        const balance = safeNum(row[iBalance]);
        const payment = safeNum(row[iPayment]);
        const paid = payback - balance;
        const pctPaid = payback > 0 ? paid / payback : 0;

        const triggerRaw = row[iTrigger];
        const triggerBad = triggerRaw != null && triggerRaw !== "Good" && triggerRaw !== "";
        const triggerShortfall = triggerBad ? safeNum(triggerRaw) : 0;

        // Funded date — Excel serial to date
        let fundedDateStr = "";
        if (iFundedDate >= 0 && row[iFundedDate] != null) {
          const fd = row[iFundedDate];
          if (typeof fd === "number" && fd > EXCEL_DATE_MIN) {
            const d = new Date((fd - 25569) * 86400 * 1000);
            fundedDateStr = dateToStr(d);
          } else if (typeof fd === "string") {
            const d = parseColDate(fd);
            if (d) fundedDateStr = dateToStr(d);
          }
        }

        clients.push({
          invoice,
          business_name: String(row[iName] || "").trim(),
          sales_rep: iSalesRep >= 0 ? String(row[iSalesRep] || "").trim() : "",
          ach_works_name: iACH >= 0 ? String(row[iACH] || "").trim() : "",
          funded_date: fundedDateStr,
          funded: Math.round(funded * 100) / 100,
          payback: Math.round(payback * 100) / 100,
          paid: Math.round(paid * 100) / 100,
          balance: Math.round(balance * 100) / 100,
          payment: Math.round(payment * 100) / 100,
          percentage_paid: Math.round(pctPaid * 1000000) / 1000000,
          trigger_status: triggerBad ? "Bad" : "Good",
          trigger_shortfall: Math.round(triggerShortfall * 100) / 100,
          default_watch: iDefaultWatch >= 0 ? String(row[iDefaultWatch] || "").toLowerCase() === "yes" : false,
          status: iMar >= 0 && row[iMar] === "Bad" ? "Needs Attention" : "Good Standing",
        });

        // Monthly summaries
        monthMap.forEach(({ year, month, indices }) => {
          const total = indices.reduce((s, idx) => {
            const v = safeNum(row[idx]);
            return s + (v > 0 ? v : 0);
          }, 0);
          if (total > 0) monthly.push({ invoice, year, month, total_paid: Math.round(total * 100) / 100 });
        });

        // May 2026 individual payments
        mayCols.forEach(({ idx, date: d }) => {
          const v = safeNum(row[idx]);
          if (v > 0) {
            const dateStr = dateToStr(d);
            payments.push({ invoice, payment_date: dateStr, settlement_date: dateStr, ach_date: dateStr, description: "Posted", credit: 0, debit: Math.round(v * 100) / 100, returns: 0 });
          }
        });
      }

      if (clients.length === 0) {
        setError("No clients parsed. Check that the file has INVOICE and FUNDED columns.");
        return;
      }

      setPreview({ clients, monthly, payments });
      setDebugInfo(`Parsed ${clients.length} clients, ${monthly.length} monthly summaries, ${payments.length} May payments. Date cols found: ${dateColIndices.length} (May: ${mayCols.length}, Prior: ${priorCols.length})`);

    } catch (err: any) {
      setError(`Error reading file: ${err.message}`);
    }
  }

  async function runImport() {
    if (!preview) return;
    setImporting(true); setProgress(0); setError("");

    const BATCH = 50;
    const total = preview.clients.length + preview.monthly.length + preview.payments.length;
    let done = 0;
    const tick = (n: number) => { done += n; setProgress(Math.min(99, Math.round((done / total) * 100))); };

    try {
      // Step 1 — Clients
      setProgressLabel("Importing clients...");
      for (let i = 0; i < preview.clients.length; i += BATCH) {
        const batch = preview.clients.slice(i, i + BATCH).map(c => ({
          invoice: c.invoice, business_name: c.business_name, owner_name: c.business_name,
          client_email: "", sales_rep: c.sales_rep || null, ach_works_name: c.ach_works_name || null,
          funded_date: c.funded_date || null, funded: c.funded, funded_amount: c.funded,
          payback: c.payback, payback_amount: c.payback, paid: c.paid, balance: c.balance,
          payment: c.payment, payment_frequency: "daily", percentage_paid: c.percentage_paid,
          trigger_status: c.trigger_status, trigger_shortfall: c.trigger_shortfall,
          default_watch: c.default_watch, status: c.status,
        }));
        const { error: e } = await supabase.from("clients").upsert(batch, { onConflict: "invoice" });
        if (e) { setError(`Client import error: ${e.message}`); setImporting(false); return; }
        tick(batch.length);
      }

      // Step 2 — Monthly summaries
      setProgressLabel("Importing monthly summaries...");
      for (let i = 0; i < preview.monthly.length; i += BATCH) {
        const batch = preview.monthly.slice(i, i + BATCH);
        const { error: e } = await supabase.from("monthly_summaries").upsert(batch, { onConflict: "invoice,year,month" });
        if (e) console.error("monthly:", e.message);
        tick(batch.length);
      }

      // Step 3 — May payments
      setProgressLabel("Importing May 2026 payments...");
      for (let i = 0; i < preview.payments.length; i += BATCH) {
        const batch = preview.payments.slice(i, i + BATCH);
        const { error: e } = await supabase.from("payments").upsert(batch, { onConflict: "invoice,payment_date" });
        if (e) console.error("payments:", e.message);
        tick(batch.length);
      }

      setProgress(100); setProgressLabel("Import complete!"); setComplete(true);
    } catch (err: any) {
      setError(`Import failed: ${err.message}`); setImporting(false);
    }
  }

  if (complete && preview) {
    const totalFunded = preview.clients.reduce((s, c) => s + c.funded, 0);
    const totalBalance = preview.clients.reduce((s, c) => s + c.balance, 0);
    const triggerBad = preview.clients.filter(c => c.trigger_status === "Bad").length;
    return (
      <div style={S.wrap}>
        <div style={{ ...S.card, textAlign: "center", padding: 52 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: "var(--ink-1)", marginBottom: 10 }}>Import Complete</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, maxWidth: 600, margin: "20px auto 28px" }}>
            {[
              { n: preview.clients.length.toLocaleString(), l: "Clients" },
              { n: `$${(totalFunded / 1000000).toFixed(1)}M`, l: "Total Funded" },
              { n: `$${(totalBalance / 1000000).toFixed(1)}M`, l: "Open Balance" },
              { n: triggerBad.toString(), l: "Trigger Risk" },
            ].map(({ n, l }) => (
              <div key={l} style={S.stat}><div style={S.statNum}>{n}</div><div style={S.statLbl}>{l}</div></div>
            ))}
          </div>
          <button onClick={onComplete} style={S.btnP}>Go to Dashboard →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Import Active Deals</div>
      <div style={S.sub}>Upload your <strong>active_deals.xlsx</strong> file to import all 580 active clients, monthly summaries, and May 2026 payments.</div>

      {!preview && !importing && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>Select active_deals.xlsx</div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ fontSize: 13, color: "var(--ink-2)" }} />
          {debugInfo && <div style={{ marginTop: 10, fontSize: 10, color: "var(--ink-4)", fontFamily: "monospace" }}>{debugInfo}</div>}
          {error && <div style={S.err}>{error}</div>}
        </div>
      )}

      {preview && !importing && (
        <>
          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Import Preview</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { n: preview.clients.length.toLocaleString(), l: "Clients" },
                { n: `$${(preview.clients.reduce((s, c) => s + c.funded, 0) / 1000000).toFixed(1)}M`, l: "Total Funded" },
                { n: preview.monthly.length.toLocaleString(), l: "Monthly Summaries" },
                { n: preview.payments.length.toLocaleString(), l: "May Payments" },
              ].map(({ n, l }) => (
                <div key={l} style={S.stat}><div style={S.statNum}>{n}</div><div style={S.statLbl}>{l}</div></div>
              ))}
            </div>
            {debugInfo && <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "monospace", marginBottom: 12 }}>{debugInfo}</div>}
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 16 }}>
              {preview.clients.filter(c => c.trigger_status === "Bad").length} trigger risk · {preview.clients.filter(c => c.status === "Needs Attention").length} Needs Attention · {preview.clients.filter(c => c.percentage_paid >= 0.5 && c.status === "Good Standing").length} eligible for renewal
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={runImport} style={S.btnP}>Import {preview.clients.length} Deals →</button>
              <button onClick={() => { setPreview(null); setDebugInfo(""); }} style={S.btnS}>Cancel</button>
            </div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>First 10 clients preview</div>
            <div style={{ overflowX: "auto" as const }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>{["Invoice", "Business", "Sales Rep", "Funded $", "Balance $", "Payment", "Trigger"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 9px", background: "#0D1B2A", color: "#E8D5A3", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" as const }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {preview.clients.slice(0, 10).map((c, i) => (
                    <tr key={c.invoice} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--parchment-2)" }}>
                      <td style={{ padding: "6px 9px", fontFamily: "monospace", fontSize: 10 }}>{c.invoice}</td>
                      <td style={{ padding: "6px 9px", fontWeight: 600, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.business_name}</td>
                      <td style={{ padding: "6px 9px", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: "var(--ink-3)" }}>{c.sales_rep}</td>
                      <td style={{ padding: "6px 9px" }}>${c.funded.toLocaleString()}</td>
                      <td style={{ padding: "6px 9px" }}>${c.balance.toLocaleString()}</td>
                      <td style={{ padding: "6px 9px" }}>${c.payment}</td>
                      <td style={{ padding: "6px 9px" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: c.trigger_status === "Good" ? "#F0FDF4" : "#FFF1F2", color: c.trigger_status === "Good" ? "#166534" : "#991B1B" }}>
                          {c.trigger_status === "Good" ? "Good" : `$${c.trigger_shortfall.toFixed(0)} short`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {importing && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>{progressLabel}</div>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 10 }}>{progress}% complete</div>
          <div style={S.bar}><div style={S.fill(progress)} /></div>
        </div>
      )}

      {error && !importing && <div style={S.err}>{error}</div>}
    </div>
  );
}
