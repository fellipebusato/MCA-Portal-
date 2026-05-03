"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts the session in the URL hash after clicking reset link
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
  }, []);

  async function handleReset() {
    if (!password || !confirm) {
      setMessage("Please fill in both fields.");
      setStatus("error");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      setStatus("error");
      return;
    }
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }

    setStatus("loading");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setStatus("error");
      return;
    }

    setStatus("success");
    setMessage("Password updated successfully. Redirecting you to login...");

    setTimeout(() => {
      window.location.href = "/";
    }, 2500);
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f4f0] p-8">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-sm">
            <p className="text-sm text-gray-500">Verifying your reset link...</p>
            <p className="text-xs text-gray-400 mt-2">If nothing happens, your link may have expired. Request a new one from the login page.</p>
            <button
              onClick={() => window.location.href = "/"}
              className="mt-4 text-sm text-gray-500 underline"
            >
              Back to login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f4f0] p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Set new password</h1>
          <p className="mt-1 text-sm text-gray-400">Choose a strong password for your account</p>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-8 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">New password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirm new password</label>
              <input
                type="password"
                placeholder="Same password again"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
              />
            </div>

            {message && (
              <div className={`rounded-lg px-3 py-2.5 text-sm ${
                status === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                  : "bg-red-50 text-red-700 border border-red-100"
              }`}>
                {message}
              </div>
            )}

            <button
              onClick={handleReset}
              disabled={status === "loading" || status === "success"}
              className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors mt-2 disabled:opacity-50"
            >
              {status === "loading" ? "Updating..." : "Update password"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          CFG Merchant Solutions · Secure portal
        </p>
      </div>
    </main>
  );
}