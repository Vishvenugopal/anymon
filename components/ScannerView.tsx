"use client";

import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";
import { motion } from "framer-motion";
import IncubatingScreen from "./IncubatingScreen";
import { apiCapture, type CaptureResult, type Position } from "@/lib/client";

export default function ScannerView({
  pos,
  place,
  onCaptured,
}: {
  pos: Position | null;
  place: { city: string; country: string };
  onCaptured: () => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [camReady, setCamReady] = useState(false);

  const capturePhoto = useCallback(async () => {
    setError(null);
    const shot = webcamRef.current?.getScreenshot();
    if (!shot) {
      setError("camera not ready");
      return;
    }
    setBusy(true);
    try {
      const result = await apiCapture({
        imageBase64: shot,
        pos,
        place,
      });
      setCapture(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [pos, place]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "environment" }}
        onUserMedia={() => setCamReady(true)}
        onUserMediaError={() => setError("camera blocked — allow access (https required on iphone)")}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* stylized green pixel scanner filter */}
      <div className="pointer-events-none absolute inset-0 scanner-overlay" />
      <div className="pointer-events-none absolute inset-0 scanner-pixels opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
        <div className="scanner-scanline w-full" />
      </div>

      {/* corner frame */}
      <div className="pointer-events-none absolute inset-6 rounded-gummy border-2 border-anymon-lime/70" />

      {/* top status */}
      <div className="absolute left-0 right-0 top-4 flex flex-col items-center text-white">
        <div className="font-retro text-xs tracking-widest text-anymon-lime drop-shadow">
          anymon scanner
        </div>
        <div className="mt-1 rounded-full bg-black/40 px-3 py-1 text-xs">
          {place.city}, {place.country}
        </div>
      </div>

      {!camReady && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          starting camera…
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-red-500/90 px-4 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}

      {/* capture button */}
      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={capturePhoto}
          disabled={busy}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-anymon-lime shadow-gummy disabled:opacity-60"
        >
          <span className="h-14 w-14 rounded-full bg-white" />
        </motion.button>
        <div className="text-xs text-white/90">
          {busy ? "capturing the essence…" : "point at an object & tap"}
        </div>
      </div>

      {capture && (
        <IncubatingScreen
          capture={capture}
          onClose={() => {
            setCapture(null);
            onCaptured();
          }}
        />
      )}
    </div>
  );
}
