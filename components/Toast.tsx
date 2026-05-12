"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string; title: string }> = {
  success: {
    bg: "var(--sage-surface)",
    border: "var(--sage-border)",
    icon: "var(--sage)",
    title: "var(--sage)",
  },
  error: {
    bg: "var(--sienna-surface)",
    border: "var(--sienna-border)",
    icon: "var(--sienna)",
    title: "var(--sienna)",
  },
  warning: {
    bg: "rgba(196,140,40,0.1)",
    border: "rgba(196,140,40,0.3)",
    icon: "#a07010",
    title: "#a07010",
  },
  info: {
    bg: "rgba(74,100,160,0.1)",
    border: "rgba(74,100,160,0.3)",
    icon: "#5a72a0",
    title: "#5a72a0",
  },
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const c = COLORS[toast.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10);
    const auto = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 4500);
    return () => { clearTimeout(show); clearTimeout(auto); };
  }, [toast.id, onDismiss]);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${c.icon}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        boxShadow: "0 4px 20px rgba(30,16,4,0.14)",
        minWidth: 300,
        maxWidth: 400,
        transform: visible ? "translateX(0)" : "translateX(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: "50%", background: c.bg,
        border: `1px solid ${c.border}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 11, fontWeight: 700, color: c.icon, flexShrink: 0,
      }}>
        {ICONS[toast.type]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: c.title, lineHeight: 1.3 }}>
          {toast.title}
        </div>
        {toast.message && (
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>
            {toast.message}
          </div>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-5)", fontSize: 14, lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Global toast store ──────────────────────────────────────────────────────

type ToastFn = (title: string, message?: string) => void;

interface ToastStore {
  toasts: ToastMessage[];
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  warning: ToastFn;
  dismiss: (id: string) => void;
}

let _setToasts: React.Dispatch<React.SetStateAction<ToastMessage[]>> | null = null;

function addToast(type: ToastType, title: string, message?: string) {
  const id = `${Date.now()}-${Math.random()}`;
  _setToasts?.(prev => [...prev, { id, type, title, message }]);
}

export const toast: Pick<ToastStore, "success" | "error" | "info" | "warning"> = {
  success: (title, message) => addToast("success", title, message),
  error: (title, message) => addToast("error", title, message),
  info: (title, message) => addToast("info", title, message),
  warning: (title, message) => addToast("warning", title, message),
};

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10,
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
