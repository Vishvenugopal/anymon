"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Webcam from "react-webcam";
import AnymonCanvas from "./AnymonCanvas";
import {
  apiPvpCancel,
  apiPvpMove,
  apiPvpRespond,
  apiPvpRoom,
  type BattleRoom,
} from "@/lib/client";
import type { BattleFighter, MatchupDir, Matchup, MoveKind } from "@/lib/types";

const POLL_MS = 1000;

function hpColor(pct: number): string {
  if (pct > 50) return "bg-anymon-lime";
  if (pct > 20) return "bg-yellow-400";
  return "bg-red-500";
}

// Pokedex-style move tile: edge-colored outline + a y-only (x=0) shadow that is a
// DARKER shade of that same edge color (never black), matching the rest of the app.
function moveTileClass(kind: MoveKind): string {
  if (kind === "status")
    return "bg-anymon-berry border-anymon-edgeberry text-anymon-white shadow-[0_3px_0_0_#9E2138]";
  if (kind === "special")
    return "bg-anymon-ocean border-anymon-edgeocean text-anymon-white shadow-[0_3px_0_0_#1F5F79]";
  return "bg-anymon-lime border-anymon-edgelime text-anymon-ink shadow-[0_3px_0_0_#3C6E22]";
}

/** Big, easy-to-read Pokedex-style stat readout (power / accuracy). */
function MoveStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="font-retro text-xl leading-none">{value}</span>
      <span className="text-[8px] uppercase tracking-widest opacity-80">{label}</span>
    </span>
  );
}

/** Subtle gold rarity stars shown next to a name. */
function RarityStars({ rarity }: { rarity: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rarity || 0)));
  if (!n) return null;
  return (
    <span
      className="shrink-0 align-middle text-[8px] leading-none text-amber-400 drop-shadow-[0_1px_0_#9A6B00]"
      aria-label={`${n} star rarity`}
    >
      {"\u2605".repeat(n)}
    </span>
  );
}

function multClass(mult: number): string {
  if (mult >= 1.5) return "text-anymon-edgeberry";
  if (mult <= 0.5) return "text-anymon-ocean";
  return "text-anymon-ink/50";
}

function MatchupLine({
  from,
  to,
  dir,
}: {
  from: string;
  to: string;
  dir: MatchupDir;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 leading-snug">
      <span className="font-bold">{from}</span>
      <span className="text-anymon-ink/40">▸</span>
      <span className="font-bold">{to}</span>
      <span className={`font-retro ${multClass(dir.multiplier)}`}>
        ×{dir.multiplier}
      </span>
      {dir.reason && <span className="text-anymon-ink/60">{dir.reason}</span>}
    </div>
  );
}

/** Persistent (non-toast) type-matchup box — sits just above the log, subtle. */
function WeaknessBox({
  matchup,
  meIsChallenger,
  youName,
  foeName,
}: {
  matchup: Matchup | null;
  meIsChallenger: boolean;
  youName: string;
  foeName: string;
}) {
  if (!matchup) return null;
  // matchup.aToB = challenger -> opponent. Orient it from "me" to "foe".
  const youToFoe = meIsChallenger ? matchup.aToB : matchup.bToA;
  const foeToYou = meIsChallenger ? matchup.bToA : matchup.aToB;
  return (
    <div className="mb-2 rounded-gummy border border-anymon-edgecloud bg-white/90 px-3 py-1.5 text-anymon-ink shadow-[0_2px_0_0_#C2D5CC]">
      <div className="flex items-center gap-1 font-retro text-[9px] uppercase tracking-widest text-anymon-ink/55">
        <span>type matchup</span>
        {matchup.field && <span className="text-anymon-ocean">· {matchup.field}</span>}
      </div>
      <div className="mt-0.5 space-y-0.5 text-[11px]">
        <MatchupLine from={youName} to={foeName} dir={youToFoe} />
        <MatchupLine from={foeName} to={youName} dir={foeToYou} />
      </div>
    </div>
  );
}

