"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import MorningDashboard from "@/components/MorningDashboard";
import SettledReportImport from "@/components/SettledReportImport";
import ReturnsImport from "@/components/ReturnsImport";

export default function DailyOperations({
  clients,
  onImportComplete,
}: {
  clients: Client[];
  onImportComplete: () => void;
}) {
  const [activePane, setActivePane] = useState<"settled" | "returns">("settled");

  return (
    <div style={{ padding: 28, fontFamily: "'DM Sans', sans-serif", color: "var(--ink-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Daily Operations</p>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-4)", maxWidth: 620 }}>
            Run the day’s settlement and return imports in a single operational flow. Start with the 5PM settled report, then process the 3PM returns report to keep the book in sync.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <MorningDashboard clients={clients} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={() => setActivePane("settled")}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: activePane === "settled" ? "1px solid var(--ink-1)" : "1px solid var(--border)",
            background: activePane === "settled" ? "var(--surface)" : "var(--parchment-2)",
            color: activePane === "settled" ? "var(--ink-1)" : "var(--ink-4)",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          5PM Settled report
        </button>
        <button
          onClick={() => setActivePane("returns")}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: activePane === "returns" ? "1px solid var(--ink-1)" : "1px solid var(--border)",
            background: activePane === "returns" ? "var(--surface)" : "var(--parchment-2)",
            color: activePane === "returns" ? "var(--ink-1)" : "var(--ink-4)",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          3PM Returns report
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
        {activePane === "settled" ? (
          <SettledReportImport clients={clients} onImportComplete={onImportComplete} />
        ) : (
          <ReturnsImport clients={clients} onImportComplete={onImportComplete} />
        )}
      </div>
    </div>
  );
}
