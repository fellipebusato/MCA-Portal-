"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type ActivityEvent = {
  id: number;
  invoice: string;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
};

type ActivityLogProps = {
  invoice: string;
  isAdminView?: boolean;
  refreshTrigger?: number;
  clientEmail?: string;
};

type LoginInfo = {
  first_login: string | null;
  last_login: string | null;
};

const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  funded:        { icon: "🏦", color: "#1a5fa8", bg: "rgba(40,110,190,0.08)", border: "rgba(40,110,190,0.2)" },
  payment:       { icon: "✅", color: "var(--sage)", bg: "var(--sage-surface)", border: "var(--sage-border)" },
  return:        { icon: "🔴", color: "var(--sienna)", bg: "var(--sienna-surface)", border: "var(--sienna-border)" },
  missed:        { icon: "⚠️", color: "#a07010", bg: "rgba(196,140,40,0.08)", border: "rgba(196,140,40,0.2)" },
  pause_start:   { icon: "⏸️", color: "#a07010", bg: "rgba(196,140,40,0.08)", border: "rgba(196,140,40,0.2)" },
  pause_end:     { icon: "▶️", color: "var(--sage)", bg: "var(--sage-surface)", border: "var(--sage-border)" },
  term_change:   { icon: "📋", color: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)" },
  status_change: { icon: "🔄", color: "var(--ink-3)", bg: "var(--parchment-2)", border: "var(--border)" },
  note:          { icon: "📝", color: "var(--ink-3)", bg: "var(--parchment-2)", border: "var(--border)" },
  login:         { icon: "🔐", color: "var(--ink-3)", bg: "var(--parchment-2)", border: "var(--border)" },
  default:       { icon: "📌", color: "var(--ink-3)", bg: "var(--parchment-2)", border: "var(--border)" },
};

const CLIENT_VISIBLE_EVENTS = ["funded", "payment", "return", "missed", "pause_start", "pause_end", "term_change"];

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateOnly(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function EventCard({ event }: { event: ActivityEvent }) {
  const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.default;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: config.bg, border: `1px solid ${config.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
          {config.icon}
        </div>
        <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: config.color, fontFamily: "'DM Sans', sans-serif" }}>{event.title}</p>
          <p style={{ fontSize: 10, color: "var(--ink-4)", flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>{formatDateTime(event.created_at)}</p>
        </div>
        {event.description && (
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>{event.description}</p>
        )}
      </div>
    </div>
  );
}

export async function logActivity(
  invoice: string,
  event_type: string,
  title: string,
  description?: string
): Promise<void> {
  await supabase.from("activity_log").insert({
    invoice,
    event_type,
    title,
    description: description || null,
  });
}

export default function ActivityLog({ invoice, isAdminView = false, refreshTrigger = 0, clientEmail }: ActivityLogProps) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null);

  async function loadEvents() {
    setLoading(true);
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("invoice", invoice)
      .order("created_at", { ascending: false });

    const filtered = isAdminView
      ? (data || [])
      : (data || []).filter(e => CLIENT_VISIBLE_EVENTS.includes(e.event_type));

    setEvents(filtered as ActivityEvent[]);

    // Load login info for admin view
    if (isAdminView && clientEmail) {
      const { data: consentData } = await supabase
        .from("consent_log")
        .select("created_at")
        .eq("email", clientEmail)
        .order("created_at", { ascending: true })
        .limit(1);

      const { data: lastLoginData } = await supabase
        .from("consent_log")
        .select("created_at")
        .eq("email", clientEmail)
        .order("created_at", { ascending: false })
        .limit(1);

      setLoginInfo({
        first_login: consentData?.[0]?.created_at || null,
        last_login: lastLoginData?.[0]?.created_at || null,
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    if (expanded) loadEvents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, refreshTrigger]);

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    await logActivity(invoice, "note", "Note added", noteText.trim());
    setNoteText("");
    setShowAddNote(false);
    setSavingNote(false);
    await loadEvents();
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(30,16,4,0.06)" }}>

      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--parchment-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v3M7.5 11v3M1 7.5h3M11 7.5h3" stroke="var(--ink-3)" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="7.5" cy="7.5" r="3" stroke="var(--ink-3)" strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", fontFamily: "'DM Sans', sans-serif" }}>Activity log</p>
            <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
              {expanded && events.length > 0
                ? `${events.length} event${events.length !== 1 ? "s" : ""}`
                : "Full history of changes and events"}
            </p>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ color: "var(--ink-4)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>

          {/* Login info — admin only */}
          {isAdminView && loginInfo && (
            <div style={{ padding: "12px 20px", background: "var(--parchment-2)", borderBottom: "1px solid var(--border)", display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: loginInfo.first_login ? "var(--sage)" : "var(--ink-5)" }} />
                <p style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>
                  <strong>Onboarded:</strong> {loginInfo.first_login ? formatDateOnly(loginInfo.first_login) : "Not yet"}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: loginInfo.last_login ? "var(--sage)" : "var(--ink-5)" }} />
                <p style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "'DM Sans', sans-serif" }}>
                  <strong>Last active:</strong> {loginInfo.last_login ? formatDateTime(loginInfo.last_login) : "Never"}
                </p>
              </div>
              {!loginInfo.first_login && (
                <span style={{ fontSize: 11, color: "#a07010", background: "rgba(196,140,40,0.1)", border: "1px solid rgba(196,140,40,0.25)", borderRadius: 99, padding: "2px 10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                  ⚠️ Client has not logged in yet
                </span>
              )}
            </div>
          )}

          {/* Admin: Add note */}
          {isAdminView && (
            <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
              {!showAddNote ? (
                <button onClick={() => setShowAddNote(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Add note
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border-mid)", background: "var(--parchment-2)", padding: "8px 10px", fontSize: 12, color: "var(--ink-1)", outline: "none", resize: "vertical", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                    rows={2}
                    placeholder="Add a note about this client..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleAddNote} disabled={savingNote || !noteText.trim()}
                      style={{ background: "var(--ink-1)", color: "var(--gold-muted)", border: "none", padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: savingNote || !noteText.trim() ? 0.5 : 1 }}>
                      {savingNote ? "Saving..." : "Save note"}
                    </button>
                    <button onClick={() => { setShowAddNote(false); setNoteText(""); }}
                      style={{ background: "transparent", color: "var(--ink-3)", border: "1px solid var(--border-mid)", padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div style={{ padding: "16px 20px" }}>
            {loading ? (
              <p style={{ fontSize: 13, color: "var(--ink-4)", textAlign: "center", padding: "20px 0", fontFamily: "'DM Sans', sans-serif" }}>Loading activity...</p>
            ) : events.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <p style={{ fontSize: 13, color: "var(--ink-4)", fontFamily: "'DM Sans', sans-serif" }}>No activity recorded yet</p>
                <p style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>Events will appear here as payments are uploaded, returns logged, and changes made</p>
              </div>
            ) : (
              <div>
                {events.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>

          {/* Footer for clients */}
          {!isAdminView && (
            <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)" }}>
              <p style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                This log shows key events on your account. For questions, contact <strong>fbusato@cfgms.com</strong>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
