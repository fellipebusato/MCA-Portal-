"use client";

// components/ReturnsImport.tsx
// Imports the daily 3PM ACH Works return report
// Writes to both ach_returns (new) and payments (existing) tables
// Admin only

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/holidays";
import { logActivity } from "@/components/ActivityLog";
import {
  getReturnCodeInfo,
  getTierColors,
  getTierLabel,
  getPullDateFromReturnDate,
  type ReturnTier,
} from "@/lib/achReturns";
import type { Client } from "@/lib/types";

type ReturnRow = {
  merchant: string;
  invoice: string;
  returnDate: string;
  settleDate: string;
  returnCode: string;
  returnAmount: number;
};

type MatchedReturn = ReturnRow & {
  client: Client | null;
  status: "matched" | "not_found" | "duplicate";
  pullDate: string;
  tier: ReturnTier;
  isXCode: boolean;
};

function parseReturnDate(raw: string): string {
  const parts = raw.trim().split("/");
  if (parts.length !== 3) return raw;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseReturnReport(text: string): ReturnRow[] {
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

    // Return codes: R01, R08, X01, X07, X08, etc.
    const codeIdx = cols.findIndex(c => /^[RX]\d{2}$/.test(c));
    if (codeIdx === -1) continue;

    const returnCode = cols[codeIdx];
    const dateCols = cols.filter(c => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
    if (dateCols.length < 2) continue;

    const returnDate = parseReturnDate(dateCols[0]);
    const settleDate = parseReturnDate(dateCols[1]);
    const merchant = cols.slice(0, invIdx).join(" ").trim();

    results.push({ merchant, invoice: rawInv, returnDate, settleDate, returnCode, returnAmount: amount });
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
    const rows = parseReturnReport(pasteText);

    const matched: MatchedReturn[] = rows.map(row => {
      const client = clients.find(c =>
        c.invoice.trim().toLowerCase() === row.invoice.trim().toLowerCase()
      ) || null;

      const codeInfo = getReturnCodeInfo(row.returnCode);
      const pullDate = getPullDateFromReturnDate(row.returnDate);

      return {
        ...row,
        client,
        status: client ? "matched" : "not_found",
        pullDate,
        tier: codeInfo.tier,
        isXCode: codeInfo.isXCode,
      };
    });

    setParsed(matched);
    setStep("review");
  }

  async function handleImport() {
    setProcessing(true);
    let imported = 0, skipped = 0, notFound = 0;

    const { data: orgData } = await supabase.from("organizations").select("id").limit(1).single();
    const orgId = orgData?.id || "";

    for (const row of parsed) {
      if (row.status === "not_found") { notFound++; continue; }
      if (row.status === "duplicate") { skipped++; continue; }
      if (!row.client) { notFound++; continue; }

      const client = row.client;
      const codeInfo = getReturnCodeInfo(row.returnCode);

      // Check for duplicate in ach_returns
      const { data: existingReturn } = await supabase
        .from("ach_returns")
        .select("id")
        .eq("invoice", row.invoice)
        .eq("return_date", row.returnDate)
        .eq("return_amount", row.returnAmount)
        .limit(1);

      if (existingReturn && existingReturn.length > 0) { skipped++; continue; }

      // Insert into ach_returns
      await supabase.from("ach_returns").insert({
        org_id: orgId,
        invoice: row.invoice,
        merchant_name: row.merchant || client.business_name,
        pull_date: row.pullDate,
        return_date: row.returnDate,
        settle_date: row.settleDate,
        return_code: row.returnCode,
        return_amount: row.returnAmount,
        tier: row.tier,
        is_x_code: row.isXCode,
      });

      // Update matching pending payment to 'returned'
      await supabase
        .from("payments")
        .update({
          payment_status: "returned",
          description: `Returned — ${row.returnCode}`,
          returns: row.returnAmount,
        })
        .eq("invoice", row.invoice)
        .eq("ach_date", row.pullDate)
        .in("payment_status", ["pending", "processing"]);

      // Insert return event row in payments ledger
      await supabase.from("payments").insert({
        invoice: row.invoice,
        payment_date: row.returnDate,
        ach_date: row.pullDate,
        settlement_date: row.settleDate,
        description: `Returned — ${row.returnCode} · ${codeInfo.description}`,
        credit: 0,
        debit: 0,
        returns: row.returnAmount,
        running_balance: Number(client.balance),
        payment_status: "returned",
      });

      // Update client record
      const newTotalReturns = Number(client.total_returns || 0) + 1;
      const termExtension = client.payment_frequency === "weekly" ? 5 : 1;
      const newTotalTerm = Number(client.total_term) + 1;
      const needsAttention = client.payment_frequency === "weekly"
        ? newTotalReturns >= 1
        : newTotalReturns >= 2;

      await supabase.from("clients").update({
        total_term: newTotalTerm,
        total_returns: newTotalReturns,
        last_return_date: row.returnDate,
        last_return_code: row.returnCode,
        x_code_blocked: row.isXCode ? true : (client as any).x_code_blocked,
        return_streak: Number((client as any).return_streak || 0) + 1,
        status: row.isXCode ? "Blocked" : needsAttention ? "Needs Attention" : client.status,
      }).eq("id", client.id);

      // Log to activity
      await logActivity(
        row.invoice,
        "return",
        `${row.isXCode ? "⚠️ ACHWorks Block" : "Payment returned"} — ${row.returnCode}`,
        `${money(row.returnAmount)} · ${codeInfo.description} · Tier ${row.tier} (${getTierLabel(row.tier)}) · Pulled ${row.pullDate} · ${codeInfo.action} · Term +${termExtension} day${termExtension !== 1 ? "s" : ""}`
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
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  if (step === "paste") {
    return (
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v5M8 10v.5" stroke="var(--sienna)" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="8" cy="8" r="6.5" stroke="var(--sienna)" strokeWidth="1.2" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Import 3PM return report</p>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
              Paste the daily ACH Works return report. Returns auto-classified by severity.
            </p>
          </div>
        </div>

        <textarea
          style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "12px 14px", fontSize: 12, color: "var(--ink-1)", fontFamily: "monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          rows={10}
          placeholder={`Paste the 3PM ACH Works return report here.\n\nMerchant\tINV#\tProcessor\tReturn Date\tSettle Date\tReturn Code\tReturn Amount\nGYA CONSTRUCTION LLC\tInvoice #INV99918\tACHWorks\t5/7/2026\t5/12/2026\tR01\t269.00`}
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
          <p style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>
            You will review before anything is saved
          </p>
        </div>
      </div>
    );
  }

  if (step === "review") {
    const matchedRows = parsed.filter(r => r.status === "matched");
    const notFoundRows = parsed.filter(r => r.status === "not_found");
    const tier1 = matchedRows.filter(r => r.tier === 1);
    const tier2 = matchedRows.filter(r => r.tier === 2);
    const tier3 = matchedRows.filter(r => r.tier === 3);
    const xCodes = matchedRows.filter(r => r.isXCode);
    const totalAmount = matchedRows.reduce((s, r) => s + r.returnAmount, 0);

    return (
      <div style={card}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>
            Review before importing
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {matchedRows.length} matched · {notFoundRows.length} not found · {money(totalAmount)} total returns
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {xCodes.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(154,16,16,0.1)", border: "1px solid rgba(154,16,16,0.25)", color: "#9a1010", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
                ⚠️ {xCodes.length} ACHWorks block{xCodes.length !== 1 ? "s" : ""}
              </span>
            )}
            {tier1.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(190,40,40,0.08)", border: "1px solid rgba(190,40,40,0.2)", color: "#b82020", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
                {tier1.length} Critical
              </span>
            )}
            {tier2.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(196,140,40,0.08)", border: "1px solid rgba(196,140,40,0.2)", color: "#a07010", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
                {tier2.length} High
              </span>
            )}
            {tier3.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 500, background: "var(--parchment-2)", border: "1px solid var(--border)", color: "var(--ink-3)", padding: "3px 10px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif" }}>
                {tier3.length} Monitor
              </span>
            )}
          </div>
        </div>

        {matchedRows.length > 0 && (
          <div style={{ padding: "20px 24px", borderBottom: notFoundRows.length > 0 ? "1px solid var(--border)" : undefined }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
              Will be imported ({matchedRows.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {matchedRows.map((row, idx) => {
                const codeInfo = getReturnCodeInfo(row.returnCode);
                const colors = getTierColors(row.tier);
                return (
                  <div key={idx} style={{ background: "var(--parchment-2)", border: `1px solid ${row.isXCode ? "rgba(154,16,16,0.3)" : colors.border}`, borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        {row.isXCode && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(154,16,16,0.1)", border: "1px solid rgba(154,16,16,0.25)", color: "#9a1010", padding: "2px 8px", borderRadius: 99, fontFamily: "'DM Sans', sans-serif", display: "inline-block", marginBottom: 4 }}>
                            ⚠️ X-CODE BLOCK
                          </span>
                        )}
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>
                          {row.client?.business_name || row.merchant}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
                          {row.invoice}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: colors.color, fontFamily: "'DM Sans', sans-serif" }}>
                          {row.returnCode} — {codeInfo.description}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                          Pulled {formatDate(row.pullDate)} · Returned {formatDate(row.returnDate)}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--sienna)", fontFamily: "'DM Mono', monospace" }}>
                          {money(row.returnAmount)}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>balance unchanged</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {notFoundRows.length > 0 && (
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
              Invoice not found — will be skipped ({notFoundRows.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {notFoundRows.map((row, idx) => (
                <div key={idx} style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace" }}>
                  <span>{row.invoice}</span><span>{row.merchant}</span>
                  <span>{money(row.returnAmount)}</span><span>{row.returnCode}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: "16px 24px", display: "flex", gap: 10 }}>
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

  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l4 4 6-6" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Return import complete</p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            {result.imported} imported · {result.skipped} duplicates skipped · {result.notFound} not found
          </p>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
        Open the ACH Operations Center to see the prioritized action queue.
      </p>
      <button
        onClick={reset}
        style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        Import another batch
      </button>
    </div>
  );
}
