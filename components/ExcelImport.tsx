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

export default function ExcelImport({ onComplete }: { onComplete: () => void }) {
  const [preview, setPreview] = useState<{ clients: ClientRow[]; monthly: MonthlyRow[]; payments: PaymentRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: null });
      if (!rows.length) { setError("No data found in file."); return; }

      // Identify date columns
      const allKeys = Object.keys(rows[0] || {});
      const dateKeys = allKeys.filter(k => {
        const d = new Date(k);
        return !isNaN(d.getTime()) && k.length >= 8;
      });
      const mayKeys = dateKeys.filter(k => {
        const d = new Date(k);
        return d.getFullYear() === 2026 && d.getMonth() === 4;
      });
      const priorKeys = dateKeys.filter(k => !mayKeys.includes(k));

      // Build unique month list for summaries
      const monthSet = new Map<string, { year: number; month: number; keys: string[] }>();
      priorKeys.forEach(k => {
        const d = new Date(k);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!monthSet.has(key)) {
          monthSet.set(key, { year: d.getFullYear(), month: d.getMonth() + 1, keys: [] });
        }
        monthSet.get(key)!.keys.push(k);
      });

      const clients: ClientRow[] = [];
      const monthly: MonthlyRow[] = [];
      const payments: PaymentRow[] = [];

      for (const row of rows) {
        const invoice = row["INVOICE"];
        if (!invoice || invoice === "INVOICE") continue;
        if (row["Completed"] === "Yes") continue;

        const inv = String(invoice).trim();
        const balance = parseFloat(row["Merchants Balance"]) || 0;
        const payback = parseFloat(row["PAYBACK"]) || 0;
        const funded = parseFloat(row["FUNDED"]) || 0;
        const paid = payback - balance;
        const pctPaid = payback > 0 ? paid / payback : 0;
        const trigger = row["TRIGGER"];
        const triggerBad = trigger !== "Good" && trigger != null && trigger !== "";
        const triggerShortfall = triggerBad ? (parseFloat(trigger) || 0) : 0;
        const fundedDate = row["Date Funded"] ? new Date(row["Date Funded"]).toISOString().split("T")[0] : "";

        clients.push({
          invoice: inv,
          business_name: String(row["BUSINESS NAME"] || "").trim(),
          sales_rep: String(row["Sales Rep"] || "").trim(),
          ach_works_name: String(row["ACHWorks"] || "").trim(),
          funded_date: fundedDate,
          funded,
          payback,
          paid: Math.round(paid * 100) / 100,
          balance: Math.round(balance * 100) / 100,
          payment: parseFloat(row["Daily Payment"]) || 0,
          percentage_paid: Math.round(pctPaid * 1000000) / 1000000,
          trigger_status: triggerBad ? "Bad" : "Good",
          trigger_shortfall: Math.round(triggerShortfall * 100) / 100,
          default_watch: String(row["Default Watch"] || "").toLowerCase() === "yes",
          status: row["Mar"] === "Bad" ? "Needs Attention" : "Good Standing",
        });

        // Monthly summaries
        monthSet.forEach(({ year, month, keys }) => {
          const total = keys.reduce((s, k) => {
            const v = parseFloat(row[k]);
            return s + (isNaN(v) || v <= 0 ? 0 : v);
          }, 0);
          if (total > 0) {
            monthly.push({ invoice: inv, year, month, total_paid: Math.round(total * 100) / 100 });
          }
        });

        // May 2026 individual payments
        mayKeys.forEach(k => {
          const v = parseFloat(row[k]);
          if (!isNaN(v) && v > 0) {
            const d = new Date(k).toISOString().split("T")[0];
            payments.push({
              invoice: inv,
              payment_date: d,
              settlement_date: d,
              ach_date: d,
              description: "Posted",
              credit: 0,
              debit: Math.round(v * 100) / 100,
              returns: 0,
            });
          }
        });
      }

      setPreview({ clients, monthly, payments });
    } catch (err: any) {
      setError(`Error reading file: ${err.message}`);
    }
  }

  async function runImport() {
    if (!preview) return;
    setImporting(true);
    setProgress(0);
    setError("");

    const BATCH = 50;
    const total = preview.clients.length + preview.monthly.length + preview.payments.length;
    let done = 0;

    function tick(n: number) {
      done += n;
      setProgress(Math.min(99, Math.round((done / total) * 100)));
    }

    try {
      // Step 1 — Clients
      setProgressLabel("Importing clients...");
      for (let i = 0; i < preview.clients.length; i += BATCH) {
        const batch = preview.clients.slice(i, i + BATCH).map(c => ({
          invoice: c.invoice,
          business_name: c.business_name,
          owner_name: c.business_name,
          client_email: "",
          sales_rep: c.sales_rep || null,
          ach_works_name: c.ach_works_name || null,
          funded_date: c.funded_date || null,
          funded: c.funded,
          funded_amount: c.funded,
          payback: c.payback,
          payback_amount: c.payback,
          paid: c.paid,
          balance: c.balance,
          payment: c.payment,
          payment_frequency: "daily",
          percentage_paid: c.percentage_paid,
          trigger_status: c.trigger_status,
          trigger_shortfall: c.trigger_shortfall,
          default_watch: c.default_watch,
          status: c.status,
        }));
        const { error: e } = await supabase.from("clients").upsert(batch, { onConflict: "invoice" });
        if (e) { console.error("clients:", e); setError(`Client import error: ${e.message}`); setImporting(false); return; }
        tick(batch.length);
      }

      // Step 2 — Monthly summaries
      setProgressLabel("Importing monthly summaries...");
      for (let i = 0; i < preview.monthly.length; i += BATCH) {
        const batch = preview.monthly.slice(i, i + BATCH);
        const { error: e } = await supabase.from("monthly_summaries").upsert(batch, { onConflict: "invoice,year,month" });
        if (e) { console.error("monthly:", e); }
        tick(batch.length);
      }

      // Step 3 — May payments
      setProgressLabel("Importing May payments...");
      for (let i = 0; i < preview.payments.length; i += BATCH) {
        const batch = preview.payments.slice(i, i + BATCH);
        const { error: e } = await supabase.from("payments").upsert(batch, { onConflict: "invoice,payment_date" });
        if (e) { console.error("payments:", e); }
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

  // Complete screen
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
              <div key={l} style={S.stat}>
                <div style={S.statNum}>{n}</div>
                <div style={S.statLbl}>{l}</div>
              </div>
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
      <div style={S.sub}>
        Upload your <strong>active_deals.xlsx</strong> file. The system will import all 580 clients, monthly payment summaries, and May 2026 individual payments. Existing records will be updated, not duplicated.
      </div>

      {!preview && !importing && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>Select active_deals.xlsx</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 16, lineHeight: 1.7 }}>
            Imports: Invoice · Business Name · Sales Rep · Funded Date · Funded $ · Payback · Daily Payment · Balance · Trigger Status · Monthly summaries (all prior months) · Individual May 2026 payments
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ fontSize: 13, color: "var(--ink-2)" }} />
          {error && <div style={S.err}>{error}</div>}
        </div>
      )}

      {preview && !importing && (
        <>
          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Import Preview</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
              {[
                { n: preview.clients.length.toLocaleString(), l: "Clients" },
                { n: `$${(preview.clients.reduce((s, c) => s + c.funded, 0) / 1000000).toFixed(1)}M`, l: "Total Funded" },
                { n: preview.monthly.length.toLocaleString(), l: "Monthly Summaries" },
                { n: preview.payments.length.toLocaleString(), l: "May Payments" },
              ].map(({ n, l }) => (
                <div key={l} style={S.stat}>
                  <div style={S.statNum}>{n}</div>
                  <div style={S.statLbl}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 18 }}>
              {preview.clients.filter(c => c.trigger_status === "Bad").length} deals at trigger risk · {preview.clients.filter(c => c.status === "Needs Attention").length} Needs Attention · {preview.clients.filter(c => c.percentage_paid >= 0.5 && c.status === "Good Standing").length} eligible for renewal
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={runImport} style={S.btnP}>Import {preview.clients.length} Deals →</button>
              <button onClick={() => setPreview(null)} style={S.btnS}>Cancel</button>
            </div>
          </div>

          {/* Preview table */}
          <div style={S.card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>First 10 clients</div>
            <div style={{ overflowX: "auto" as const }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    {["Invoice", "Business", "Sales Rep", "Funded", "Balance", "Pmt", "% Paid", "Trigger"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 9px", background: "#0D1B2A", color: "#E8D5A3", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.clients.slice(0, 10).map((c, i) => (
                    <tr key={c.invoice} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--parchment-2)" }}>
                      <td style={{ padding: "6px 9px", fontFamily: "monospace", fontSize: 10, color: "var(--ink-3)" }}>{c.invoice}</td>
                      <td style={{ padding: "6px 9px", fontWeight: 600, color: "var(--ink-1)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.business_name}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-3)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.sales_rep}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>${c.funded.toLocaleString()}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>${c.balance.toLocaleString()}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>${c.payment}</td>
                      <td style={{ padding: "6px 9px", color: "var(--ink-2)" }}>{(c.percentage_paid * 100).toFixed(1)}%</td>
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
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 10 }}>
            {preview?.clients.length.toLocaleString()} clients · {preview?.monthly.length.toLocaleString()} summaries · {preview?.payments.length.toLocaleString()} payments
          </div>
        </div>
      )}

      {error && !importing && <div style={S.err}>{error}</div>}
    </div>
  );
}
