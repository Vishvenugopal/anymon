"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import AnymonCanvas from "./AnymonCanvas";
import { apiCaptureStatus, type CaptureResult } from "@/lib/client";

export default function IncubatingScreen({
  capture,
  onClose,
}: {
  capture: CaptureResult;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(5);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const s = await apiCaptureStatus(capture.id);
        if (!alive) return;
        setProgress((p) => Math.max(p, s.progress || p));
        if (s.status === "ready" && s.glbUrl) {
          setGlbUrl(s.glbUrl);
          setProgress(100);
          setReady(true);
          if (timer.current) clearInterval(timer.current);
        }
      } catch {
        /* keep polling */
      }
    }
    poll();
    timer.current = setInterval(poll, 2500);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [capture.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#FBF6F3] p-6 text-anymon-ink"
    >
      {/* Match the app's screens: cream base + a rising lime/green dot field. */}
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

      <div className="relative z-10 mb-2 font-sans text-sm font-bold tracking-widest text-anymon-lime">
        {ready ? "hatched!" : "incubating..."}
      </div>
      <div className="relative z-10 mb-6 font-retro text-4xl tracking-tight">
        {capture.name}
      </div>

      <motion.div
        key={ready ? "3d" : "2d"}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 h-64 w-64 overflow-hidden rounded-gummy border-2 border-anymon-edgecloud bg-white shadow-gummy"
      >
        {ready && glbUrl ? (
          <AnymonCanvas
            glbUrl={glbUrl}
            spriteFallback={capture.spriteDataUri}
            className="h-full w-full"
          />
        ) : (
          // Instant reward: show the 2D sprite immediately while 3D bakes.
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capture.spriteDataUri}
              alt={capture.object}
              className="h-full w-full animate-bob object-contain p-3"
            />
          </div>
        )}
      </motion.div>

      <div className="relative z-10 mt-6 h-3 w-64 overflow-hidden rounded-full border-2 border-anymon-edgecloud bg-anymon-cloud">
        <motion.div
          className="h-full rounded-full bg-anymon-lime"
          animate={{ width: `${progress}%` }}
          transition={{ ease: "easeOut" }}
        />
      </div>
      <div className="relative z-10 mt-2 text-xs text-anymon-ink/60">
        {ready ? "your 3d anymon is ready" : "sculpting a 3d model (1-2 min)"}
      </div>

      <button
        onClick={onClose}
        className="gummy-btn relative z-10 mt-8 border-2 border-anymon-edgelime bg-anymon-lime px-8 py-3 text-anymon-ink shadow-gummy-lime"
      >
        {ready ? "add to deck" : "keep scanning"}
      </button>
    </motion.div>
  );
}
