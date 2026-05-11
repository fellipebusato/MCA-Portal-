"use client";

type Props = { clients: any[] };

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

const FICO_BANDS = [
  { label: "< 550",    min: 0,   max: 549  },
  { label: "550–599",  min: 550, max: 599  },
  { label: "600–649",  min: 600, max: 649  },
  { label: "650–699",  min: 650, max: 699  },
  { label: "700+",     min: 700, max: Infinity },
];

const FICO_COLORS = ["var(--sienna)", "#c48c28", "#d4a820", "var(--sage)", "#2a8a5a"];

function ficoBandColor(idx: number) { return FICO_COLORS[idx] ?? "var(--sage)"; }

function returnRateBadge(rate: number) {
  if (rate >= 0.3) return { bg: "var(--sienna-surface)", border: "var(--sienna-border)", color: "var(--sienna)" };
  if (rate >= 0.1) return { bg: "rgba(196,140,40,0.08)", border: "rgba(196,140,40,0.3)", color: "#a07010" };
  return { bg: "var(--sage-surface)", border: "var(--sage-border)", color: "var(--sage)" };
}

export default function AnalyticsDashboard({ clients }: Props) {
  const total = clients.length;
  const totalDeployed = clients.reduce((s, c) => s + Number(c.funded || 0), 0);
  const totalBalance  = clients.reduce((s, c) => s + Number(c.balance || 0), 0);
  const totalReturns  = clients.reduce((s, c) => s + Number(c.total_returns || 0), 0);
  const returnRate    = total ? totalReturns / total : 0;

  const tibClients = clients.filter(c => Number(c.time_in_business_months || 0) > 0);
  const avgTib = tibClients.length
    ? Math.round(tibClients.reduce((s, c) => s + Number(c.time_in_business_months), 0) / tibClients.length)
    : null;

  // Status counts for donut
  const statusCounts = {
    healthy: clients.filter(c => { const r = Number(c.total_returns||0); return c.status !== "Blocked" && c.status !== "Paused" && r === 0 && c.status !== "Needs Attention"; }).length,
    watch:   clients.filter(c => { const r = Number(c.total_returns||0); return c.status === "Needs Attention" || (r > 0 && r < 3 && c.status !== "Blocked"); }).length,
    critical:clients.filter(c => { return c.status === "Blocked" || Number(c.total_returns||0) >= 3; }).length,
    paused:  clients.filter(c => c.status === "Paused").length,
  };

  // Donut segments: conic-gradient
  const donutData = [
    { label: "Healthy",  count: statusCounts.healthy,  color: "var(--sage)"   },
    { label: "Watch",    count: statusCounts.watch,    color: "#c48c28"        },
    { label: "Critical", count: statusCounts.critical, color: "var(--sienna)" },
    { label: "Paused",   count: statusCounts.paused,   color: "var(--ink-4)"  },
  ].filter(d => d.count > 0);

  let donutGradient = "";
  let cursor = 0;
  donutData.forEach(seg => {
    const share = pct(seg.count, total);
    donutGradient += `${seg.color} ${cursor}% ${cursor + share}%, `;
    cursor += share;
  });
  if (donutGradient.endsWith(", ")) donutGradient = donutGradient.slice(0, -2);
  if (cursor < 100) donutGradient += `, var(--parchment-3) ${cursor}% 100%`;

  // Clients by state
  const stateMap: Record<string, number> = {};
  clients.forEach(c => { if (c.state) stateMap[c.state] = (stateMap[c.state] || 0) + 1; });
  const stateRows = Object.entries(stateMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxState = stateRows[0]?.[1] || 1;

  // Return rate by SIC
  const sicMap: Record<string, { count: number; returns: number; deployed: number }> = {};
  clients.forEach(c => {
    const key = c.sic_code || "Unknown";
    if (!sicMap[key]) sicMap[key] = { count: 0, returns: 0, deployed: 0 };
    sicMap[key].count++;
    sicMap[key].returns += Number(c.total_returns || 0);
    sicMap[key].deployed += Number(c.funded || 0);
  });
  const sicRows = Object.entries(sicMap)
    .map(([sic, d]) => ({ sic, count: d.count, rate: d.count ? d.returns / d.count : 0, deployed: d.deployed }))
    .sort((a, b) => b.rate - a.rate);

  // FICO heatmap
  const ficoClients = clients.filter(c => Number(c.fico_score || 0) > 0);
  const ficoBands = FICO_BANDS.map((band, idx) => {
    const inBand = ficoClients.filter(c => {
      const score = Number(c.fico_score);
      return score >= band.min && score <= band.max;
    });
    const returns = inBand.reduce((s, c) => s + Number(c.total_returns || 0), 0);
    return { ...band, count: inBand.length, returns, rate: inBand.length ? returns / inBand.length : 0, color: ficoBandColor(idx) };
  });
  const maxFicoCount = Math.max(...ficoBands.map(b => b.count), 1);

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "20px 22px",
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
  };

  const sectionHead = (title: string, sub?: string) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const goldLine = (
    <div style={{ position: "absolute", top: 0, left: 16, right: 16, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
  );

  return (
    <div style={{ padding: "32px", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em" }}>
          Portfolio Analytics
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>
          {total} client{total !== 1 ? "s" : ""} · computed live
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total Deployed", value: money(totalDeployed), sub: "all-time funded", mono: true },
          { label: "Outstanding Balance", value: money(totalBalance), sub: "open receivable", mono: true },
          { label: "Return Rate", value: `${(returnRate * 100).toFixed(1)}%`, sub: "avg returns per client", mono: true, alert: returnRate >= 0.1 },
          { label: "Avg Time in Business", value: avgTib ? `${avgTib} mo` : "—", sub: avgTib ? `${Math.round(avgTib / 12 * 10) / 10} yrs avg` : "no data yet", mono: true },
        ].map((k, i) => (
          <div key={i} style={{ ...card, ...(k.alert ? { background: "var(--sienna-surface)", border: "1px solid var(--sienna-border)" } : {}) }}>
            {goldLine}
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24, fontWeight: 400, color: k.alert ? "var(--sienna)" : "var(--ink-1)", lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Donut + State Bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16, marginBottom: 16 }}>

        {/* Portfolio Status Donut */}
        <div style={card}>
          {goldLine}
          {sectionHead("Portfolio by Status")}
          {total === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-5)", fontStyle: "italic", fontSize: 13, fontFamily: "'Cormorant Garamond', serif" }}>No client data yet.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 120, height: 120, borderRadius: "50%",
                  background: `conic-gradient(${donutGradient})`,
                  boxShadow: "0 0 0 1px var(--border)",
                }} />
                <div style={{
                  position: "absolute", inset: 22, borderRadius: "50%",
                  background: "var(--surface)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px var(--border)",
                }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: "var(--ink-1)", lineHeight: 1 }}>{total}</div>
                  <div style={{ fontSize: 9, color: "var(--ink-5)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</div>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {donutData.map((seg, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, color: "var(--ink-2)" }}>{seg.label}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--ink-3)" }}>{seg.count}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-5)", minWidth: 34, textAlign: "right" }}>{pct(seg.count, total)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Clients by State */}
        <div style={card}>
          {goldLine}
          {sectionHead("Clients by State", "Top 10 states")}
          {stateRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-5)", fontStyle: "italic", fontSize: 13, fontFamily: "'Cormorant Garamond', serif" }}>No state data on clients yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stateRows.map(([state, count]) => (
                <div key={state} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, fontSize: 11, color: "var(--ink-3)", fontWeight: 600, flexShrink: 0 }}>{state}</div>
                  <div style={{ flex: 1, height: 6, background: "var(--parchment-3)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct(count, maxState)}%`, background: "var(--gold-muted)", borderRadius: 99, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)", minWidth: 20, textAlign: "right" }}>{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: SIC Return Rate Table + FICO Heatmap */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>

        {/* SIC Return Rate */}
        <div style={card}>
          {goldLine}
          {sectionHead("Return Rate by SIC", "sorted highest to lowest")}
          {sicRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-5)", fontStyle: "italic", fontSize: 13, fontFamily: "'Cormorant Garamond', serif" }}>No SIC data on clients yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["SIC Code", "Clients", "Deployed", "Return Rate"].map(h => (
                    <th key={h} style={{ padding: "0 12px 10px 0", fontSize: 10, fontWeight: 600, color: "var(--ink-5)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sicRows.map(row => {
                  const badge = returnRateBadge(row.rate);
                  return (
                    <tr key={row.sic} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--ink-2)" }}>{row.sic}</td>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 12, color: "var(--ink-3)" }}>{row.count}</td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--ink-4)" }}>{money(row.deployed)}</td>
                      <td style={{ padding: "10px 0 10px 0" }}>
                        <span style={{ padding: "2px 10px", fontSize: 11, fontWeight: 600, borderRadius: 99, background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color, fontFamily: "'DM Mono', monospace" }}>
                          {(row.rate * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* FICO Heatmap */}
        <div style={card}>
          {goldLine}
          {sectionHead("FICO Score Distribution", ficoClients.length === 0 ? "" : `${ficoClients.length} of ${total} clients scored`)}
          {ficoClients.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-5)", fontStyle: "italic", fontSize: 13, fontFamily: "'Cormorant Garamond', serif" }}>No FICO data on clients yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ficoBands.map((band, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>{band.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-5)" }}>{band.count} clients</span>
                      {band.count > 0 && (
                        <span style={{ padding: "1px 7px", fontSize: 10, fontWeight: 600, borderRadius: 99, background: returnRateBadge(band.rate).bg, border: `1px solid ${returnRateBadge(band.rate).border}`, color: returnRateBadge(band.rate).color, fontFamily: "'DM Mono', monospace" }}>
                          {(band.rate * 100).toFixed(0)}% ret
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height: 10, background: "var(--parchment-3)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct(band.count, maxFicoCount)}%`, background: band.color, borderRadius: 99, opacity: band.count === 0 ? 0 : 1, transition: "width 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
