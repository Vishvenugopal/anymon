import { getMovesFor, scaleMovesByRarity } from "./moves";
import type { Anymon, BattleFighter, Move } from "./types";
import { clampRarity, rarityMaxHp } from "./types";

/**
 * Build a server-authoritative fighter (cached moves + full HP). HP and move
 * power are scaled by the Anymon's rarity so rarer creatures are stronger in
 * PvP exactly like in single-player.
 */
export async function buildFighter(
  a: Anymon,
  userId: string,
  username: string,
): Promise<BattleFighter> {
  const moves = await getMovesFor(a);
  const rarity = clampRarity(a.rarity ?? 1);
  const maxHp = typeof a.maxHp === "number" ? a.maxHp : rarityMaxHp(rarity);
  return {
    userId,
    username,
    anymonId: a.id,
    name: a.name,
    object: a.object,
    spriteDataUri: a.spriteDataUri,
    glbUrl: a.glbUrl,
    rarity,
    maxHp,
    hp: maxHp,
    moves: scaleMovesByRarity(moves, rarity),
  };
}

const STATUS_HEAL = 14;

export interface MoveResult {
  miss: boolean;
  crit: boolean;
  heal: number; // hp restored to the attacker (status moves)
  dmg: number; // damage dealt to the defender (after effectiveness)
}

/** Resolve a single move server-side, applying an effectiveness multiplier. */
export function resolveMove(move: Move, effectiveness: number): MoveResult {
  if (move.kind === "status") {
    return { miss: false, crit: false, heal: STATUS_HEAL, dmg: 0 };
  }
  if (Math.random() * 100 > move.accuracy) {
    return { miss: true, crit: false, heal: 0, dmg: 0 };
  }
  const crit = Math.random() < 0.12;
  const variance = 0.85 + Math.random() * 0.15;
  const base = move.power * variance * (crit ? 1.6 : 1);
  const dmg = Math.max(1, Math.round(base * effectiveness));
  return { miss: false, crit, heal: 0, dmg };
}

export function effectivenessLabel(mult: number): string {
  if (mult >= 2) return "very effective";
  if (mult >= 1.5) return "effective";
  if (mult <= 0.5) return "not very effective";
  return "";
}
