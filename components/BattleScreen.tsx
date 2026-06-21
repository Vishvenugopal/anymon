"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Webcam from "react-webcam";
import AnymonCanvas from "./AnymonCanvas";
import {
  apiBattleCancel,
  apiBattleResolve,
  type BattleOutcome,
  type Combatant,
  type Matchup,
  type Move,
} from "@/lib/client";
import type { MoveKind } from "@/lib/types";

// Pokedex-style move tile: edge-colored outline + a y-only (x=0) shadow that is a
// DARKER shade of that same edge color (never black), matching the rest of the app.
// Text is dark ink on every tile so it stays consistent + readable across fills.
function moveTileClass(kind: MoveKind): string {
  if (kind === "status")
    return "bg-anymon-berry border-anymon-edgeberry text-anymon-ink shadow-[0_3px_0_0_#9E2138]";
  if (kind === "special")
    return "bg-anymon-ocean border-anymon-edgeocean text-anymon-ink shadow-[0_3px_0_0_#1F5F79]";
  return "bg-anymon-lime border-anymon-edgelime text-anymon-ink shadow-[0_3px_0_0_#3C6E22]";
}

/** Big, easy-to-read Pokedex-style stat readout (power / accuracy). */
function MoveStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="font-retro text-xl leading-none">
        {value}
        {suffix}
      </span>
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATUS_HEAL = 14;

function effLabel(mult: number): string {
  if (mult >= 2) return "super effective!";
  if (mult >= 1.5) return "effective!";
  if (mult <= 0.5) return "not very effective…";
  return "";
}

// Frame the matchup from YOUR (the player's) point of view as a single verdict:
// compare how hard you hit the foe vs how hard the foe hits you, and label the
// net edge ("major advantage" / "advantage" / "no advantage" / "disadvantage" /
// "major disadvantage"). The dominant multiplier is shown in parentheses.
function advantageState(
  youMult: number,
  foeMult: number,
): { text: string; mult: number; tone: "good" | "bad" | "neutral" } {
  if (youMult > foeMult)
    return {
      text: youMult >= 2 ? "major advantage" : "advantage",
      mult: youMult,
      tone: "good",
    };
  if (foeMult > youMult)
    return {
      text: foeMult >= 2 ? "major disadvantage" : "disadvantage",
      mult: foeMult,
      tone: "bad",
    };
  return { text: "no advantage", mult: youMult, tone: "neutral" };
}

/**
 * Persistent (non-toast) type-matchup box — sits just above the log, subtle.
 * Reads as a single player-POV verdict plus a description explaining both the
 * upside and the downside together.
 */
