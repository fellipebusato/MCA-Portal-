"use client";
import { useState } from "react";

type Props = {
  clients: any[];
  openClient: (client: any) => void;
  updateClient: (client: any) => void;
};

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function getCategory(c: any): "critical" | "watch" | "paused" | "healthy" {
  const returns = Number(c.total_returns || 0);
  if (c.status === "Blocked" || returns >= 3) return "critical";
  if (c.status === "Needs Attention" || returns > 0) return "watch";
  if (c.status === "Paused") return "paused";
  return "healthy";
}

function borderColor(cat: string): string {
  if (cat === "critical") return "var(--sienna)";
  if (cat === "watch") return "#c48c28";
  if (cat === "paused") return "var(--ink-4)";
  return "var(--sage)";
}

function isMaturing(c: any): boolean {
  const balance = Number(c.balance || 0);
  const payback = Number(c.payback || 0);
  if (payback === 0 || balance === 0) return false;
  return balance / payback < 0.2;
}

export default function TriageDashboard({ clients, openClient, updateClient }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [sicFilter, setSicFilter] = useState("all");

  const critical = clients.filter(c => getCategory(c) === "critical");
  const watch = clients.filter(c => getCategory(c) === "watch");
  const paused = clients.filter(c => getCategory(c) === "paused");
  const healthy = clients.filter(c => getCategory(c) === "healthy");
  const totalBalance = clients.reduce((s, c) => s + Number(c.balance || 0), 0);

  const states = [...new Set(clients.map(c => c.state).filter(Boolean))].sort();
  const sics = [...new Set(clients.map(c => c.sic_code).filter(Boolean))].sort();

  let filtered = clients.filter(c => {
    const cat = getCategory(c);
    if (statusFilter !== "all" && cat !== statusFilter) return false;
    if (stateFilter !== "all" && c.state !== stateFilter) return false;
    if (sicFilter !== "all" && c.sic_code !== sicFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.business_name?.toLowerCase().includes(q) ||
        c.invoice?.toLowerCase().includes(q) ||
        c.owner_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const order: Record<string, number> = { critical: 0, watch: 1, paused: 2, healthy: 3 };
  filtered = [...filtered].sort((a, b) => order[getCategory(a)] - order[getCategory(b)]);

  function toggleSelect(id: number) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  }

  function pauseSelected() {
    selected.forEach(id => {
      const c = clients.find(cl => cl.id === id);
      if (c) updateClient({ ...c, status: "Paused" });
    });
    setSelected(new Set());
  }

  function freezeSelected() {
    selected.forEach(id => {
      const c = clients.find(cl => cl.id === id);
      if (c) updateClient({ ...c, status: "Blocked" });
    });
    setSelected(new Set());
  }

  function sendReminderSelected() {
    const emails = [...selected]
      .map(id => clients.find(c => c.id === id)?.client_email)
      .filter(Boolean)
      .join(",");
    if (emails) {
      window.open(
        `mailto:${emails}?subject=Payment%20Reminder%20%E2%80%94%20MCA%20Account&body=Dear%20Merchant%2C%0D%0A%0D%0AThis%20is%20a%20friendly%20reminder%20regarding%20your%20MCA%20account.%20Please%20ensure%20your%20payment%20is%20current%20to%20maintain%20good%20standing.%0D%0A%0D%0A%E2%80%94%20Fellipe%20Busato`
      );
    }
  }

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "18px 20px",
    boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
    position: "relative",
    overflow: "hidden",
  };

  const selectStyle: React.CSSProperties = {
    fontSize: 12,
    border: "1px solid var(--border-mid)",
    borderRadius: 8,
    padding: "8px 12px",
    background: "var(--parchment-2)",
    color: "var(--ink-2)",
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
  };

  const actionBtn = (bg: string, border: string, color: string): React.CSSProperties => ({
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 500,
    color,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  });

  return (
    <div style={{ padding: "32px", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 500, color: "var(--ink-1)", letterSpacing: "-0.02em" }}>
          Action Queue
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>
          Clients requiring attention · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {([
          { label: "Total Portfolio", value: String(clients.length), sub: "active clients", color: "var(--ink-1)" },
          { label: "Outstanding", value: money(totalBalance), sub: "open balance", color: "var(--ink-2)", mono: true },
          { label: "Critical", value: String(critical.length), sub: "3+ returns / blocked", color: "var(--sienna)", bg: "var(--sienna-surface)", bdr: "var(--sienna-border)" },
          { label: "Watch", value: String(watch.length), sub: "1–2 returns", color: "#a07010", bg: "rgba(196,140,40,0.08)", bdr: "rgba(196,140,40,0.25)" },
          { label: "Healthy", value: String(healthy.length), sub: "on track", color: "var(--sage)", bg: "var(--sage-surface)", bdr: "var(--sage-border)" },
        ] as const).map((k, i) => (
          <div key={i} style={{ ...card, ...("bg" in k && k.bg ? { background: k.bg, border: `1px solid ${"bdr" in k ? k.bdr : "var(--border)"}` } : {}) }}>
            <div style={{ position: "absolute", top: 0, left: 16, right: 16, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: "mono" in k && k.mono ? "'DM Mono', monospace" : "'Cormorant Garamond', serif", fontSize: "mono" in k && k.mono ? 20 : 36, fontWeight: 400, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter + Bulk Actions Bar */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="var(--ink-5)" strokeWidth="1.3" />
            <path d="M9 9l2 2" stroke="var(--ink-5)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, invoice, owner…"
            style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 12, borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", color: "var(--ink-2)", outline: "none", width: "100%", fontFamily: "'DM Sans', sans-serif" }}
          />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="critical">Critical</option>
          <option value="watch">Watch</option>
          <option value="paused">Paused</option>
          <option value="healthy">Healthy</option>
        </select>

        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={selectStyle}>
          <option value="all">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sicFilter} onChange={e => setSicFilter(e.target.value)} style={selectStyle}>
          <option value="all">All SIC</option>
          {sics.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {selected.size > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: "var(--border-mid)" }} />
            <button onClick={pauseSelected} style={actionBtn("rgba(196,140,40,0.08)", "rgba(196,140,40,0.3)", "#a07010")}>
              ⏸ Pause {selected.size}
            </button>
            <button onClick={sendReminderSelected} style={actionBtn("var(--sky-surface)", "var(--sky-border)", "var(--sky)")}>
              💬 Send Reminder
            </button>
            <button onClick={freezeSelected} style={actionBtn("var(--sienna-surface)", "var(--sienna-border)", "var(--sienna)")}>
              🔒 Freeze {selected.size}
            </button>
          </>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 22, right: 22, height: 1, background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)", zIndex: 1 }} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--parchment-2)" }}>
              <th style={{ padding: "12px 16px", width: 36 }}>
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  style={{ cursor: "pointer", accentColor: "var(--ink-1)" }}
                />
              </th>
              {["Business", "Invoice / State / SIC", "Balance", "Flags", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(client => {
              const cat = getCategory(client);
              const returns = Number(client.total_returns || 0);
              const maturing = isMaturing(client);
              const payback = Number(client.payback || 0);
              const balance = Number(client.balance || 0);
              const pct = payback > 0 ? Math.round(((payback - balance) / payback) * 100) : 0;

              return (
                <tr
                  key={client.id}
                  style={{ borderBottom: "1px solid var(--border)", borderLeft: `3px solid ${borderColor(cat)}`, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "14px 16px" }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(client.id)}
                      onChange={() => toggleSelect(client.id)}
                      style={{ cursor: "pointer", accentColor: "var(--ink-1)" }}
                    />
                  </td>

                  <td style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => openClient(client)}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)" }}>{client.business_name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                      {client.owner_name}{client.client_email ? ` · ${client.client_email}` : ""}
                    </div>
                  </td>

                  <td style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => openClient(client)}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--ink-4)" }}>{client.invoice}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 2 }}>
                      {[client.state, client.sic_code, client.business_type].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>

                  <td style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => openClient(client)}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{money(balance)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                      <div style={{ flex: 1, height: 3, background: "var(--parchment-3)", borderRadius: 99, maxWidth: 80 }}>
                        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: cat === "critical" ? "var(--sienna)" : cat === "watch" ? "#c48c28" : "var(--sage)", borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'DM Mono', monospace" }}>{pct}%</span>
                    </div>
                  </td>

                  <td style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => openClient(client)}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {returns > 0 && (
                        <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 99, background: returns >= 3 ? "var(--sienna-surface)" : "rgba(196,140,40,0.1)", border: `1px solid ${returns >= 3 ? "var(--sienna-border)" : "rgba(196,140,40,0.3)"}`, color: returns >= 3 ? "var(--sienna)" : "#a07010" }}>
                          {returns} Return{returns !== 1 ? "s" : ""}
                        </span>
                      )}
                      {maturing && (
                        <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 99, background: "rgba(130,80,200,0.08)", border: "1px solid rgba(130,80,200,0.2)", color: "#7040b0" }}>
                          Maturing Soon
                        </span>
                      )}
                      {client.status === "Paused" && (
                        <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 99, background: "var(--parchment-3)", border: "1px solid var(--border-mid)", color: "var(--ink-3)" }}>
                          Paused
                        </span>
                      )}
                      {client.status === "Blocked" && (
                        <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 99, background: "var(--ink-1)", border: "1px solid var(--ink-2)", color: "rgba(255,255,255,0.7)" }}>
                          Blocked
                        </span>
                      )}
                      {returns === 0 && !maturing && cat === "healthy" && (
                        <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 99, background: "var(--sage-surface)", border: "1px solid var(--sage-border)", color: "var(--sage)" }}>
                          On Track
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ padding: "14px 16px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {cat === "paused" ? (
                        <button onClick={() => updateClient({ ...client, status: "Good Standing" })}
                          style={actionBtn("var(--sage-surface)", "var(--sage-border)", "var(--sage)")}>
                          ▶ Resume
                        </button>
                      ) : (
                        <>
                          {(cat === "critical" || cat === "watch") && (
                            <button onClick={() => updateClient({ ...client, status: "Blocked" })}
                              style={actionBtn("var(--sienna-surface)", "var(--sienna-border)", "var(--sienna)")}>
                              🔒 Freeze
                            </button>
                          )}
                          {cat !== "healthy" && (
                            <button onClick={() => updateClient({ ...client, status: "Paused" })}
                              style={actionBtn("rgba(196,140,40,0.08)", "rgba(196,140,40,0.25)", "#a07010")}>
                              ⏸ Pause
                            </button>
                          )}
                        </>
                      )}
                      {client.client_email && (
                        <button
                          onClick={() => window.open(`mailto:${client.client_email}?subject=Your%20MCA%20Account%20%E2%80%94%20Action%20Required&body=Dear%20${encodeURIComponent(client.owner_name)}%2C%0D%0A%0D%0APlease%20contact%20us%20regarding%20your%20account%20${encodeURIComponent(client.invoice)}.%0D%0A%0D%0A%E2%80%94%20Fellipe%20Busato`)}
                          style={actionBtn("var(--sky-surface)", "var(--sky-border)", "var(--sky)")}>
                          💬
                        </button>
                      )}
                      {maturing && client.client_email && (
                        <button
                          onClick={() => window.open(`mailto:${client.client_email}?subject=Renewal%20Opportunity%20%E2%80%94%20${encodeURIComponent(client.business_name)}&body=Dear%20${encodeURIComponent(client.owner_name)}%2C%0D%0A%0D%0AYou%20are%20nearing%20completion%20of%20your%20current%20funding.%20You%20may%20be%20eligible%20for%20a%20renewal%20%E2%80%94%20contact%20us%20to%20learn%20more!%0D%0A%0D%0A%E2%80%94%20Fellipe%20Busato`)}
                          style={actionBtn("rgba(130,80,200,0.08)", "rgba(130,80,200,0.2)", "#7040b0")}>
                          🔄 Renew
                        </button>
                      )}
                      <button onClick={() => openClient(client)}
                        style={actionBtn("transparent", "var(--border-mid)", "var(--ink-3)")}>
                        View →
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "48px", textAlign: "center", fontSize: 13, color: "var(--ink-4)", fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
                  No clients match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: "12px 20px", background: "var(--parchment-2)", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif", display: "flex", justifyContent: "space-between" }}>
          <span>Showing {filtered.length} of {clients.length} clients</span>
          {selected.size > 0 && <span style={{ color: "var(--gold-muted)", fontWeight: 600 }}>{selected.size} selected</span>}
        </div>
      </div>
    </div>
  );
}
