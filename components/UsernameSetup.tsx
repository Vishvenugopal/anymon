"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { motion } from "framer-motion";
import { apiSetUsername } from "@/lib/client";

export default function UsernameSetup({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await apiSetUsername(value);
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error || "could not set username");
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-anymon-cloud p-8">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card-gummy w-full max-w-sm p-6 text-center"
      >
        <div className="text-5xl">🎫</div>
        <h2 className="mt-3 text-2xl font-bold">pick a username</h2>
        <p className="mt-1 text-sm text-anymon-ink/60">
          this is the creator name shown on every anymon you make.
        </p>

        <form onSubmit={submit} className="mt-5">
          <div className="flex items-center rounded-full border-2 border-anymon-cloud bg-anymon-cloud px-4 py-3">
            <span className="text-anymon-ink/40">@</span>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value.toLowerCase())}
              placeholder="ash_ketchum"
              maxLength={20}
              className="ml-1 w-full bg-transparent outline-none"
            />
          </div>
          <div className="mt-1 text-left text-[11px] text-anymon-ink/40">
            3-20 chars · a-z, 0-9, underscore
          </div>

          {error && (
            <div className="mt-3 rounded-full bg-red-100 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || value.length < 3}
            className="gummy-btn mt-5 w-full bg-anymon-lime py-3 shadow-gummy-lime disabled:opacity-50"
          >
            {busy ? "claiming…" : "let's go"}
          </button>
        </form>

        <button
          onClick={() => signOut()}
          className="mt-4 text-xs text-anymon-ink/40 underline-offset-2 hover:underline"
        >
          sign out
        </button>
      </motion.div>
    </div>
  );
}
