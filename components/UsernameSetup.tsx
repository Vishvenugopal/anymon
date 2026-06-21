"use client";

import { useState } from "react";
import Image from "next/image";
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
    <div className="relative flex h-full w-full flex-col bg-[#FBF6F3] text-anymon-ink">
      {/* Same background as the sign-in screen: cream base + rising red dot field. */}
      <div className="deck-dots-red pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[36%]" />

      {/* Logo pinned at the top so it stays visible on small screens. */}
      <div className="relative z-10 flex shrink-0 justify-center px-8 pb-2 pt-10">
        <Image
          src="/logos/anymon.png"
          alt="anyMon!"
          width={440}
          height={220}
          priority
          className="h-auto w-[52%] max-w-[200px] object-contain"
        />
      </div>

      <div className="no-scrollbar relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-8 pt-2">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card-gummy w-full max-w-sm p-6 text-center"
      >
        <TicketIcon className="mx-auto h-12 w-12 text-anymon-berry" />
        <h2 className="mt-3 text-2xl font-bold">pick a username</h2>
        <p className="mt-1 text-sm text-anymon-ink/60">
          this is the creator name shown on every anymon you make.
        </p>

        <form onSubmit={submit} className="mt-5">
          <div className="flex items-center rounded-full border-2 border-anymon-edgecloud bg-anymon-cloud px-4 py-3">
            <span className="preserve-case shrink-0 font-bold text-anymon-ink/50">
              Trainer
            </span>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value.toLowerCase())}
              placeholder="ash_ketchum"
              maxLength={20}
              className="ml-2 w-full bg-transparent outline-none"
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
    </div>
  );
}

// Flat ticket icon (replaces the 🎫 emoji). Uses currentColor so it picks up
// the surrounding text color token.
function TicketIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5V14a2 2 0 0 0 0-4V8.5Z" />
      <path d="M14 7v10" strokeDasharray="2 2" />
    </svg>
  );
}
