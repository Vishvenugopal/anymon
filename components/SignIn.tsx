"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";

export default function SignIn() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (provider: "google" | "guest") => {
    setError(null);
    setBusy(provider);
    try {
      if (provider === "google") {
        // OAuth needs a full-page redirect to Google (and back to "/").
        await signIn("google", { callbackUrl: "/" });
        return; // page navigates away
      }
      // Guest uses credentials -> no redirect; refresh once the session is set.
      const res = await signIn("guest", { redirect: false });
      if (res?.error) {
        setError("guest mode is off — set ALLOW_GUEST=1 and restart the server");
        setBusy(null);
        return;
      }
      window.location.reload();
    } catch {
      setError("sign-in failed");
      setBusy(null);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-gradient-to-b from-anymon-ocean to-anymon-lime p-8 text-white">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-7xl"
      >
        ✨
      </motion.div>
      <h1 className="mt-4 text-5xl font-bold">anymon</h1>
      <p className="mt-2 text-center text-white/90">
        turn real objects into 3d monsters.
        <br />
        battle. learn. collect.
      </p>

      <div className="mt-10 w-full max-w-xs space-y-3">
        <button
          onClick={() => go("google")}
          disabled={!!busy}
          className="gummy-btn flex w-full items-center justify-center gap-3 bg-white py-3.5 text-anymon-ink shadow-gummy disabled:opacity-60"
        >
          <GoogleIcon />
          {busy === "google" ? "opening google…" : "sign in with google"}
        </button>
        <button
          onClick={() => go("guest")}
          disabled={!!busy}
          className="w-full rounded-full py-2 text-sm text-white/80 underline-offset-2 hover:underline disabled:opacity-60"
        >
          {busy === "guest" ? "entering…" : "continue as guest"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-full bg-red-500/90 px-4 py-2 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.1 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.2-3.1-.5-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.4z"
      />
      <path
        fill="#FBBC05"
        d="M10.3 28.3a14.5 14.5 0 0 1 0-8.6l-7.8-6.1a24 24 0 0 0 0 20.8l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.1 0 11.3-2 15-5.5l-7.4-5.7c-2 1.4-4.7 2.3-7.6 2.3-6.4 0-11.8-3.7-13.7-9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
