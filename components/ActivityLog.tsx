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
};

const EVENT_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  funded:       { icon: "🏦", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  payment:      { icon: "✅", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  return:       { icon: "🔴", color: "text-red-700",     bg: "bg-red-50 border-red-200" },
  missed:       { icon: "⚠️", color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  pause_start:  { icon: "⏸️", color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  pause_end:    { icon: "▶️", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  term_change:  { icon: "📋", color: "text-purple-700",  bg: "bg-purple-50 border-purple-200" },
  status_change:{ icon: "🔄", color: "text-gray-700",    bg: "bg-gray-50 border-gray-200" },
  note:         { icon: "📝", color: "text-gray-700",    bg: "bg-gray-50 border-gray-200" },
  default:      { icon: "📌", color: "text-gray-700",    bg: "bg-gray-50 border-gray-200" },
};

// Events visible to clients — filtered list
const CLIENT_VISIBLE_EVENTS = ["funded", "payment", "return", "missed", "pause_start", "pause_end", "term_change"];

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }) + " · " + d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function EventCard({ event, isAdmin }: { event: ActivityEvent; isAdmin: boolean }) {
  const config = EVENT_ICONS[event.event_type] || EVENT_ICONS.default;

  return (
    <div className="flex gap-3 group">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs flex-shrink-0 ${config.bg}`}>
          {config.icon}
        </div>
        <div className="w-px flex-1 bg-gray-100 mt-1 group-last:hidden" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-semibold ${config.color}`}>{event.title}</p>
          <p className="text-[10px] text-gray-400 flex-shrink-0">{formatDateTime(event.created_at)}</p>
        </div>
        {event.description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{event.description}</p>
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

export default function ActivityLog({ invoice, isAdminView = false, refreshTrigger = 0 }: ActivityLogProps) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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

  const eventCount = events.length;

  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">

      {/* Header — click to expand */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v3M7.5 11v3M1 7.5h3M11 7.5h3" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="7.5" cy="7.5" r="3" stroke="#6b7280" strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Activity log</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {expanded && eventCount > 0
                ? `${eventCount} event${eventCount !== 1 ? "s" : ""}`
                : "Full history of changes and events"}
            </p>
          </div>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}>
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">

          {/* Admin: Add note */}
          {isAdminView && (
            <div className="px-5 py-3 border-b border-gray-50">
              {!showAddNote ? (
                <button
                  onClick={() => setShowAddNote(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Add note
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-gray-400 resize-none"
                    rows={2}
                    placeholder="Add a note about this client..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddNote}
                      disabled={savingNote || !noteText.trim()}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40">
                      {savingNote ? "Saving..." : "Save note"}
                    </button>
                    <button
                      onClick={() => { setShowAddNote(false); setNoteText(""); }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="px-5 py-4">
            {loading ? (
              <p className="text-xs text-gray-400 text-center py-4">Loading activity...</p>
            ) : events.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">No activity recorded yet</p>
                <p className="text-xs text-gray-300 mt-1">
                  Events will appear here as payments are uploaded, returns logged, and changes made
                </p>
              </div>
            ) : (
              <div>
                {events.map((event) => (
                  <EventCard key={event.id} event={event} isAdmin={isAdminView} />
                ))}
              </div>
            )}
          </div>

          {/* Footer note for clients */}
          {!isAdminView && (
            <div className="px-5 py-3 border-t border-gray-50">
              <p className="text-[10px] text-gray-300">
                This log shows key events on your account. For questions about any entry, contact {" "}
                <span className="font-medium">fbusato@cfgms.com</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}