/** On-brand combatant stage: 3D model (sprite fallback) on a platform. */
function Fighter({
  f,
  size,
  bob = false,
}: {
  f: BattleFighter;
  size: string;
  bob?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center ${bob ? "animate-bob" : ""}`}>
      <div className={`relative ${size}`}>
        <AnymonCanvas
          glbUrl={f.glbUrl}
          spriteFallback={f.spriteDataUri}
          className="h-full w-full drop-shadow-[0_6px_4px_rgba(10,20,24,0.45)]"
        />
      </div>
      {/* crisp (non-blurred) ground shadow so nearby text stays legible */}
      <div className="-mt-1 h-2.5 w-16 rounded-[50%] bg-anymon-ink/20" />
    </div>
  );
}

function HpBar({ f }: { f: BattleFighter }) {
  const pct = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
  return (
    <div className="rounded-gummy border-2 border-anymon-edgecloud bg-white/95 px-3 py-2 shadow-gummy">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-anymon-ink">{f.name}</span>
          <RarityStars rarity={f.rarity} />
        </span>
        <span className="font-retro text-[10px] text-anymon-ink/60">
          {Math.max(0, f.hp)}/{f.maxHp}
        </span>
      </div>
      <div className="preserve-case text-[9px] uppercase tracking-wide text-anymon-ink/50">
        Trainer {f.username}
      </div>
      <div className="mt-1 h-2.5 w-40 max-w-[42vw] overflow-hidden rounded-full border border-anymon-edgecloud bg-anymon-ink/10">
        <motion.div
          className={`h-full rounded-full ${hpColor(pct)}`}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

export default function PvpBattleScreen({
  roomId,
  me,
  myFighterId,
  onClose,
}: {
  roomId: string;
  me: { id: string; name: string };
  myFighterId: string | null;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<BattleRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // AR (live camera) vs a neutral solid background.
  const [arOn, setArOn] = useState(true);
  const alive = useRef(true);

  // Poll the shared room until it ends.
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await apiPvpRoom(roomId);
      if (!alive.current) return;
      if (r) setRoom(r);
      const done =
        r &&
        (r.status === "finished" || r.status === "declined" || r.status === "cancelled");
      if (!done) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [roomId]);

  const meIsChallenger = room?.challenger.userId === me.id;
  const myFighter: BattleFighter | null = room
    ? meIsChallenger
      ? room.challenger
      : room.opponent
    : null;
  const foeFighter: BattleFighter | null = room
    ? meIsChallenger
      ? room.opponent
      : room.challenger
    : null;
  const myTurn = !!room && room.status === "active" && room.turnUserId === me.id;
  const amInvitee = !!room && room.status === "pending" && !meIsChallenger;

  const respond = useCallback(
    async (accept: boolean) => {
      setError(null);
      setSubmitting(true);
      const res = await apiPvpRespond({ roomId, accept, fighterId: myFighterId ?? undefined });
      setSubmitting(false);
      if (res.error) setError(res.error);
      if (!accept) onClose();
    },
    [roomId, myFighterId, onClose],
  );

  const playMove = useCallback(
    async (moveName: string) => {
      if (!myTurn || submitting) return;
      setError(null);
      setSubmitting(true);
      const res = await apiPvpMove({ roomId, moveName });
      setSubmitting(false);
      if (res.error) setError(res.error);
      else {
        // Refresh immediately so the turn flips without waiting a full poll.
        const r = await apiPvpRoom(roomId);
        if (r && alive.current) setRoom(r);
      }
    },
    [roomId, myTurn, submitting],
  );

  const cancel = useCallback(() => {
    apiPvpCancel(roomId);
    onClose();
  }, [roomId, onClose]);

  const lastEntries = room ? room.log.slice(-2) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // High z-index + isolate so the scanner's nearby-Anymon nameplates can
      // never poke through this battle screen.
      className="absolute inset-0 z-[100] isolate flex flex-col overflow-hidden bg-anymon-cloud"
    >
      {/* background: live AR camera feed, or a neutral solid color */}
      <div className="pointer-events-none absolute inset-0">
        {arOn ? (
          <>
            <Webcam
              audio={false}
              videoConstraints={{ facingMode: "environment" }}
              onUserMediaError={() => setArOn(false)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* darker scrim keeps the arena dramatic + readable over video */}
            <div className="absolute inset-0 bg-anymon-ink/35" />
          </>
        ) : (
          <div className="absolute inset-0 bg-anymon-cloud" />
        )}
      </div>

      <div className="relative z-10 flex items-center justify-between px-4 pt-4">
        <span className="rounded-gummy bg-anymon-ink/80 px-3 py-1 font-retro text-sm tracking-widest text-anymon-lime shadow-[0_2px_0_0_#02161b]">
          trainer battle
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setArOn((v) => !v)}
            className="rounded-gummy border-2 border-anymon-white/40 bg-anymon-ink/75 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-anymon-white/90 active:translate-y-[2px]"
          >
            {arOn ? "ar: on" : "ar: off"}
          </button>
          <button
            onClick={cancel}
            className="rounded-gummy border-2 border-anymon-white/40 bg-anymon-ink/75 px-2 py-0.5 text-[11px] uppercase tracking-wide text-anymon-white/90"
          >
            {room?.status === "active" ? "forfeit" : "leave"}
          </button>
        </div>
      </div>

      {/* invite handshake */}
      {amInvitee && room && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-4 rounded-gummy bg-anymon-ink/75 px-6 py-6 text-center text-anymon-white shadow-retro-lg">
            <Fighter f={room.challenger} size="h-28 w-28" bob />
            <div className="preserve-case text-lg">
              Trainer {room.challenger.username} challenges you!
            </div>
            <div className="text-sm opacity-80">
              sends out {room.challenger.name} ({room.challenger.object})
            </div>
            {!myFighterId && (
              <div className="text-xs text-anymon-berry">
                you need an Anymon in your deck to accept
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => respond(true)}
                disabled={submitting || !myFighterId}
                className="rounded-gummy border-2 border-anymon-edgelime bg-anymon-lime px-5 py-2 uppercase tracking-wide text-anymon-ink shadow-gummy-lime disabled:opacity-50"
              >
                accept
              </button>
              <button
                onClick={() => respond(false)}
                disabled={submitting}
                className="rounded-gummy border-2 border-anymon-white/40 px-5 py-2 uppercase tracking-wide text-anymon-white/80"
              >
                decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* challenger waiting */}
      {room?.status === "pending" && meIsChallenger && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-4 rounded-gummy bg-anymon-ink/75 px-6 py-6 text-center text-anymon-white shadow-retro-lg">
            <Fighter f={room.challenger} size="h-28 w-28" bob />
            <div className="text-lg">challenge sent!</div>
            <div className="animate-pulse text-sm opacity-80">
              waiting for the other trainer to accept…
            </div>
          </div>
        </div>
      )}

      {/* declined / cancelled */}
      {room && (room.status === "declined" || room.status === "cancelled") && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-4 rounded-gummy bg-anymon-ink/75 px-6 py-6 text-center text-anymon-white shadow-retro-lg">
            <div className="text-lg">
              {room.status === "declined" ? "challenge declined" : "battle cancelled"}
            </div>
            <button
              onClick={onClose}
              className="rounded-gummy border-2 border-anymon-edgelime bg-anymon-lime px-6 py-2 uppercase tracking-wide text-anymon-ink shadow-gummy-lime"
            >
              ok
            </button>
          </div>
        </div>
      )}

      {/* active / finished battle field */}
      {room && (room.status === "active" || room.status === "finished") && myFighter && foeFighter && (
        <>
          {/* ARENA — vertically balanced in the available space */}
          <div className="relative z-10 flex flex-1 flex-col justify-center gap-6 px-4 py-4">
            <div className="flex items-start justify-between">
              <HpBar f={foeFighter} />
              <Fighter f={foeFighter} size="h-24 w-24" />
            </div>
            <div className="flex items-end justify-between">
              <Fighter f={myFighter} size="h-28 w-28" />
              <HpBar f={myFighter} />
            </div>
          </div>

          {/* WEAKNESS + LOG + MENU */}
          <div className="relative z-10 p-3">
            <WeaknessBox
              matchup={room.matchup}
              meIsChallenger={!!meIsChallenger}
              youName={myFighter.name}
              foeName={foeFighter.name}
            />

            <div className="mb-2 min-h-[4.25rem] space-y-1 rounded-gummy border-2 border-anymon-edgecloud bg-anymon-cloud p-3 text-sm text-anymon-ink shadow-gummy">
              {lastEntries.map((e, i) => (
                <div key={i}>
                  <div>{e.text}</div>
                  {e.reason && (
                    <div className="text-[11px] italic leading-snug text-anymon-ocean">
                      {e.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-gummy border-2 border-anymon-edgecloud bg-anymon-cloud p-2 shadow-gummy">
              {room.status === "finished" ? (
                <ResultPanel room={room} youWon={room.winnerId === me.id} onClose={onClose} />
              ) : myTurn ? (
                <div className="grid grid-cols-2 gap-2">
                  {myFighter.moves.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => playMove(m.name)}
                      disabled={submitting}
                      className={`flex flex-col gap-1 rounded-gummy border-2 px-3 py-2 text-left transition-transform select-none active:translate-y-[3px] active:shadow-none disabled:opacity-60 ${moveTileClass(
                        m.kind,
                      )}`}
                    >
                      <span className="text-sm font-bold leading-tight">{m.name}</span>
                      <div className="flex items-center gap-3">
                        {m.kind !== "status" && <MoveStat label="pow" value={m.power} />}
                        <MoveStat label="acc" value={m.accuracy} />
                        {m.kind === "status" && (
                          <span className="text-[9px] uppercase tracking-widest opacity-80">
                            support
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-1 text-[10px] leading-snug opacity-90">
                        {m.blurb}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-[4.5rem] items-center justify-center font-retro text-xs tracking-widest text-anymon-ink/60">
                  waiting for {foeFighter.username}…
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!room && (
        <div className="relative z-10 flex flex-1 items-center justify-center text-anymon-ink/70">
          connecting…
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-red-500/90 px-4 py-2 text-center text-sm text-white">
          {error}
        </div>
      )}
    </motion.div>
  );
}

function ResultPanel({
  room,
  youWon,
  onClose,
}: {
  room: BattleRoom;
  youWon: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center text-anymon-ink"
      >
        <div
          className={`font-retro text-lg tracking-widest ${
            youWon ? "text-anymon-edgelime" : "text-anymon-berry"
          }`}
        >
          {youWon ? "victory!" : "defeated!"}
        </div>
        <div className="mt-1 flex items-center justify-center gap-3 text-sm">
          {youWon && room.coinsAwarded > 0 && (
            <span className="rounded-full bg-yellow-400/90 px-3 py-1 font-bold text-yellow-900">
              +{room.coinsAwarded} coins
            </span>
          )}
          {youWon && room.captured && (
            <span className="rounded-full bg-anymon-lime px-3 py-1 font-bold text-anymon-ink">
              captured their anymon!
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="gummy-btn mt-3 w-full bg-anymon-lime py-3 text-anymon-ink shadow-gummy-lime"
        >
          done
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
