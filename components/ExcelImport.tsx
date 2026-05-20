"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────

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
  payment_date: string;      // ACH pull date (settlement - 4 biz days)
  ach_date: string;          // same as payment_date
  settlement_date: string;   // the date in the Excel column
  description: string;
  credit: number;
  debit: number;
  returns: number;
  running_balance: null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function safeNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).replace(/[$,%\s]/g, "").replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function excelSerialToDate(serial: number): Date {
  // Excel serial: days since Jan 1, 1900 (with leap year bug)
  return new Date((serial - 25569) * 86400 * 1000);
}

function dateToStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function subtractBizDays(dateStr: string, days: number): string {
  const parts = dateStr.split("-");
  let d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  let subtracted = 0;
  while (subtracted < days) {
    d = new Date(d.getTime() - 86400000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) subtracted++; // skip Sat=6, Sun=0
  }
  return dateToStr(d);
}

function parseHeaderDate(header: any): Date | null {
  if (header == null) return null;
  // Excel serial number
  if (typeof header === "number" && header > 40000 && header < 52000) {
    return excelSerialToDate(header);
  }
  // String date
  if (typeof header === "string" || header instanceof Date) {
    const d = new Date(header);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2035) {
      return d;
    }
  }
  return null;
}

const CUTOFF = new Date(Date.UTC(2026, 0, 1)); // Jan 1 2026 — individual payments from here
const EXCEL_MIN = 40000;
const EXCEL_MAX = 52000;

// ── Styles ────────────────────────────────────────────────────────────────

const S = {
  wrap: { padding: "32px", maxWidth: 860, margin: "0 auto" } as React.CSSProperties,
  h1: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: "var(--ink-1)", marginBottom: 4 } as React.CSSProperties,
  sub: { fontSize: 12, color: "var(--ink-4)", marginBottom: 24, lineHeight: 1.6 } as React.CSSProperties,
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px", boxShadow: "0 2px 10px rgba(30,16,4,0.05)", marginBottom: 18 } as React.CSSProperties,
  btnP: { padding: "10px 24px", borderRadius: 8, border: "1px solid rgba(200,146,42,0.4)", background: "#C8922A", color: "#0D1B2A", fontSize: 13, fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
  btnS: { padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border-mid)", background: "transparent", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" } as React.CSSProperties,
  stat: { background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "14px 16px", textAlign: "center" as const } as React.CSSProperties,
  statNum: { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: "#C8922A" },
  statLbl: { fontSize: 10, color: "var(--ink-4)", marginTop: 2, textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  bar: { background: "var(--border)", borderRadius: 99, height: 8, overflow: "hidden", marginTop: 8 } as React.CSSProperties,
  fill: (p: number) => ({ height: "100%", background: "#C8922A", width: `${p}%`, transition: "width 0.3s", borderRadius: 99 } as React.CSSProperties),
  err: { padding: "10px 14px", background: "#FFF1F2", border: "1px solid #FCA5A5", borderRadius: 7, fontSize: 12, color: "#991B1B", marginTop: 10 } as React.CSSProperties,
  debug: { padding: "8px 12px", background: "var(--parchment-2)", borderRadius: 6, fontSize: 10, color: "var(--ink-4)", fontFamily: "monospace", marginTop: 8, lineHeight: 1.6 } as React.CSSProperties,
};

// ── Component ─────────────────────────────────────────────────────────────

