"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import BattleResult from "./BattleResult";
import {
  apiBattle,
  type Anymon,
  type BattleOutcome,
  type Position,
} from "@/lib/client";
import { NEARBY_RADIUS_M } from "@/lib/types";

type NearbyAnymon = Anymon & { distM: number; mine: boolean };

export default function MapView({
  nearby,
  deck,
  pos,
  onRefresh,
}: {
  nearby: NearbyAnymon[];
  deck: Anymon[];
  pos: Position | null;
  onRefresh: () => void;
}) {
  const attackers = deck.filter((a) => a.state === "deck");
  const [attackerId, setAttackerId] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [lastAttacker, setLastAttacker] = useState<string>("");

  const chosenAttacker = attackerId || attackers[0]?.id || "";

  const dots = useMemo(
    () =>
      nearby.map((a, i) => {
        const angle = (i / Math.max(nearby.length, 1)) * Math.PI * 2;
        const r = Math.min(a.distM / NEARBY_RADIUS_M, 1) * 42;
        return {
          a,
          left: 50 + Math.cos(angle) * r,
          top: 50 + Math.sin(angle) * r,
        };
      }),
    [nearby],
  );

  const battle = async (defender: NearbyAnymon) => {
    setError(null);
    if (!pos) return setError("need your location");
    if (!chosenAttacker) return setError("scan an object first to get a fighter");
    setBusyId(defender.id);
    setLastAttacker(chosenAttacker);
    try {
      const res = await apiBattle({
        attackerId: chosenAttacker,
        defenderId: defender.id,
        pos,
      });
      setOutcome(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-anymon-ink p-4 pb-24 text-white">
      <div className="mb-3 text-center">
        <div className="font-retro text-xs tracking-widest text-anymon-lime">
          wild radar
        </div>
        <div className="text-sm text-white/60">
          anymons within {NEARBY_RADIUS_M}m
        </div>
      </div>

      {/* radar */}
      <div className="relative mx-auto mb-5 aspect-square w-full max-w-xs rounded-full border border-anymon-lime/30 bg-gradient-to-b from-anymon-ocean/10 to-anymon-lime/10">
        <div className="absolute inset-[18%] rounded-full border border-anymon-lime/20" />
        <div className="absolute inset-[38%] rounded-full border border-anymon-lime/20" />
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_#fff]" />
        {dots.map(({ a, left, top }) => (
          <motion.div
            key={a.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <div
              className={`h-4 w-4 rounded-full ${
                a.mine ? "bg-anymon-ocean" : "bg-anymon-lime"
              } shadow-[0_0_10px_currentColor] animate-bob`}
            />
          </motion.div>
        ))}
      </div>

      {/* attacker picker */}
      <div className="mb-3 flex items-center gap-2 rounded-gummy bg-white/10 p-2 text-sm">
        <span className="pl-2 text-white/60">fight with:</span>
        <select
          value={chosenAttacker}
          onChange={(e) => setAttackerId(e.target.value)}
          className="flex-1 rounded-full bg-white px-3 py-2 text-anymon-ink"
        >
          {attackers.length === 0 && <option value="">no fighters in deck</option>}
          {attackers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-3 rounded-full bg-red-500/90 px-4 py-2 text-center text-sm">
          {error}
        </div>
      )}

      {/* list */}
      {nearby.length === 0 ? (
        <div className="rounded-gummy border-2 border-dashed border-white/20 p-6 text-center text-sm text-white/50">
          no wild anymons nearby. release one or wait for the area to populate.
        </div>
      ) : (
        <div className="space-y-2">
          {nearby.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-gummy bg-white/10 p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.spriteDataUri}
                alt={a.name}
                className="h-12 w-12 rounded-2xl bg-white object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{a.name}</div>
                <div className="truncate text-[11px] text-white/60">
                  {a.mine ? "yours · " : `by ${a.ownerName} · `}
                  {a.city}, {a.country} · {a.distM}m
                </div>
              </div>
              <button
                onClick={() => battle(a)}
                disabled={busyId === a.id || a.mine}
                className="gummy-btn bg-anymon-lime px-4 py-2 text-sm shadow-gummy-lime disabled:opacity-40"
              >
                {a.mine ? "yours" : busyId === a.id ? "…" : "battle"}
              </button>
            </div>
          ))}
        </div>
      )}

      {outcome && (
        <BattleResult
          outcome={outcome}
          attackerId={lastAttacker}
          onClose={() => {
            setOutcome(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
