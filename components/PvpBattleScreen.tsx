"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnymonCanvas from "./AnymonCanvas";
import {
  apiPvpCancel,
  apiPvpMove,
  apiPvpRespond,
  apiPvpRoom,
  type BattleRoom,
} from "@/lib/client";
import type { BattleFighter, MoveKind } from "@/lib/types";

const POLL_MS = 1000;

function hpColor(pct: number): string {
  if (pct > 50) return "bg-anymon-lime";
  if (pct > 20) return "bg-yellow-400";
  return "bg-red-500";
}

// Classic Pokemon-style move-tile coloring, on-brand with cohesive edges.
function moveTileClass(kind: MoveKind): string {
  if (kind === "status")
    return "bg-anymon-berry border-anymon-edgeberry text-anymon-white";
  if (kind === "special")
    return "bg-anymon-ocean border-anymon-edgeocean text-anymon-white";
  return "bg-anymon-lime border-anymon-edgelime text-anymon-ink";
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
      <div className="-mt-2 h-3 w-16 rounded-full bg-black/35 blur-[3px]" />
    </div>
  );
}

function HpBar({ f }: { f: BattleFighter }) {
  const pct = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
  return (
    <div className="rounded-gummy border-2 border-anymon-edgecloud bg-white/95 px-3 py-2 shadow-retro">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-anymon-ink">{f.name}</span>
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
      className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-b from-[#0a1418] via-[#0c2630] to-[#3a0f17]"
    >
      {/* fully OPAQUE Persona-style arena (no see-through to the camera) */}
      <div className="pointer-events-none absolute inset-0 scanner-pixels opacity-20" />

      <div className="relative z-10 flex items-center justify-between px-4 pt-4">
        <div className="font-retro text-sm tracking-widest text-anymon-lime">
          trainer battle
        </div>
        <button
          onClick={cancel}
          className="rounded-gummy border-2 border-anymon-white/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-anymon-white/80"
        >
          {room?.status === "active" ? "forfeit" : "leave"}
        </button>
      </div>

      {/* invite handshake */}
      {amInvitee && room && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-anymon-white">
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
              className="rounded-gummy border-2 border-anymon-edgelime bg-anymon-lime px-5 py-2 uppercase tracking-wide text-anymon-ink shadow-retro disabled:opacity-50"
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
      )}

      {/* challenger waiting */}
      {room?.status === "pending" && meIsChallenger && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-anymon-white">
          <Fighter f={room.challenger} size="h-28 w-28" bob />
          <div className="text-lg">challenge sent!</div>
          <div className="animate-pulse text-sm opacity-80">
            waiting for the other trainer to accept…
          </div>
        </div>
      )}

      {/* declined / cancelled */}
      {room && (room.status === "declined" || room.status === "cancelled") && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-anymon-white">
          <div className="text-lg">
            {room.status === "declined" ? "challenge declined" : "battle cancelled"}
          </div>
          <button
            onClick={onClose}
            className="rounded-gummy border-2 border-anymon-edgelime bg-anymon-lime px-6 py-2 uppercase tracking-wide text-anymon-ink shadow-retro"
          >
            ok
          </button>
        </div>
      )}

      {/* active / finished battle field */}
      {room && (room.status === "active" || room.status === "finished") && myFighter && foeFighter && (
        <>
          <div className="relative z-10 flex items-start justify-between px-4 pt-4">
            <HpBar f={foeFighter} />
            <Fighter f={foeFighter} size="h-24 w-24" />
          </div>
          <div className="relative z-10 mt-2 flex items-end justify-between px-4">
            <Fighter f={myFighter} size="h-28 w-28" />
            <HpBar f={myFighter} />
          </div>

          <div className="relative z-10 mt-auto p-3">
            <div className="mb-2 min-h-[4.25rem] space-y-1 rounded-gummy border-2 border-anymon-edgeink bg-anymon-cloud p-3 text-sm text-anymon-ink shadow-retro">
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

            <div className="rounded-gummy border-2 border-anymon-edgeink bg-anymon-ink p-2 shadow-retro">
              {room.status === "finished" ? (
                <ResultPanel room={room} youWon={room.winnerId === me.id} onClose={onClose} />
              ) : myTurn ? (
                <div className="grid grid-cols-2 gap-2">
                  {myFighter.moves.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => playMove(m.name)}
                      disabled={submitting}
                      className={`retro-btn flex flex-col items-start gap-0.5 px-3 py-2 text-left ${moveTileClass(
                        m.kind,
                      )}`}
                    >
                      <span className="text-sm leading-tight">
                        {m.emoji} {m.name}
                      </span>
                      <span className="font-retro text-[9px] tracking-wider opacity-80">
                        {m.kind === "status"
                          ? `support · acc ${m.accuracy}`
                          : `pow ${m.power} · acc ${m.accuracy}`}
                      </span>
                      <span className="line-clamp-2 text-[10px] leading-snug opacity-90">
                        {m.blurb}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-[4.5rem] items-center justify-center font-retro text-xs tracking-widest text-white/80">
                  waiting for {foeFighter.username}…
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!room && (
        <div className="relative z-10 flex flex-1 items-center justify-center text-anymon-white/80">
          connecting…
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-red-500/90 px-4 py-2 text-center text-sm text-white">
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
        className="text-center text-white"
      >
        <div
          className={`font-retro text-lg tracking-widest ${
            youWon ? "text-anymon-lime" : "text-anymon-berry"
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
