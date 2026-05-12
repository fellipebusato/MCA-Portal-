"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/Toast";

interface Note {
  id: number;
  invoice: string;
  note_text: string;
  created_at: string;
}

interface ClientNotesProps {
  invoice: string;
  clientName: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ClientNotes({ invoice, clientName }: ClientNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_notes")
      .select("*")
      .eq("invoice", invoice)
      .order("created_at", { ascending: false });
    if (!error) setNotes(data || []);
    setLoading(false);
  }, [invoice]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleAdd() {
    const text = newNote.trim();
    if (!text) return;
    setSaving(true);
    const { error } = await supabase.from("client_notes").insert({ invoice, note_text: text });
    if (error) {
      toast.error("Failed to save note", error.message);
    } else {
      setNewNote("");
      await fetchNotes();
      toast.success("Note saved");
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    const { error } = await supabase.from("client_notes").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete note", error.message);
    } else {
      setNotes(prev => prev.filter(n => n.id !== id));
    }
    setDeletingId(null);
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(30,16,4,0.06)",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 22, right: 22, height: 1,
        background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)",
      }} />

      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 18, fontWeight: 500, color: "var(--ink-1)",
        }}>
          Internal Notes
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
          Private admin notes for {clientName} — not visible to client
        </div>
      </div>

      {/* Add note */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--parchment-2)" }}>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          placeholder="Add a note… (Cmd+Enter to save)"
          rows={3}
          style={{
            width: "100%", borderRadius: 10, border: "1px solid var(--border-mid)",
            background: "var(--surface)", padding: "10px 12px",
            fontSize: 13, color: "var(--ink-1)", outline: "none",
            fontFamily: "'DM Sans', sans-serif", resize: "vertical",
            lineHeight: 1.5, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={handleAdd}
            disabled={!newNote.trim() || saving}
            style={{
              background: "var(--ink-1)", color: "var(--gold-muted)",
              border: "1px solid rgba(196,154,90,0.2)",
              padding: "8px 18px", borderRadius: 9, fontSize: 12,
              fontWeight: 500, cursor: !newNote.trim() || saving ? "not-allowed" : "pointer",
              opacity: !newNote.trim() || saving ? 0.5 : 1,
              fontFamily: "'DM Sans', sans-serif", transition: "opacity 0.15s",
            }}
          >
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "28px", textAlign: "center", fontSize: 12, color: "var(--ink-5)" }}>
            Loading notes…
          </div>
        ) : notes.length === 0 ? (
          <div style={{ padding: "36px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--ink-4)", fontStyle: "italic", fontFamily: "'Cormorant Garamond', serif" }}>
              No notes yet. Add your first note above.
            </div>
          </div>
        ) : (
          notes.map((note, i) => (
            <div
              key={note.id}
              style={{
                padding: "14px 24px",
                borderBottom: i < notes.length - 1 ? "1px solid var(--border)" : "none",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "var(--ink-1)", border: "1px solid var(--gold-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 11, fontWeight: 600, color: "var(--gold-bright)",
                }}>
                  FB
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55,
                  fontFamily: "'DM Sans', sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {note.note_text}
                </div>
                <div style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 5, letterSpacing: "0.02em" }}>
                  {timeAgo(note.created_at)}
                </div>
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                disabled={deletingId === note.id}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--ink-5)", fontSize: 13, padding: "2px 6px",
                  borderRadius: 6, opacity: deletingId === note.id ? 0.4 : 1,
                  transition: "color 0.15s",
                  flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "#C83C1E")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--ink-5)")}
                title="Delete note"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
