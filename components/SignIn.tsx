"use client";

import { useState } from "react";
import Image from "next/image";
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
    <div className="relative flex h-full w-full flex-col bg-[#FBF6F3] text-anymon-ink">
      {/* Match the main app screens: cream base + a rising lime/green dot field
          (mirrors .deck-dots-red but in the app's primary green accent). */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[36%]"
        style={{
          backgroundImage: "radial-gradient(#8BE01E 1px, transparent 1.6px)",
          backgroundSize: "6px 6px",
          imageRendering: "pixelated",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,0) 100%)",
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* Logo is pinned in a non-shrinking header so it's ALWAYS visible. */}
      <div className="relative z-10 flex shrink-0 justify-center px-8 pb-2 pt-12">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-[75%] max-w-[300px]"
        >
          <Image
            src="/logos/anymon.png"
            alt="anyMon!"
            width={440}
            height={220}
            priority
            className="h-auto w-full object-contain"
          />
        </motion.div>
      </div>

      <div className="no-scrollbar relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 pb-10">
        <h1 className="preserve-case text-center text-2xl font-bold text-anymon-ink">
          Turn anything into an Anymon!
        </h1>
        <p className="preserve-case mt-2 text-center text-sm text-anymon-ink/60">
          Learn science while creating and fighting anymon!
        </p>

        <div className="mt-10 w-full max-w-xs space-y-3">
        <button
          onClick={() => go("google")}
          disabled={!!busy}
          className="gummy-btn flex w-full items-center justify-center gap-3 border-2 border-anymon-edgelime bg-white py-3.5 text-anymon-ink shadow-gummy-lime disabled:opacity-60"
        >
          <GoogleIcon />
          {busy === "google" ? "opening google…" : "sign in with google"}
        </button>
        <button
          onClick={() => go("guest")}
          disabled={!!busy}
          className="w-full rounded-full py-2 text-sm text-anymon-ink/60 underline-offset-2 hover:underline disabled:opacity-60"
        >
          {busy === "guest" ? "entering…" : "continue as guest"}
        </button>
        </div>

        {error && (
          <div className="mt-4 rounded-full bg-anymon-berry px-4 py-2 text-sm text-anymon-white">
            {error}
          </div>
        )}
      </div>
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
