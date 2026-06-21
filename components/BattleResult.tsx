"use client";

import { motion } from "framer-motion";
import type { BattleOutcome } from "@/lib/client";

export default function BattleResult({
  outcome,
  attackerId,
  onClose,
}: {
  outcome: BattleOutcome;
  attackerId: string;
  onClose: () => void;
}) {
  const youWon = outcome.winnerId === attackerId;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="card-gummy w-full max-w-sm overflow-hidden p-6 text-center"
      >
        <div
          className={`font-retro text-lg tracking-widest ${
            youWon ? "text-anymon-lime" : "text-anymon-ocean"
          }`}
        >
          {youWon ? "victory!" : "defeated!"}
        </div>

        <div className="mt-3 text-2xl font-bold">
          {outcome.winnerObject}-mon beats {outcome.loserObject}-mon
        </div>

        <div className="mt-1 text-base font-semibold text-anymon-ocean">
          “{outcome.headline}”
        </div>

        <div className="mt-4 rounded-2xl bg-anymon-cloud p-4 text-left text-sm leading-relaxed">
          <div className="mb-1 inline-block rounded-full bg-anymon-lime px-2 py-0.5 font-retro text-[10px] uppercase tracking-wider text-white">
            {outcome.field}
          </div>
          <p>{outcome.lesson}</p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4 text-sm font-semibold">
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700">
            +{outcome.coinsAwarded} coins
          </span>
          {outcome.captured && (
            <span className="rounded-full bg-anymon-lime/20 px-3 py-1 text-anymon-lime">
              captured!
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="gummy-btn mt-6 w-full bg-anymon-ocean py-3 shadow-gummy"
        >
          nice
        </button>
      </motion.div>
    </motion.div>
  );
}
