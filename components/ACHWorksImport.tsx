"use client";

// components/ACHWorksImport.tsx
// Imports the ACH Works Excel export for a single client
// Uses exact Hit Date, Settle Date, Return Code, Return Date — no calculation needed
// Admin only

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { money, formatDate, addBusinessDays, toDateStr, isBusinessDay } from "@/lib/holidays";
import { getReturnCodeInfo, getTierColors, getTierLabel } from "@/lib/achReturns";
import { logActivity } from "@/components/ActivityLog";
import type { Client } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

type ACHWorksRow = {
  trackingId: string;
  hitDate: string;       // ACH pull date — exact
  customer: string;
  amount: number;
  settleDate: string;    // Settlement date — exact
  returnCode: string;    // blank if settled
  returnDate: string;    // blank if settled
};

type ParsedRow = ACHWorksRow & {
  status: "settled" | "returned" | "pending";
  isXCode: boolean;
  tier: number;
};

// ── Date parsing ─────────────────────────────────────────────────────────────

function parseACHDate(raw: string): string {
  if (!raw || raw.trim() === "") return "";
  const clean = raw.trim();
  // Format: MM/DD/YY or MM/DD/YYYY
  const parts = clean.split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseMoney(raw: string): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/[$,\s]/g, "")) || 0;
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayStr(): string {
  return toDateStr(today());
}

// ── Excel parser ─────────────────────────────────────────────────────────────
// Parses tab-separated text from Excel export
// Columns: TrackingID | Acct Set | Hit Date | Check # | Payee | Customer | Code | C/D | Memo | Amount | Settle ID | Settle Date | Return Code | Return Date | Return Settle ID | Change Code | Change Date

function parseACHWorksExcel(text: string): ACHWorksRow[] {
  const rows: ACHWorksRow[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Find header row
  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes("tracking") && l.toLowerCase().includes("hit date")
  );
  if (headerIdx === -1) return rows;

  // Parse header to get column indices
  const headers = lines[headerIdx].split("\t").map(h => h.trim().toLowerCase());
  const col = (name: string) => headers.findIndex(h => h.includes(name));

  const idxTracking  = col("tracking");
  const idxHitDate   = col("hit date");
  const idxCustomer  = col("customer");
  const idxAmount    = col("amount");
  const idxSettleDate = col("settle date");
  const idxReturnCode = col("return code");
  const idxReturnDate = col("return date");

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < 10) continue;

    const hitDate = parseACHDate(cols[idxHitDate] || "");
    if (!hitDate) continue;

    const settleDate = parseACHDate(cols[idxSettleDate] || "");
    const returnCode = (cols[idxReturnCode] || "").trim().toUpperCase();
    const returnDate = parseACHDate(cols[idxReturnDate] || "");
    const amount = parseMoney(cols[idxAmount] || "0");

    rows.push({
      trackingId: (cols[idxTracking] || "").trim(),
      hitDate,
      customer: (cols[idxCustomer] || "").trim(),
      amount,
      settleDate,
      returnCode,
      returnDate,
    });
  }

  return rows;
}

// ── Determine status ──────────────────────────────────────────────────────────