export default function ExcelImport({ onComplete }: { onComplete: () => void }) {
  const [preview, setPreview] = useState<{
    clients: ClientRow[];
    monthly: MonthlyRow[];
    payments: PaymentRow[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setDebug(""); setPreview(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Read as array of arrays to have full control
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!aoa.length) { setError("No data found in file."); return; }

      // Find header row containing "INVOICE"
      let headerIdx = 0;
      for (let i = 0; i < Math.min(5, aoa.length); i++) {
        if (aoa[i]?.some((v: any) => String(v || "").trim().toUpperCase() === "INVOICE")) {
          headerIdx = i; break;
        }
      }

      const headers: any[] = aoa[headerIdx] || [];
      const dataRows = aoa.slice(headerIdx + 1);

      // Find static column indices by name
      const findCol = (name: string) => headers.findIndex((h: any) => String(h || "").trim() === name);
      const iInvoice     = findCol("INVOICE");
      const iName        = findCol("BUSINESS NAME");
      const iSalesRep    = findCol("Sales Rep");
      const iACH         = findCol("ACHWorks");
      const iFundedDate  = findCol("Date Funded");
      const iFunded      = findCol("FUNDED");
      const iPayback     = findCol("PAYBACK");
      const iPayment     = findCol("Daily Payment");
      const iBalance     = findCol("Merchants Balance");
      const iTrigger     = findCol("TRIGGER");
      const iMar         = findCol("Mar");
      const iCompleted   = findCol("Completed");
      const iDefaultWatch = findCol("Default Watch");

      if (iInvoice < 0 || iFunded < 0) {
        setError(`Required columns not found. Headers sample: ${headers.slice(0, 8).map((h: any) => String(h || "")).join(", ")}`);
        return;
      }

      // Identify date columns — headers that are Excel serial numbers in date range
      // or look like date strings
      const indivCols: { idx: number; settlementStr: string }[] = [];  // Jan 2026+
      const summaryCols: { idx: number; year: number; month: number }[] = []; // Before Jan 2026

      headers.forEach((h: any, idx: number) => {
        if (idx <= 39) return; // Skip known static columns

        let d: Date | null = null;

        // Try as Excel serial
        if (typeof h === "number" && h > EXCEL_MIN && h < EXCEL_MAX) {
          d = excelSerialToDate(h);
        }
        // Try as string date
        else if (h != null && h !== "") {
          const parsed = new Date(String(h));
          if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2015 && parsed.getFullYear() < 2030) {
            d = parsed;
          }
        }

        if (!d) return;

        const utcD = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const settlementStr = dateToStr(utcD);

        if (utcD >= CUTOFF) {
          // Jan 2026+ → individual payment record
          indivCols.push({ idx, settlementStr });
        } else {
          // Before Jan 2026 → monthly summary
          summaryCols.push({ idx, year: utcD.getUTCFullYear(), month: utcD.getUTCMonth() + 1 });
        }
      });

      // Build month map for summaries
      const monthMap = new Map<string, { year: number; month: number; indices: number[] }>();
      summaryCols.forEach(({ idx, year, month }) => {
        const key = `${year}-${month}`;
        if (!monthMap.has(key)) monthMap.set(key, { year, month, indices: [] });
        monthMap.get(key)!.indices.push(idx);
      });

      setDebug(`Found ${indivCols.length} individual date cols (Jan 2026+), ${monthMap.size} summary months, ${summaryCols.length} prior date cols`);

      const clients: ClientRow[] = [];
      const monthly: MonthlyRow[] = [];
      const payments: PaymentRow[] = [];

      for (const row of dataRows) {
        if (!row || row[iInvoice] == null) continue;
        const invoice = String(row[iInvoice]).trim();
        if (!invoice || invoice.toUpperCase() === "INVOICE") continue;
        if (iCompleted >= 0 && String(row[iCompleted] || "").toLowerCase() === "yes") continue;

        const funded   = safeNum(row[iFunded]);
        const payback  = safeNum(row[iPayback]);
        const balance  = safeNum(row[iBalance]);
        const payment  = safeNum(row[iPayment]);
        const paid     = payback - balance;
        const pctPaid  = payback > 0 ? paid / payback : 0;

        const triggerRaw   = row[iTrigger];
        const triggerBad   = triggerRaw != null && triggerRaw !== "Good" && String(triggerRaw).trim() !== "";
        const triggerShort = triggerBad ? safeNum(triggerRaw) : 0;

        // Funded date
        let fundedDateStr = "";
        if (iFundedDate >= 0 && row[iFundedDate] != null) {
          const fd = row[iFundedDate];
          if (typeof fd === "number" && fd > EXCEL_MIN) {
            fundedDateStr = dateToStr(excelSerialToDate(fd));
          } else {
            const pd = new Date(String(fd));
            if (!isNaN(pd.getTime())) fundedDateStr = pd.toISOString().split("T")[0];
          }
        }

        clients.push({
          invoice,
          business_name:    String(row[iName] || "").trim(),
          sales_rep:        iSalesRep >= 0 ? String(row[iSalesRep] || "").trim() : "",
          ach_works_name:   iACH >= 0 ? String(row[iACH] || "").trim() : "",
          funded_date:      fundedDateStr,
          funded:           Math.round(funded * 100) / 100,
          payback:          Math.round(payback * 100) / 100,
          paid:             Math.round(paid * 100) / 100,
          balance:          Math.round(balance * 100) / 100,
          payment:          Math.round(payment * 100) / 100,
          percentage_paid:  Math.round(pctPaid * 1000000) / 1000000,
          trigger_status:   triggerBad ? "Bad" : "Good",
          trigger_shortfall: Math.round(triggerShort * 100) / 100,
          default_watch:    iDefaultWatch >= 0 ? String(row[iDefaultWatch] || "").toLowerCase() === "yes" : false,
          status:           iMar >= 0 && row[iMar] === "Bad" ? "Needs Attention" : "Good Standing",
        });

        // Individual payments — Jan 2026+
        // Settlement date is the Excel column date
        // ACH date = settlement - 4 business days
        indivCols.forEach(({ idx, settlementStr }) => {
          const v = safeNum(row[idx]);
          if (v <= 0) return;
          const achDate = subtractBizDays(settlementStr, 4);
          payments.push({
            invoice,
            payment_date:    achDate,       // actual pull date
            ach_date:        achDate,
            settlement_date: settlementStr, // when it cleared in NetSuite
            description:     "Posted",
            credit:          0,
            debit:           Math.round(v * 100) / 100,
            returns:         0,
            running_balance: null,
          });
        });

        // Monthly summaries — before Jan 2026
        monthMap.forEach(({ year, month, indices }) => {
          const total = indices.reduce((s, idx) => {
            const v = safeNum(row[idx]);
            return s + (v > 0 ? v : 0);
          }, 0);
          if (total > 0) monthly.push({
            invoice,
            year,
            month,
            total_paid: Math.round(total * 100) / 100,
          });
        });
      }

      if (clients.length === 0) {
        setError("No clients found. Verify the file has INVOICE and FUNDED columns.");
        return;
      }

      setPreview({ clients, monthly, payments });
      setDebug(prev => prev + ` | Parsed: ${clients.length} clients, ${payments.length} payments, ${monthly.length} monthly summaries`);

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
    const tick = (n: number) => {
      done += n;
      setProgress(Math.min(99, Math.round((done / total) * 100)));
    };

    try {
      // ── Step 1: Clients ──────────────────────────────────────────────────
      setProgressLabel(`Importing ${preview.clients.length} clients...`);
      for (let i = 0; i < preview.clients.length; i += BATCH) {
        const batch = preview.clients.slice(i, i + BATCH).map(c => ({
          invoice:          c.invoice,
          business_name:    c.business_name,
          owner_name:       c.business_name,
          client_email:     "",
          sales_rep:        c.sales_rep || null,
          ach_works_name:   c.ach_works_name || null,
          funded_date:      c.funded_date || null,
          funded:           c.funded,
          funded_amount:    c.funded,
          payback:          c.payback,
          payback_amount:   c.payback,
          paid:             c.paid,
          balance:          c.balance,
          payment:          c.payment,
          payment_frequency: "daily",
          percentage_paid:  c.percentage_paid,
          trigger_status:   c.trigger_status,
          trigger_shortfall: c.trigger_shortfall,
          default_watch:    c.default_watch,
          status:           c.status,
        }));
        const { error: e } = await supabase.from("clients").upsert(batch, { onConflict: "invoice" });
        if (e) { setError(`Client import error: ${e.message}`); setImporting(false); return; }
        tick(batch.length);
      }

      // ── Step 2: Individual payments (Jan 2026+) ──────────────────────────
      setProgressLabel(`Importing ${preview.payments.length} payment records...`);
      for (let i = 0; i < preview.payments.length; i += BATCH) {
        const batch = preview.payments.slice(i, i + BATCH);
        // Use insert with onConflict do nothing — don't overwrite existing ACH Works / returns data
        const { error: e } = await supabase.from("payments").upsert(batch, {
          onConflict: "invoice,payment_date",
          ignoreDuplicates: true,
        });
        if (e) {
          // Log but don't fail — some may conflict with existing return records
          console.warn("Payment batch warning:", e.message);
        }
        tick(batch.length);
      }

      // ── Step 3: Monthly summaries (before Jan 2026) ──────────────────────
      setProgressLabel(`Importing ${preview.monthly.length} monthly summaries...`);
      for (let i = 0; i < preview.monthly.length; i += BATCH) {
        const batch = preview.monthly.slice(i, i + BATCH);
        const { error: e } = await supabase.from("monthly_summaries").upsert(batch, {
          onConflict: "invoice,year,month",
        });
        if (e) console.warn("Monthly summary warning:", e.message);
        tick(batch.length);
      }

      setProgress(100);
      setProgressLabel("Import complete!");
      setComplete(true);

    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
      setImporting(false);
    }
  }

  // ── Complete screen ───────────────────────────────────────────────────────

  if (complete && preview) {
    const totalFunded  = preview.clients.reduce((s, c) => s + c.funded, 0);
    const totalBalance = preview.clients.reduce((s, c) => s + c.balance, 0);
    const triggerBad   = preview.clients.filter(c => c.trigger_status === "Bad").length;
    return (
      <div style={S.wrap}>
        <div style={{ ...S.card, textAlign: "center", padding: 52 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: "var(--ink-1)", marginBottom: 10 }}>
            Import Complete
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, maxWidth: 600, margin: "20px auto 28px" }}>
            {[
              { n: preview.clients.length.toLocaleString(), l: "Clients" },
              { n: `$${(totalFunded / 1000000).toFixed(1)}M`, l: "Total Funded" },
              { n: `$${(totalBalance / 1000000).toFixed(1)}M`, l: "Open Balance" },
              { n: triggerBad.toString(), l: "Trigger Risk" },
            ].map(({ n, l }) => (
              <div key={l} style={S.stat}>
                <div style={S.statNum}>{n}</div>
                <div style={S.statLbl}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 24 }}>
            {preview.payments.length.toLocaleString()} individual payment records (Jan 2026+) · {preview.monthly.length.toLocaleString()} monthly summaries
          </div>
          <button onClick={onComplete} style={S.btnP}>Go to Dashboard →</button>
        </div>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Import Active Deals</div>
      <div style={S.sub}>
        Upload <strong>active_deals.xlsx</strong>. Imports all clients, individual payment records from Jan 2026 forward (with correct ACH pull dates), and monthly summaries for all prior months.
      </div>

      {!preview && !importing && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>
            Select active_deals.xlsx
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 16, lineHeight: 1.7 }}>
            Each payment date in the Excel = settlement date. The portal will calculate the ACH pull date automatically (settlement − 4 business days). Jan 2026+ payments → individual records. Before Jan 2026 → monthly summaries.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            style={{ fontSize: 13, color: "var(--ink-2)" }}
          />
          {debug && <div style={S.debug}>{debug}</div>}
          {error && <div style={S.err}>{error}</div>}
        </div>
      )}

      {preview && !importing && (
        <>
          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Import Preview
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { n: preview.clients.length.toLocaleString(), l: "Clients" },
                { n: `$${(preview.clients.reduce((s,c) => s+c.funded, 0)/1e6).toFixed(1)}M`, l: "Total Funded" },
                { n: preview.payments.length.toLocaleString(), l: "Payment Records" },
                { n: preview.monthly.length.toLocaleString(), l: "Monthly Summaries" },
              ].map(({ n, l }) => (
                <div key={l} style={S.stat}>
                  <div style={S.statNum}>{n}</div>
                  <div style={S.statLbl}>{l}</div>
                </div>
              ))}
            </div>
            {debug && <div style={{ ...S.debug, marginBottom: 14 }}>{debug}</div>}
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 18 }}>
              {preview.clients.filter(c => c.trigger_status === "Bad").length} trigger risk ·{" "}
              {preview.clients.filter(c => c.status === "Needs Attention").length} Needs Attention ·{" "}
              {preview.clients.filter(c => c.percentage_paid >= 0.5 && c.status === "Good Standing").length} eligible for renewal
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={runImport} style={S.btnP}>
                Import {preview.clients.length} Deals →
              </button>
              <button onClick={() => { setPreview(null); setDebug(""); }} style={S.btnS}>
                Cancel
              </button>
            </div>
          </div>

          {/* Preview table */}
          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              First 10 clients
            </div>
            <div style={{ overflowX: "auto" as const }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    {["Invoice", "Business", "Sales Rep", "Funded $", "Balance", "Pmt $", "Trigger"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 9px", background: "#0D1B2A", color: "#E8D5A3", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" as const }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.clients.slice(0, 10).map((c, i) => (
                    <tr key={c.invoice} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--parchment-2)" }}>
                      <td style={{ padding: "6px 9px", fontFamily: "monospace", fontSize: 10, color: "var(--ink-3)" }}>{c.invoice}</td>
                      <td style={{ padding: "6px 9px", fontWeight: 600, color: "var(--ink-1)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.business_name}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-3)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.sales_rep}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>${c.funded.toLocaleString()}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>${c.balance.toLocaleString()}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>${c.payment}</td>
                      <td style={{ padding: "6px 9px" }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: c.trigger_status === "Good" ? "#F0FDF4" : "#FFF1F2",
                          color: c.trigger_status === "Good" ? "#166534" : "#991B1B",
                        }}>
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
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 10 }}>
            This may take 1–2 minutes for {preview?.payments.length.toLocaleString()} payment records.
          </div>
        </div>
      )}

      {error && !importing && <div style={S.err}>{error}</div>}
    </div>
  );
}
