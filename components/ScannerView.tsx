"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import { motion, AnimatePresence } from "framer-motion";
import IncubatingScreen from "./IncubatingScreen";
import BattleScreen from "./BattleScreen";
import {
  apiBattleStart,
  apiCapture,
  type Anymon,
  type Combatant,
  type CaptureResult,
  type Position,
} from "@/lib/client";
import { NEARBY_RADIUS_M } from "@/lib/types";

type NearbyAnymon = Anymon & { distM: number; mine: boolean };

// ---- geo + compass helpers ----
const toRad = (d: number) => (d * Math.PI) / 180;
const wrap180 = (d: number) => (((d + 180) % 360) + 360) % 360 - 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function bearingDeg(from: Position, to: { lat: number; lng: number }): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Live device compass heading (0=N, clockwise) or null if unavailable. */
function useHeading(): { heading: number | null; enable: () => void } {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    const onOrient = (
      e: DeviceOrientationEvent & { webkitCompassHeading?: number },
    ) => {
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
      else if (typeof e.alpha === "number") h = 360 - e.alpha;
      if (h != null && !Number.isNaN(h)) setHeading(((h % 360) + 360) % 360);
    };
    window.addEventListener("deviceorientation", onOrient, true);
    return () => window.removeEventListener("deviceorientation", onOrient, true);
  }, []);

  // iOS requires a user-gesture-triggered permission request.
  const enable = useCallback(() => {
    const D = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (D && typeof D.requestPermission === "function") {
      D.requestPermission().catch(() => {});
    }
  }, []);

  return { heading, enable };
}

const FOV = 70; // degrees of bearing mapped across the screen width