function getRowStatus(row: ACHWorksRow): "settled" | "returned" | "pending" {
  if (row.returnCode) return "returned";
  // If settle date is in the future → pending
  if (row.settleDate && row.settleDate > todayStr()) return "pending";
  // If settle date is today → pending until 5PM settlement file confirms
  if (row.settleDate && row.settleDate === todayStr()) return "pending";
  return "settled";
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ACHWorksImport({
  clients,
  onImportComplete,
}: {
  clients: Client[];
  onImportComplete: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [step, setStep] = useState<"paste" | "select" | "review" | "done">("paste");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState({ imported: 0, skipped: 0, pending: 0, returned: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Parse ─────────────────────────────────────────────────────────────────

  function handleParse() {
    if (!pasteText.trim()) return;
    const rows = parseACHWorksExcel(pasteText);
    if (rows.length === 0) {
      alert("No rows found. Make sure you pasted the full Excel export including the header row.");
      return;
    }

    const parsedRows: ParsedRow[] = rows.map(row => {
      const status = getRowStatus(row);
      const isXCode = row.returnCode.startsWith("X");
      const codeInfo = row.returnCode ? getReturnCodeInfo(row.returnCode) : null;
      return {
        ...row,
        status,
        isXCode,
        tier: codeInfo ? codeInfo.tier : 0,
      };
    });

    setParsed(parsedRows);
    setStep("select");
  }

  // ── File upload handler ───────────────────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPasteText(ev.target?.result as string || "");
    };
    reader.readAsText(file);
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!selectedInvoice) return;
    setProcessing(true);

    const client = clients.find(c => c.invoice === selectedInvoice);
    if (!client) { setProcessing(false); return; }

    let imported = 0, skipped = 0, pendingCount = 0, returnedCount = 0;

    // Get org_id
    const { data: orgData } = await supabase.from("organizations").select("id").limit(1).single();
    const orgId = orgData?.id || "";

    // Get existing ACH dates to avoid duplicates
    const { data: existingPayments } = await supabase
      .from("payments")
      .select("ach_date, payment_status, returns")
      .eq("invoice", selectedInvoice);

    const existingMap = new Map(
      (existingPayments || []).map((p: any) => [
        `${p.ach_date}_${p.payment_status}`,
        true
      ])
    );

    for (const row of parsed) {
      // Skip duplicates
      const key = `${row.hitDate}_${row.status}`;
      if (existingMap.has(key)) { skipped++; continue; }

      if (row.status === "returned") {
        // ── Insert returned payment ────────────────────────────────────────
        const codeInfo = getReturnCodeInfo(row.returnCode);

        const { error } = await supabase.from("payments").insert({
          invoice: selectedInvoice,
          payment_date: row.hitDate,
          ach_date: row.hitDate,
          settlement_date: row.returnDate || row.settleDate,
          description: `Returned — ${row.returnCode}`,
          credit: 0,
          debit: 0,
          returns: row.amount,
          running_balance: null,
          payment_status: "returned",
        });

        if (error && error.code === "23505") { skipped++; continue; }
        if (error) { console.error("Return insert error:", error); continue; }

        // Insert into ach_returns table
        await supabase.from("ach_returns").insert({
          org_id: orgId,
          invoice: selectedInvoice,
          merchant_name: client.business_name,
          pull_date: row.hitDate,
          return_date: row.returnDate || row.settleDate,
          settle_date: row.settleDate,
          return_code: row.returnCode,
          return_amount: row.amount,
          tier: codeInfo.tier,
          is_x_code: row.isXCode,
        }).then(() => {});

        returnedCount++;
        imported++;

      } else if (row.status === "settled") {
        // ── Insert settled payment ─────────────────────────────────────────
        const { error } = await supabase.from("payments").insert({
          invoice: selectedInvoice,
          payment_date: row.hitDate,
          ach_date: row.hitDate,
          settlement_date: row.settleDate,
          description: "Posted",
          credit: 0,
          debit: row.amount,
          returns: 0,
          running_balance: null, // Will be recalculated
          payment_status: "settled",
        });

        if (error && error.code === "23505") { skipped++; continue; }
        if (error) { console.error("Payment insert error:", error); continue; }
        imported++;

      } else {
        // ── Insert pending payment ─────────────────────────────────────────
        const { error } = await supabase.from("payments").insert({
          invoice: selectedInvoice,
          payment_date: row.hitDate,
          ach_date: row.hitDate,
          settlement_date: row.settleDate,
          description: "Pending",
          credit: 0,
          debit: row.amount,
          returns: 0,
          running_balance: null,
          payment_status: "pending",
        });

        if (error && error.code === "23505") { skipped++; continue; }
        if (error) { console.error("Pending insert error:", error); continue; }
        pendingCount++;
        imported++;
      }
    }

    // ── Update client return stats ────────────────────────────────────────
    if (returnedCount > 0) {
      const newTotalReturns = Number(client.total_returns || 0) + returnedCount;
      const hasXCode = parsed.some(r => r.isXCode);
      await supabase.from("clients").update({
        total_returns: newTotalReturns,
        x_code_blocked: hasXCode ? true : (client as any).x_code_blocked,
        last_return_code: parsed.filter(r => r.returnCode).slice(-1)[0]?.returnCode || null,
      }).eq("id", client.id);
    }

    // ── Recalculate running balances ───────────────────────────────────────
    // Get all settled payments sorted by ach_date and recalculate balances
    const { data: allPayments } = await supabase
      .from("payments")
      .select("id, ach_date, debit, returns, payment_status")
      .eq("invoice", selectedInvoice)
      .eq("payment_status", "settled")
      .order("ach_date", { ascending: true });

    if (allPayments && allPayments.length > 0) {
      // Find the initial funding credit to start balance from
      const { data: fundingRow } = await supabase
        .from("payments")
        .select("credit")
        .eq("invoice", selectedInvoice)
        .gt("credit", 0)
        .limit(1)
        .single();

      let runningBalance = fundingRow?.credit || Number(client.balance);

      // Walk through settled payments and update running balances
      for (const p of allPayments) {
        runningBalance = runningBalance - Number(p.debit);
        await supabase.from("payments")
          .update({ running_balance: runningBalance })
          .eq("id", p.id);
      }

      // Update client balance to last settled balance
      await supabase.from("clients")
        .update({ balance: runningBalance })
        .eq("invoice", selectedInvoice);
    }

    await logActivity(
      selectedInvoice,
      "funded",
      "ACH Works history imported",
      `${imported} rows imported (${returnedCount} returned, ${pendingCount} pending) · ${skipped} duplicates skipped`
    );

    setResult({ imported, skipped, pending: pendingCount, returned: returnedCount });
    setStep("done");
    setProcessing(false);
    onImportComplete();
  }

  function reset() {
    setPasteText("");
    setParsed([]);
    setSelectedInvoice("");
    setStep("paste");
    setResult({ imported: 0, skipped: 0, pending: 0, returned: 0 });
  }

  // ── Summary counts ────────────────────────────────────────────────────────

  const settledRows = parsed.filter(r => r.status === "settled");
  const returnedRows = parsed.filter(r => r.status === "returned");
  const pendingRows = parsed.filter(r => r.status === "pending");
  const xCodeRows = parsed.filter(r => r.isXCode);

  const card: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  // ── Step: Paste ───────────────────────────────────────────────────────────
  if (step === "paste") {
    return (
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--parchment-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M3 8h10M3 12h6" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>
              Import from ACH Works
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
              Export the client&apos;s transaction history from ACH Works as Excel, then paste or upload it here.
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          <p style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>How to export from ACH Works:</p>
          <p>1. Go to ACH Works → All Transactions</p>
          <p>2. Filter by client name and date range</p>
          <p>3. Click Export → Excel</p>
          <p>4. Open the Excel file → Select All → Copy → Paste below</p>
          <p style={{ marginTop: 4, color: "var(--ink-4)" }}>Or upload the .xls / .xlsx file directly.</p>
        </div>

        {/* File upload */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: "2px dashed var(--border-mid)", borderRadius: 10, padding: "16px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: "var(--parchment-2)" }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>
            📎 Click to upload Excel file
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
            .xls or .xlsx
          </p>
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv,.txt" style={{ display: "none" }} onChange={handleFile} />
        </div>

        <p style={{ fontSize: 12, color: "var(--ink-4)", textAlign: "center", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>— or paste the data —</p>

        <textarea
          style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "12px 14px", fontSize: 11, color: "var(--ink-1)", fontFamily: "monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          rows={8}
          placeholder={`TrackingID\tAcct Set\tHit Date\tCheck #\tPayee\tCustomer\tCode\tC/D\tMemo\tAmount\tSettle ID\tSettle Date\tReturn Code\tReturn Date...\nWRG-41M2T0DC\t1\t05/08/26\t7317248#25\tCFGMS - JMH\tDAFLAVAJAMAICAN&SOULFO\tCCD\tD\tFB\t$99.00\t\t05/14/26\t\t`}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleParse}
            disabled={!pasteText.trim()}
            style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: !pasteText.trim() ? 0.4 : 1 }}>
            Parse →
          </button>
          <p style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
            You will review before anything is saved
          </p>
        </div>
      </div>
    );
  }

  // ── Step: Select client ───────────────────────────────────────────────────
  if (step === "select") {
    // Try to auto-match client from customer name in the report
    const customerName = parsed[0]?.customer || "";

    return (
      <div style={{ ...card, padding: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
          {parsed.length} rows parsed from ACH Works
        </p>
        <p style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>
          Customer name in report: <strong>{customerName}</strong> · Select which client to import for:
        </p>

        {/* Summary */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, background: "rgba(34,139,34,0.08)", border: "1px solid rgba(34,139,34,0.2)", color: "#1a7a1a", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
            {settledRows.length} settled
          </span>
          {returnedRows.length > 0 && (
            <span style={{ fontSize: 11, background: "rgba(190,40,40,0.08)", border: "1px solid rgba(190,40,40,0.2)", color: "#b82020", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
              {returnedRows.length} returned
            </span>
          )}
          {xCodeRows.length > 0 && (
            <span style={{ fontSize: 11, background: "rgba(154,16,16,0.1)", border: "1px solid rgba(154,16,16,0.25)", color: "#9a1010", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
              ⚠️ {xCodeRows.length} X-code blocked
            </span>
          )}
          {pendingRows.length > 0 && (
            <span style={{ fontSize: 11, background: "rgba(40,110,190,0.08)", border: "1px solid rgba(40,110,190,0.2)", color: "#1a5fa8", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
              {pendingRows.length} pending
            </span>
          )}
        </div>

        {/* Client selector — auto-match by ach_works_name if available */}
        {(() => {
          const autoMatch = clients.find(c =>
            c.ach_works_name &&
            c.ach_works_name.toUpperCase().replace(/[^A-Z0-9]/g, "") ===
            customerName.toUpperCase().replace(/[^A-Z0-9]/g, "")
          );
          if (autoMatch && !selectedInvoice) {
            setTimeout(() => setSelectedInvoice(autoMatch.invoice), 0);
          }
          return null;
        })()}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", display: "block", marginBottom: 6 }}>
            Select client:
          </label>
          <select
            value={selectedInvoice}
            onChange={e => setSelectedInvoice(e.target.value)}
            style={{ width: "100%", borderRadius: 9, border: "1px solid var(--border-mid)", background: "var(--surface)", padding: "10px 12px", fontSize: 13, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif", outline: "none" }}>
            <option value="">— Select a client —</option>
            {clients
              .filter(c => Number(c.balance) > 0)
              .sort((a, b) => a.business_name.localeCompare(b.business_name))
              .map(c => (
                <option key={c.id} value={c.invoice}>
                  {c.business_name} · {c.invoice}
                  {c.ach_works_name ? ` · ${c.ach_works_name}` : ""}
                </option>
              ))}
          </select>
          {selectedInvoice && clients.find(c => c.invoice === selectedInvoice)?.ach_works_name && (
            <p style={{ fontSize: 11, color: "var(--sage)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
              ✓ Auto-matched by ACH Works name
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setStep("review")}
            disabled={!selectedInvoice}
            style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "none", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: !selectedInvoice ? 0.4 : 1 }}>
            Review →
          </button>
          <button
            onClick={reset}
            style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Review ──────────────────────────────────────────────────────────
  if (step === "review") {
    const client = clients.find(c => c.invoice === selectedInvoice);

    return (
      <div style={card}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>
            Review — {client?.business_name}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {parsed.length} rows · {settledRows.length} settled · {returnedRows.length} returned · {pendingRows.length} pending
          </p>
          {xCodeRows.length > 0 && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(154,16,16,0.08)", border: "1px solid rgba(154,16,16,0.2)", borderRadius: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#9a1010", fontFamily: "'DM Sans', sans-serif" }}>
                ⚠️ {xCodeRows.length} X-code block{xCodeRows.length !== 1 ? "s" : ""} detected — ACH Works has blocked this account
              </p>
            </div>
          )}
        </div>

        {/* Preview table */}
        <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
            <thead>
              <tr style={{ background: "var(--parchment-2)", position: "sticky", top: 0 }}>
                {["ACH Date", "Settles", "Status", "Amount", "Return Code"].map(h => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.map((row, idx) => {
                const colors = row.returnCode ? getTierColors(row.tier as any) : null;
                return (
                  <tr key={idx} style={{ background: row.status === "returned" ? "rgba(190,40,40,0.03)" : row.status === "pending" ? "rgba(40,110,190,0.02)" : "transparent" }}>
                    <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", color: "var(--ink-1)", fontFamily: "'DM Mono', monospace" }}>{formatDate(row.hitDate)}</td>
                    <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", color: "var(--ink-4)", fontFamily: "'DM Mono', monospace" }}>{row.settleDate ? formatDate(row.settleDate) : "—"}</td>
                    <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                      {row.status === "returned" ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: row.isXCode ? "#9a1010" : "#b82020" }}>
                          {row.isXCode ? "⚠️ Blocked" : "Returned"}
                        </span>
                      ) : row.status === "pending" ? (
                        <span style={{ fontSize: 11, color: "#1a5fa8" }}>Pending</span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#1a7a1a" }}>Settled</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", fontFamily: "'DM Mono', monospace" }}>{money(row.amount)}</td>
                    <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                      {row.returnCode ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: colors?.color, fontFamily: "'DM Mono', monospace" }}>
                          {row.returnCode} · {formatDate(row.returnDate)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "16px 24px", display: "flex", gap: 10 }}>
          <button
            onClick={handleImport}
            disabled={processing}
            style={{ background: "var(--sage)", color: "white", border: "none", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: processing ? 0.5 : 1 }}>
            {processing ? "Importing..." : `Import ${parsed.length} rows`}
          </button>
          <button
            onClick={() => setStep("select")}
            style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Done ────────────────────────────────────────────────────────────
  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l4 4 6-6" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>ACH Works import complete</p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {result.imported} imported · {result.returned} returned · {result.pending} pending · {result.skipped} skipped
          </p>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
        All dates are exact from ACH Works — no calculations needed. Running balances have been recalculated automatically.
      </p>
      <button
        onClick={reset}
        style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        Import another client
      </button>
    </div>
  );
}
