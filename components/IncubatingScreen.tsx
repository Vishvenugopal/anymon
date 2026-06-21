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
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-anymon-ocean/90 to-anymon-lime/90 p-6 text-white"
    >
      <div className="mb-2 font-retro text-sm tracking-widest">
        {ready ? "hatched!" : "incubating..."}
      </div>
      <div className="mb-1 text-2xl font-bold">{capture.object}-mon</div>
      <div className="mb-6 text-sm opacity-80">
        created by {capture.ownerName}
      </div>

      <motion.div
        key={ready ? "3d" : "2d"}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="h-64 w-64 overflow-hidden rounded-gummy bg-white/95 shadow-gummy"
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

      <div className="mt-6 h-3 w-64 overflow-hidden rounded-full bg-white/30">
        <motion.div
          className="h-full rounded-full bg-white"
          animate={{ width: `${progress}%` }}
          transition={{ ease: "easeOut" }}
        />
      </div>
      <div className="mt-2 text-xs opacity-80">
        {ready ? "your 3d anymon is ready" : "sculpting a 3d model (1-2 min)"}
      </div>

      <button
        onClick={onClose}
        className="gummy-btn mt-8 bg-white px-8 py-3 text-anymon-ink shadow-gummy-lime"
      >
        {ready ? "add to deck" : "keep scanning"}
      </button>
    </motion.div>
  );
}
