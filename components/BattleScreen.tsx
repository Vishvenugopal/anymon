"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  apiBattleCancel,
  apiBattleResolve,
  type BattleOutcome,
  type Combatant,
  type Matchup,
  type Move,
} from "@/lib/client";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATUS_HEAL = 14;

function effLabel(mult: number): string {
  if (mult >= 2) return "super effective!";
  if (mult >= 1.5) return "effective!";
  if (mult <= 0.5) return "not very effective…";
  return "";
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

function HpBar({ hp, max, name }: { hp: number; max: number; name: string }) {
  const pct = Math.max(0, Math.round((hp / max) * 100));
  return (
    <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-gummy">
      <div className="flex items-baseline justify-between">
        <span className="truncate font-bold text-anymon-ink">{name}</span>
        <span className="font-retro text-[10px] text-anymon-ink/60">
          {Math.max(0, hp)}/{max}
        </span>
      </div>
      <div className="mt-1 h-2.5 w-40 max-w-[42vw] overflow-hidden rounded-full bg-black/15">
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
  const aHpRef = useRef(attacker.maxHp);
  const dHpRef = useRef(defender.maxHp);
  const [aHp, setAHpState] = useState(attacker.maxHp);
  const [dHp, setDHpState] = useState(defender.maxHp);
  const setA = (v: number) => {
    aHpRef.current = v;
    setAHpState(v);
  };
  const setD = (v: number) => {
    dHpRef.current = v;
    setDHpState(v);
  };

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
        setLog(`${actor.name} used ${move.emoji} ${move.name}! ${move.blurb}`);
        await wait(1100);
        return;
      }

      // attacker = matchup "a", defender = matchup "b".
      const dir = isPlayer ? matchup?.aToB : matchup?.bToA;
      const eff = dir?.multiplier ?? 1;
      const r = roll(move, eff);
      if (r.miss) {
        setLog(`${actor.name} used ${move.name}… but it missed!`);
        await wait(1000);
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
        `${actor.name} used ${move.emoji} ${move.name}! ${
          r.crit ? "Critical hit! " : ""
        }${science}`,
      );
      await wait(1150);
    },
    [attacker, defender, matchup],
  );

  const chooseEnemyMove = useCallback((): Move => {
    const moves = defender.moves;
    const lowHp = dHpRef.current / defender.maxHp < 0.35;
    const status = moves.find((m) => m.kind === "status");
    if (lowHp && status && Math.random() < 0.5) return status;
    const attacks = moves.filter((m) => m.kind !== "status");
    const pool = attacks.length ? attacks : moves;
    // weight toward stronger moves a bit
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
      className="absolute inset-0 z-50 flex flex-col bg-gradient-to-b from-sky-300 via-sky-200 to-anymon-lime/40"
    >
      {/* ENEMY */}
      <div className="relative flex items-start justify-between px-4 pt-6">
        <HpBar hp={dHp} max={defender.maxHp} name={defender.name} />
        <motion.div
          animate={enemyHit ? { x: [0, -6, 6, -3, 0], opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 0.32 }}
          className="mr-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={defender.spriteDataUri}
            alt={defender.name}
            className="h-28 w-28 object-contain drop-shadow-lg"
          />
        </motion.div>
      </div>

      {/* PLAYER */}
      <div className="relative mt-2 flex items-end justify-between px-4">
        <motion.div
          animate={playerHit ? { x: [0, -6, 6, -3, 0], opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 0.32 }}
          className="ml-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attacker.spriteDataUri}
            alt={attacker.name}
            className="h-32 w-32 object-contain drop-shadow-lg"
          />
        </motion.div>
        <HpBar hp={aHp} max={attacker.maxHp} name={attacker.name} />
      </div>

      {/* LOG + MENU */}
      <div className="mt-auto">
        <div className="mx-3 mb-2 min-h-[4.5rem] rounded-gummy border-2 border-anymon-ink/10 bg-white/95 p-3 text-sm font-medium text-anymon-ink shadow-gummy">
          {log}
        </div>

        <div className="rounded-t-gummy bg-anymon-ink/95 p-3">
          {phase === "player" ? (
            <div className="grid grid-cols-2 gap-2">
              {attacker.moves.map((m) => (
                <button
                  key={m.name}
                  onClick={() => playerTurn(m)}
                  className="group flex flex-col rounded-2xl bg-white px-3 py-2 text-left transition active:scale-95"
                >
                  <span className="font-bold leading-tight text-anymon-ink">
                    {m.emoji} {m.name}
                  </span>
                  <span className="font-retro text-[9px] tracking-wider text-anymon-ocean">
                    {m.kind === "status"
                      ? `support · acc ${m.accuracy}`
                      : `pow ${m.power} · acc ${m.accuracy}`}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-anymon-ink/55">
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
            <div className="flex h-[4.5rem] items-center justify-center font-retro text-xs tracking-widest text-white/80">
              {phase === "resolving" ? "resolving…" : "…"}
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
        className="text-center text-white"
      >
        <div
          className={`font-retro text-lg tracking-widest ${
            youWon ? "text-anymon-lime" : "text-red-400"
          }`}
        >
          {youWon ? "victory!" : "defeated!"}
        </div>
        <div className="mt-1 flex items-center justify-center gap-3 text-sm">
          {result.coinsAwarded > 0 && youWon && (
            <span className="rounded-full bg-yellow-400/90 px-3 py-1 font-bold text-yellow-900">
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