export default function ScannerView({
  pos,
  place,
  nearby,
  deck,
  onRefresh,
}: {
  pos: Position | null;
  place: { city: string; country: string };
  nearby: NearbyAnymon[];
  deck: Anymon[];
  onRefresh: () => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [camReady, setCamReady] = useState(false);

  const { heading, enable } = useHeading();

  // battle state
  const [battlingId, setBattlingId] = useState<string | null>(null);
  const [battle, setBattle] = useState<{
    attacker: Combatant;
    defender: Combatant;
  } | null>(null);

  const attackers = useMemo(() => deck.filter((a) => a.state === "deck"), [deck]);
  // Send your strongest (most coins) fighter into the wild battle.
  const chosenAttacker = useMemo(
    () => [...attackers].sort((a, b) => b.coins - a.coins)[0]?.id ?? "",
    [attackers],
  );

  const wild = useMemo(() => nearby.filter((a) => !a.mine), [nearby]);

  const capturePhoto = useCallback(async () => {
    setError(null);
    enable();
    const shot = webcamRef.current?.getScreenshot();
    if (!shot) {
      setError("camera not ready");
      return;
    }
    setBusy(true);
    try {
      const result = await apiCapture({ imageBase64: shot, pos, place });
      setCapture(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [pos, place, enable]);

  const startBattle = useCallback(
    async (defender: NearbyAnymon) => {
      setError(null);
      enable();
      if (!chosenAttacker)
        return setError("scan an object first to get a fighter!");
      setBattlingId(defender.id);
      try {
        const setup = await apiBattleStart({
          attackerId: chosenAttacker,
          defenderId: defender.id,
        });
        setBattle(setup);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBattlingId(null);
      }
    },
    [chosenAttacker, enable],
  );

  // Map each wild anymon to a screen position from its real bearing/distance.
  const placed = useMemo(() => {
    return wild.map((a, i) => {
      const hasGeo = pos && a.lat != null && a.lng != null;
      const brg = hasGeo
        ? bearingDeg(pos, { lat: a.lat as number, lng: a.lng as number })
        : hash(a.id) % 360;

      let leftPct: number;
      let off = 0; // -1 off to the left, +1 off to the right, 0 on screen
      if (heading != null) {
        const rel = wrap180(brg - heading);
        leftPct = 50 + (rel / (FOV / 2)) * 50;
        if (rel < -FOV / 2) off = -1;
        if (rel > FOV / 2) off = 1;
      } else {
        // No compass: spread evenly so they're all visible over the camera.
        leftPct = wild.length === 1 ? 50 : 8 + (i / (wild.length - 1)) * 84;
      }
      leftPct = clamp(leftPct, 5, 95);

      const dn = clamp(a.distM / NEARBY_RADIUS_M, 0, 1); // 0 near .. 1 far
      const topPct = 30 + dn * 26; // near sits lower, far sits higher
      const scale = 1.05 - dn * 0.5; // near is bigger
      return { a, leftPct, topPct, scale, off, brg };
    });
  }, [wild, pos, heading]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "environment" }}
        onUserMedia={() => setCamReady(true)}
        onUserMediaError={() =>
          setError("camera blocked — allow access (https required on iphone)")
        }
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

      {/* corner radar */}
      <MiniRadar blips={placed} heading={heading} />

      {/* ---- AR roaming anymon over the live camera ---- */}
      {camReady &&
        placed.map(({ a, leftPct, topPct, scale, off }) => (
          <motion.div
            key={a.id}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: off ? 0.45 : 1, scale: 1 }}
          >
            <div className="flex flex-col items-center" style={{ transform: `scale(${scale})` }}>
              <button
                onClick={() => startBattle(a)}
                disabled={battlingId === a.id}
                className="gummy-btn mb-1 bg-anymon-lime px-3 py-1 text-xs font-bold shadow-gummy-lime disabled:opacity-60"
              >
                {battlingId === a.id ? "…" : off ? (off < 0 ? "◀ capture" : "capture ▶") : "capture"}
              </button>
              <div className="animate-bob">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.spriteDataUri}
                  alt={a.name}
                  className="h-24 w-24 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]"
                />
              </div>
              <div className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">
                {a.name} · {a.distM}m
              </div>
            </div>
          </motion.div>
        ))}

      {camReady && wild.length === 0 && (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-gummy bg-black/45 px-4 py-2 text-center text-xs text-white/80">
          no wild anymon nearby — scan an object or move around
        </div>
      )}

      {!camReady && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          starting camera…
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-red-500/90 px-4 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}

      {/* capture (photo) button */}
      <div className="absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={capturePhoto}
          disabled={busy}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-anymon-lime shadow-gummy disabled:opacity-60"
        >
          <span className="h-14 w-14 rounded-full bg-white" />
        </motion.button>
        <div className="rounded-full bg-black/40 px-3 py-1 text-xs text-white/90">
          {busy ? "capturing the essence…" : "point at an object & tap"}
        </div>
      </div>

      {capture && (
        <IncubatingScreen
          capture={capture}
          onClose={() => {
            setCapture(null);
            onRefresh();
          }}
        />
      )}

      <AnimatePresence>
        {battle && (
          <BattleScreen
            attacker={battle.attacker}
            defender={battle.defender}
            onClose={() => {
              setBattle(null);
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- small corner radar ----
function MiniRadar({
  blips,
  heading,
}: {
  blips: { a: NearbyAnymon; brg: number }[];
  heading: number | null;
}) {
  return (
    <div className="absolute right-4 top-16 z-20 h-24 w-24">
      <div className="relative h-full w-full rounded-full border border-anymon-lime/40 bg-black/40 backdrop-blur-sm">
        <div className="absolute inset-[22%] rounded-full border border-anymon-lime/20" />
        {/* you (always center, facing up) */}
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
        {/* sweep */}
        <div className="absolute inset-0 animate-[spin_4s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,rgba(50,205,50,0.35),transparent_25%)]" />
        {blips.map(({ a, brg }) => {
          // 12 o'clock = the direction you're facing; rotate blips by heading.
          const ang = toRad(brg - (heading ?? 0) - 90);
          const r = clamp(a.distM / NEARBY_RADIUS_M, 0.12, 1) * 40;
          return (
            <div
              key={a.id}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-anymon-lime shadow-[0_0_6px_currentColor]"
              style={{
                left: `${50 + Math.cos(ang) * r}%`,
                top: `${50 + Math.sin(ang) * r}%`,
              }}
            />
          );
        })}
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-retro text-[8px] tracking-widest text-anymon-lime">
          radar
        </div>
      </div>
    </div>
  );
}
