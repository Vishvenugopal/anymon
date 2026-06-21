"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Webcam from "react-webcam";
import { motion, AnimatePresence } from "framer-motion";
import IncubatingScreen from "./IncubatingScreen";
import BattleScreen from "./BattleScreen";
import ArScene, { type ArTrainer, type ArWild } from "./ArScene";
import PvpBattleScreen from "./PvpBattleScreen";
import {
  apiBattleStart,
  apiCapture,
  apiPvpChallenge,
  type Anymon,
  type Combatant,
  type CaptureResult,
  type Matchup,
  type NearbyTrainer,
  type Player,
  type Position,
} from "@/lib/client";
import { NEARBY_RADIUS_M } from "@/lib/types";
import { playSfx } from "@/lib/audio";

type NearbyAnymon = Anymon & { distM: number; mine: boolean };

// ---- geo + compass helpers ----
const toRad = (d: number) => (d * Math.PI) / 180;
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

export default function ScannerView({
  pos,
  place,
  nearby,
  deck,
  player,
  trainers,
  inviteRoomId,
  onRefresh,
  onInviteHandled,
}: {
  pos: Position | null;
  place: { city: string; country: string };
  nearby: NearbyAnymon[];
  deck: Anymon[];
  player: Player;
  trainers: NearbyTrainer[];
  inviteRoomId: string | null;
  onRefresh: () => void;
  onInviteHandled: () => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [camReady, setCamReady] = useState(false);

  const { heading, enable } = useHeading();

  // wild battle state
  const [battlingId, setBattlingId] = useState<string | null>(null);
  const [battle, setBattle] = useState<{
    attacker: Combatant;
    defender: Combatant;
    matchup: Matchup;
  } | null>(null);

  // PvP state
  const [pvpRoomId, setPvpRoomId] = useState<string | null>(null);
  const [challengingId, setChallengingId] = useState<string | null>(null);

  const attackers = useMemo(() => deck.filter((a) => a.state === "deck"), [deck]);
  // Send your strongest (most coins) fighter into battles.
  const chosenAttacker = useMemo(
    () => [...attackers].sort((a, b) => b.coins - a.coins)[0]?.id ?? "",
    [attackers],
  );

  // Everything nearby is shown in AR: other trainers' roamers (capturable) AND
  // the viewer's own deployed Anymon (shown, but not capturable).

  // Open the PvP screen automatically when an incoming invite shows up.
  useEffect(() => {
    if (inviteRoomId && !pvpRoomId) setPvpRoomId(inviteRoomId);
  }, [inviteRoomId, pvpRoomId]);

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
      playSfx("capture");
      setCapture(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [pos, place, enable]);

  const startBattle = useCallback(
    async (defenderId: string) => {
      setError(null);
      enable();
      if (!chosenAttacker)
        return setError("scan an object first to get a fighter!");
      setBattlingId(defenderId);
      try {
        const setup = await apiBattleStart({
          attackerId: chosenAttacker,
          defenderId,
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

  const challengeTrainer = useCallback(
    async (opponentUserId: string) => {
      setError(null);
      enable();
      if (!chosenAttacker)
        return setError("scan an object first to get a fighter!");
      setChallengingId(opponentUserId);
      try {
        const res = await apiPvpChallenge({ opponentUserId, fighterId: chosenAttacker });
        if (res.roomId) setPvpRoomId(res.roomId);
        else setError(res.error || "could not challenge");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setChallengingId(null);
      }
    },
    [chosenAttacker, enable],
  );

  // ---- map wild Anymon + trainers to AR placements ----
  const arWild = useMemo<ArWild[]>(() => {
    return nearby.map((a) => {
      const hasGeo = pos && a.lat != null && a.lng != null;
      const bearing = hasGeo
        ? bearingDeg(pos, { lat: a.lat as number, lng: a.lng as number })
        : hash(a.id) % 360;
      return {
        id: a.id,
        name: a.name,
        object: a.object,
        spriteDataUri: a.spriteDataUri,
        glbUrl: a.glbUrl,
        ready: a.status === "ready",
        distM: a.distM,
        bearing,
        mine: a.mine,
      };
    });
  }, [nearby, pos]);

  const arTrainers = useMemo<ArTrainer[]>(() => {
    return trainers.map((t) => ({
      userId: t.userId,
      username: t.username,
      distM: t.distM,
      bearing: pos ? bearingDeg(pos, { lat: t.lat, lng: t.lng }) : hash(t.userId) % 360,
    }));
  }, [trainers, pos]);

  const radarBlips = useMemo(
    () => [
      ...arWild.map((w) => ({ id: w.id, brg: w.bearing, distM: w.distM, kind: "wild" as const })),
      ...arTrainers.map((t) => ({
        id: t.userId,
        brg: t.bearing,
        distM: t.distM,
        kind: "trainer" as const,
      })),
    ],
    [arWild, arTrainers],
  );

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

      {/* stylized green pixel scanner filter (screen overlay only) */}
      <div className="pointer-events-none absolute inset-0 scanner-overlay" />
      <div className="pointer-events-none absolute inset-0 scanner-pixels opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
        <div className="scanner-scanline w-full" />
      </div>

      {/* ---- simulated ground-plane AR scene over the camera ---- */}
      {camReady && (
        <ArScene
          wild={arWild}
          trainers={arTrainers}
          heading={heading}
          busyWildId={battlingId}
          busyTrainerId={challengingId}
          // Suppress AR nameplates/buttons while any full-screen modal is open
          // (capture/incubating, wild battle, PvP) so they don't bleed over it.
          showOverlays={!capture && !battle && !pvpRoomId}
          onEngageWild={startBattle}
          onChallengeTrainer={challengeTrainer}
        />
      )}

      {/* top status */}
      <div className="pointer-events-none absolute left-0 right-0 top-4 z-20 flex flex-col items-center">
        <Image
          src="/logos/scanner.png"
          alt="scanner"
          width={440}
          height={180}
          priority
          className="h-auto w-[55%] max-w-[200px] object-contain drop-shadow"
        />
      </div>

      {/* corner radar */}
      <MiniRadar blips={radarBlips} heading={heading} />

      {camReady && nearby.length === 0 && trainers.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-gummy bg-black/45 px-4 py-2 text-center text-xs text-white/80">
          no wild anymon or trainers nearby — scan an object or move around
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

      {/* capture (photo) button — raised to clear the bottom nav */}
      <div className="absolute inset-x-0 bottom-24 z-30 flex flex-col items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={capturePhoto}
          disabled={busy}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-anymon-edgelime bg-anymon-lime shadow-gummy ring-2 ring-white/80 disabled:opacity-60"
        >
          <span className="h-14 w-14 rounded-full border-2 border-anymon-edgelime bg-white" />
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
            matchup={battle.matchup}
            onClose={() => {
              setBattle(null);
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pvpRoomId && (
          <PvpBattleScreen
            roomId={pvpRoomId}
            me={{ id: player.id, name: player.name }}
            myFighterId={chosenAttacker || null}
            onClose={() => {
              setPvpRoomId(null);
              onInviteHandled();
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- small corner radar ----
type Blip = { id: string; brg: number; distM: number; kind: "wild" | "trainer" };

function MiniRadar({ blips, heading }: { blips: Blip[]; heading: number | null }) {
  return (
    <div className="pointer-events-none absolute right-4 top-28 z-20 h-32 w-32">
      <div className="relative h-full w-full rounded-full border border-anymon-lime/40 bg-black/40 backdrop-blur-sm">
        <div className="absolute inset-[22%] rounded-full border border-anymon-lime/20" />
        {/* you (always center, facing up) */}
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
        {/* heading indicator: a small triangle pointing UP = the way you face.
            White to match the center "you" dot (was lime). */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[14px] drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]"
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: "8px solid #ffffff",
          }}
        />
        {/* sweep */}
        <div className="absolute inset-0 animate-[spin_4s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,rgba(139,224,30,0.35),transparent_25%)]" />
        {blips.map((b) => {
          // 12 o'clock = the direction you're facing; rotate blips by heading.
          const ang = toRad(b.brg - (heading ?? 0) - 90);
          const r = clamp(b.distM / NEARBY_RADIUS_M, 0.12, 1) * 40;
          return (
            <div
              key={b.id}
              className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_6px_currentColor] ${
                b.kind === "trainer" ? "bg-anymon-berry" : "bg-anymon-lime"
              }`}
              style={{
                left: `${50 + Math.cos(ang) * r}%`,
                top: `${50 + Math.sin(ang) * r}%`,
              }}
            />
          );
        })}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-retro text-sm tracking-widest text-anymon-lime">
          radar
        </div>
      </div>
    </div>
  );
}
