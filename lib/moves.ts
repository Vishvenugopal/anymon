import { generateMoves } from "./claude";
import { getStore } from "./store";
import { rarityPowerMult, type Anymon, type Move } from "./types";

/** Returns an Anymon's moveset, generating + caching it on first battle. */
export async function getMovesFor(a: Anymon): Promise<Move[]> {
  if (a.moves && a.moves.length === 4) return a.moves;
  const moves = await generateMoves(a.object);
  await getStore().updateAnymon(a.id, { moves });
  return moves;
}

// Highest power a scaled move can reach (base moves cap at 40; rarity can push
// a touch past that to make rare Anymon hit noticeably harder).
const SCALED_POWER_CAP = 60;

/**
 * Scales attacking-move power by rarity so rarer Anymon hit harder (r1=1.0×,
 * r5=1.4×). Status moves (power 0) are left untouched. The cached base moveset
 * is never mutated — this is applied when building a combatant for a battle.
 */
export function scaleMovesByRarity(moves: Move[], rarity: number): Move[] {
  const mult = rarityPowerMult(rarity);
  if (mult === 1) return moves;
  return moves.map((m) =>
    m.kind === "status"
      ? m
      : { ...m, power: Math.min(SCALED_POWER_CAP, Math.round(m.power * mult)) },
  );
}
