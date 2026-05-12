"use client";

import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  const confirmBg = danger ? "#C83C1E" : "var(--ink-1)";
  const confirmColor = danger ? "#fff" : "var(--gold-muted)";
  const confirmBorder = danger ? "rgba(200,60,30,0.4)" : "rgba(196,154,90,0.2)";

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(28,20,12,0.55)",
        zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "28px 32px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 20px 60px rgba(28,20,12,0.25)",
          position: "relative",
          fontFamily: "'DM Sans', sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          position: "absolute", top: 0, left: 22, right: 22, height: 1,
          background: danger
            ? "linear-gradient(90deg, transparent, rgba(200,60,30,0.3), transparent)"
            : "linear-gradient(90deg, transparent, var(--gold-border), transparent)",
        }} />

        {danger && (
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "rgba(200,60,30,0.1)", border: "1px solid rgba(200,60,30,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16, fontSize: 18,
          }}>
            🗑️
          </div>
        )}

        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 22, fontWeight: 500, color: "var(--ink-1)",
          marginBottom: 10, letterSpacing: "-0.01em",
        }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px 20px", borderRadius: 10,
              border: "1px solid var(--border-mid)", background: "transparent",
              color: "var(--ink-3)", fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              flex: 1, padding: "11px 20px", borderRadius: 10,
              border: `1px solid ${confirmBorder}`,
              background: confirmBg, color: confirmColor,
              fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