function WeaknessBox({ matchup }: { matchup?: Matchup }) {
  if (!matchup) return null;
  const youToFoe = matchup.aToB;
  const foeToYou = matchup.bToA;
  const { text, mult, tone } = advantageState(
    youToFoe.multiplier,
    foeToYou.multiplier,
  );
  // A more vivid, readable leaf-green for advantages (the muddy edgelime read as
  // washed-out); berry red for disadvantages; muted ink for an even matchup.
  const toneClass =
    tone === "good"
      ? "text-[#34B814]"
      : tone === "bad"
        ? "text-anymon-berry"
        : "text-anymon-ink/50";
  const desc = [youToFoe.reason, foeToYou.reason]
    .filter(Boolean)
    .filter((r, i, a) => a.indexOf(r) === i)
    .join(" — ");
  return (
    <div className="mb-2 rounded-gummy border border-anymon-edgecloud bg-white/90 px-3 py-1.5 text-anymon-ink shadow-[0_2px_0_0_#C2D5CC]">
      <div className="flex items-center gap-1 font-retro text-[9px] uppercase tracking-widest text-anymon-ink/55">
        <span>type matchup</span>
        {matchup.field && <span className="text-anymon-ocean">· {matchup.field}</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug">
        <span className={`font-retro uppercase tracking-wide ${toneClass}`}>
          {text}
        </span>
        <span className={`font-retro ${toneClass}`}>(×{mult})</span>
      </div>
      {desc && (
        <div className="mt-0.5 text-[11px] leading-snug text-anymon-ink/60">
          {desc}
        </div>
      )}
    </div>
  );
}

/** Shared on-brand combatant stage: 3D model (sprite fallback) on a platform. */
function Fighter({
  glbUrl,
  sprite,
  size,
  hit,
}: {
  glbUrl: string | null;
  sprite: string;
  size: string;
  hit: boolean;
}) {
  return (
    <motion.div
      animate={hit ? { x: [0, -6, 6, -3, 0], opacity: [1, 0.5, 1] } : {}}
      transition={{ duration: 0.32 }}
      className="relative flex flex-col items-center"
    >
      <div className={`relative ${size}`}>
        <AnymonCanvas
          glbUrl={glbUrl}
          spriteFallback={sprite}
          className="h-full w-full drop-shadow-[0_6px_4px_rgba(10,20,24,0.35)]"
        />
      </div>
      {/* crisp (non-blurred) ground shadow so nearby text stays legible */}
      <div className="-mt-1 h-2.5 w-20 rounded-[50%] bg-anymon-ink/15" />
    </motion.div>
  );
}

function roll(move: Move, eff: number): { miss: boolean; crit: boolean; dmg: number } {
  if (Math.random() * 100 > move.accuracy) return { miss: true, crit: false, dmg: 0 };
  const crit = Math.random() < 0.12;
  const variance = 0.85 + Math.random() * 0.15;
  const dmg = Math.max(
    1,
    Math.round(move.power * variance * (crit ? 1.6 : 1) * eff),
  );
  return { miss: false, crit, dmg };
}

function hpColor(pct: number): string {
  if (pct > 50) return "bg-anymon-lime";
  if (pct > 20) return "bg-yellow-400";
  return "bg-red-500";
}

function HpBar({
  hp,
  max,
  name,
  rarity,
}: {
  hp: number;
  max: number;
  name: string;
  rarity: number;
}) {
  const pct = Math.max(0, Math.round((hp / max) * 100));
  return (
    <div className="rounded-gummy border-2 border-anymon-edgecloud bg-white/95 px-3 py-2 shadow-gummy">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-anymon-ink">{name}</span>
          <RarityStars rarity={rarity} />
        </span>
        <span className="font-retro text-[10px] text-anymon-ink/60">
          {Math.max(0, hp)}/{max}
        </span>
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

export default function BattleScreen({
  attacker,
  defender,
  matchup,
  onClose,
}: {
  attacker: Combatant;
  defender: Combatant;
  matchup?: Matchup;
  onClose: () => void;
}) {
  // Start each battle from the fighter's CURRENT hp (so healing matters).
  const aHpRef = useRef(attacker.hp);
  const dHpRef = useRef(defender.hp);
  const [aHp, setAHpState] = useState(attacker.hp);
  const [dHp, setDHpState] = useState(defender.hp);
  const setA = (v: number) => {
    aHpRef.current = v;
    setAHpState(v);
  };
  const setD = (v: number) => {
    dHpRef.current = v;
    setDHpState(v);
  };

  // AR (live camera) vs a neutral solid background.
  const [arOn, setArOn] = useState(true);

  const [phase, setPhase] = useState<
    "player" | "anim" | "resolving" | "result"
  >("player");
  const [log, setLog] = useState<string>(
    matchup
      ? `A wild ${defender.name} appeared! ${matchup.intro}`
      : `A wild ${defender.name} appeared! Choose your move.`,
  );
  const [enemyHit, setEnemyHit] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [result, setResult] = useState<BattleOutcome | null>(null);
  const busyRef = useRef(false);
  const endedRef = useRef(false);

  // Pacing: hold each action on screen ~3s so it can be read, but let a tap
  // anywhere skip straight to the next step. `skipRef` resolves the pending step.
  const STEP_MS = 3000;
  const skipRef = useRef<(() => void) | null>(null);
  const waitStep = useCallback(
    (ms = STEP_MS) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          skipRef.current = null;
          resolve();
        };
        const timer = setTimeout(finish, ms);
        skipRef.current = finish;
      }),
    [],
  );
  const advance = useCallback(() => {
    skipRef.current?.();
  }, []);

  const finish = useCallback(
    async (winnerId: string) => {
      endedRef.current = true;
      setPhase("resolving");
      setLog(
        winnerId === attacker.id
          ? `${defender.name} fainted!`
          : `${attacker.name} fainted!`,
      );
      await wait(700);
      try {
        const o = await apiBattleResolve({
          attackerId: attacker.id,
          defenderId: defender.id,
          winnerId,
        });
        setResult(o);
      } catch {
        setResult({
          winnerId,
          loserId: winnerId === attacker.id ? defender.id : attacker.id,
          winnerObject:
            winnerId === attacker.id ? attacker.object : defender.object,
          loserObject:
            winnerId === attacker.id ? defender.object : attacker.object,
          headline: winnerId === attacker.id ? "you won!" : "you lost!",
          lesson: "",
          field: "battle",
          coinsAwarded: 0,
          captured: false,
        });
      }
      setPhase("result");
    },
    [attacker, defender],
  );

  const doAttack = useCallback(
    async (side: "player" | "enemy", move: Move) => {
      const isPlayer = side === "player";
      const actor = isPlayer ? attacker : defender;
      setPhase("anim");

      if (move.kind === "status") {
        const ref = isPlayer ? aHpRef : dHpRef;
        const max = isPlayer ? attacker.maxHp : defender.maxHp;
        const healed = Math.min(max, ref.current + STATUS_HEAL);
        (isPlayer ? setA : setD)(healed);
        setLog(`${actor.name} used ${move.name}! ${move.blurb}`);
        await waitStep();
        return;
      }

      // attacker = matchup "a", defender = matchup "b".
      const dir = isPlayer ? matchup?.aToB : matchup?.bToA;
      const eff = dir?.multiplier ?? 1;
      const r = roll(move, eff);
      if (r.miss) {
        setLog(`${actor.name} used ${move.name}… but it missed!`);
        await waitStep();
        return;
      }

      if (isPlayer) {
        setD(Math.max(0, dHpRef.current - r.dmg));
        setEnemyHit(true);
        setTimeout(() => setEnemyHit(false), 320);
      } else {
        setA(Math.max(0, aHpRef.current - r.dmg));
        setPlayerHit(true);
        setTimeout(() => setPlayerHit(false), 320);
      }
      const label = effLabel(eff);
      const science = label && dir?.reason ? `${label} ${dir.reason}` : move.blurb;
      setLog(
        `${actor.name} used ${move.name}! ${
          r.crit ? "Critical hit! " : ""
        }${science}`,
      );
      await waitStep();
    },
    [attacker, defender, matchup, waitStep],
  );

  const chooseEnemyMove = useCallback((): Move => {
    const moves = defender.moves;
    const lowHp = dHpRef.current / defender.maxHp < 0.35;
    const status = moves.find((m) => m.kind === "status");
    if (lowHp && status && Math.random() < 0.5) return status;
    const attacks = moves.filter((m) => m.kind !== "status");
    const pool = attacks.length ? attacks : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [defender]);

  const playerTurn = useCallback(
    async (move: Move) => {
      if (busyRef.current || phase !== "player") return;
      busyRef.current = true;

      await doAttack("player", move);
      if (dHpRef.current <= 0) {
        busyRef.current = false;
        await finish(attacker.id);
        return;
      }
      await wait(400);
      await doAttack("enemy", chooseEnemyMove());
      if (aHpRef.current <= 0) {
        busyRef.current = false;
        await finish(defender.id);
        return;
      }
      setPhase("player");
      busyRef.current = false;
    },
    [phase, doAttack, chooseEnemyMove, finish, attacker.id, defender.id],
  );

  // Forfeit/exit: free the defender lock now and bail out. Set endedRef so the
  // unmount cleanup below doesn't fire a second cancel.
  const giveUp = useCallback(() => {
    endedRef.current = true;
    apiBattleCancel(defender.id);
    onClose();
  }, [defender.id, onClose]);

  // Release the defender lock if the player leaves mid-battle (resolve already
  // frees it on a finished battle).
  useEffect(() => {
    return () => {
      if (!endedRef.current) apiBattleCancel(defender.id);
    };
  }, [defender.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={advance}
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
            {/* Same green scanner screen-effects as the scanner page, layered
                over the live camera (behind the cloud wash below). */}
            <div className="absolute inset-0 scanner-overlay" />
            <div className="absolute inset-0 scanner-pixels opacity-60" />
            <div className="absolute inset-x-0 top-0 h-full overflow-hidden">
              <div className="scanner-scanline w-full" />
            </div>
            {/* The non-AR background (cloud) overlaid at 30% so on-brand panels +
                models stay legible while the camera/effects show through. */}
            <div className="absolute inset-0 bg-anymon-cloud opacity-30" />
          </>
        ) : (
          <div className="absolute inset-0 bg-anymon-cloud" />
        )}
      </div>

      {/* AR / non-AR toggle — floats top-right (absolute = no layout height) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setArOn((v) => !v);
        }}
        className="absolute right-3 top-3 z-30 rounded-gummy border-2 border-anymon-edgecloud bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-anymon-ink shadow-[0_2px_0_0_#C2D5CC] active:translate-y-[2px] active:shadow-none"
      >
        {arOn ? "ar: on" : "ar: off"}
      </button>

      {/* ARENA — min-h-0 lets it shrink so the move menu below always fits
          (the move tiles were getting clipped at the bottom). */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-4 px-4 py-3">
        {/* ENEMY — give-up sits directly BELOW the enemy name/HP box */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-start gap-2">
            <HpBar
              hp={dHp}
              max={defender.maxHp}
              name={defender.name}
              rarity={defender.rarity}
            />
            {phase !== "result" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  giveUp();
                }}
                className="rounded-gummy border-2 border-anymon-edgeberry bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-anymon-berry shadow-[0_2px_0_0_#9E2138] active:translate-y-[2px] active:shadow-none"
              >
                give up
              </button>
            )}
          </div>
          <Fighter
            glbUrl={defender.glbUrl}
            sprite={defender.spriteDataUri}
            size="h-28 w-28"
            hit={enemyHit}
          />
        </div>

        {/* PLAYER */}
        <div className="flex items-end justify-between">
          <Fighter
            glbUrl={attacker.glbUrl}
            sprite={attacker.spriteDataUri}
            size="h-32 w-32"
            hit={playerHit}
          />
          <HpBar
            hp={aHp}
            max={attacker.maxHp}
            name={attacker.name}
            rarity={attacker.rarity}
          />
        </div>
      </div>

      {/* WEAKNESS + LOG + MENU */}
      <div className="relative z-10 p-3">
        <WeaknessBox matchup={matchup} />

        <div className="mb-2 min-h-[4.25rem] rounded-gummy border-2 border-anymon-edgecloud bg-anymon-cloud p-3 text-sm text-anymon-ink shadow-gummy">
          {log}
        </div>

        <div className="rounded-gummy border-2 border-anymon-edgecloud bg-anymon-cloud p-2 shadow-gummy">
          {phase === "player" ? (
            <div className="grid grid-cols-2 gap-2">
              {attacker.moves.map((m) => (
                <button
                  key={m.name}
                  onClick={(e) => {
                    // Stop the tap from bubbling to the screen's tap-to-advance
                    // handler, which would otherwise instantly skip your own
                    // move's 3s readout (the "my turn flashes by" bug).
                    e.stopPropagation();
                    playerTurn(m);
                  }}
                  className={`flex flex-col gap-1 rounded-gummy border-2 px-3 py-2 text-left transition-transform select-none active:translate-y-[3px] active:shadow-none ${moveTileClass(
                    m.kind,
                  )}`}
                >
                  <span className="text-sm font-bold leading-tight">{m.name}</span>
                  <div className="flex items-center gap-3">
                    {m.kind !== "status" && (
                      <MoveStat label="Power" value={m.power} />
                    )}
                    <MoveStat label="Accuracy" value={m.accuracy} suffix="%" />
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
          ) : phase === "result" && result ? (
            <ResultPanel
              result={result}
              youWon={result.winnerId === attacker.id}
              onClose={onClose}
            />
          ) : (
            <div className="flex h-[4.5rem] items-center justify-center font-retro text-xs tracking-widest text-anymon-ink/60">
              {phase === "resolving" ? "resolving…" : "tap to continue ▸"}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ResultPanel({
  result,
  youWon,
  onClose,
}: {
  result: BattleOutcome;
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
          {result.coinsAwarded > 0 && youWon && (
            <span className="rounded-full border-2 border-anymon-edgecoin bg-white px-3 py-1 font-bold text-anymon-coin shadow-[0_2px_0_0_#92400e]">
              +{result.coinsAwarded} coins
            </span>
          )}
          {result.captured && (
            <span className="rounded-full bg-anymon-lime px-3 py-1 font-bold text-anymon-ink">
              captured!
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
