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

    results.push({ merchant, invoice: rawInv, processor, returnDate, settleDate, returnCode, returnAmount: amount });
  }

  return results;
}

export default function ReturnsImport({
  clients,
  onImportComplete,
}: {
  clients: Client[];
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
    let imported = 0, skipped = 0, notFound = 0;

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

      // Insert into payments table as a return
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

      // ✅ FEATURE 1: Extend total_term on return
      const termExtension = client.payment_frequency === "weekly" ? 5 : 1;
      const newTotalTerm = Number(client.total_term) + termExtension;
      const newTotalReturns = Number(client.total_returns || 0) + 1;
      const needsAttention = client.payment_frequency === "weekly"
        ? newTotalReturns >= 1
        : newTotalReturns >= 2;

      await supabase.from("clients").update({
        total_term: newTotalTerm,
        total_returns: newTotalReturns,
        last_return_date: row.returnDate,
        status: needsAttention ? "Needs Attention" : client.status,
      }).eq("id", client.id);

      // Log to activity
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
    setPasteText(""); setParsed([]); setStep("paste");
    setResult({ imported: 0, skipped: 0, notFound: 0 });
  }

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  // ── Step: Paste ──────────────────────────────────────────
  if (step === "paste") {
    return (
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v5M8 10v.5" stroke="var(--sienna)" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="6.5" stroke="var(--sienna)" strokeWidth="1.2"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Import returned payments</p>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>Copy the table from your daily CFG returns email and paste it below</p>
          </div>
        </div>

        <textarea
          style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "12px 14px", fontSize: 12, color: "var(--ink-1)", fontFamily: "monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          rows={8}
          placeholder={`Paste the returns email table here. Example:\n\nMerchant\tINV#\tProcessor\tReturn Date\tSettle Date\tReturn Code\tReturn Amount\nGYA CONSTRUCTION LLC\tInvoice #INV99918\tACHWorks\t5/1/2026\t5/5/2026\tR01\t269.00`}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleParse}
            disabled={!pasteText.trim()}
            style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "1px solid rgba(196,154,90,0.2)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: !pasteText.trim() ? 0.4 : 1 }}>
            Parse returns →
          </button>
          <p style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>You will review before anything is saved</p>
        </div>
      </div>
    );
  }

  // ── Step: Review ─────────────────────────────────────────
  if (step === "review") {
    const matchedRows = parsed.filter(r => r.status === "matched");
    const notFoundRows = parsed.filter(r => r.status === "not_found");

    return (
      <div style={{ ...card }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Review before importing</p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {matchedRows.length} matched · {notFoundRows.length} not found — confirm before saving
          </p>
        </div>

        {matchedRows.length > 0 && (
          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
              Will be imported ({matchedRows.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {matchedRows.map((row, idx) => (
                <div key={idx} style={{ background: "var(--parchment-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>{row.client?.business_name || row.merchant}</p>
                      <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{row.invoice}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--sienna)", fontFamily: "'DM Mono', monospace" }}>{money(row.returnAmount)}</p>
                      <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>returned</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif" }}>{row.returnCode}</p>
                      <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>{RETURN_CODES[row.returnCode] || "Unknown"}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>Return: {row.returnDate}</p>
                      <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>Settles: {row.settleDate}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "#c48c28", fontFamily: "'DM Sans', sans-serif" }}>
                        +{row.client?.payment_frequency === "weekly" ? "5" : "1"} day term extension
                      </p>
                      <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>balance unchanged</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {notFoundRows.length > 0 && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
              Invoice not found — will be skipped ({notFoundRows.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {notFoundRows.map((row, idx) => (
                <div key={idx} style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace" }}>
                  <span>{row.invoice}</span>
                  <span>{row.merchant}</span>
                  <span>{money(row.returnAmount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <button
            onClick={handleImport}
            disabled={processing || matchedRows.length === 0}
            style={{ background: "var(--sienna)", color: "white", border: "none", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: processing || matchedRows.length === 0 ? 0.5 : 1 }}>
            {processing ? "Importing..." : `Import ${matchedRows.length} return${matchedRows.length !== 1 ? "s" : ""}`}
          </button>
          <button
            onClick={reset}
            style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            ← Start over
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────
  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l4 4 6-6" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Import complete</p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {result.imported} imported · {result.skipped} duplicates skipped · {result.notFound} not found
          </p>
        </div>
      </div>
      <button
        onClick={reset}
        style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        Import another batch
      </button>
    </div>
  );
}
