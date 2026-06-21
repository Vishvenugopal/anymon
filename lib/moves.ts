import { generateMoves } from "./claude";
import { getStore } from "./store";
import type { Anymon, Move } from "./types";

/** Returns an Anymon's moveset, generating + caching it on first battle. */
export async function getMovesFor(a: Anymon): Promise<Move[]> {
  if (a.moves && a.moves.length === 4) return a.moves;
  const moves = await generateMoves(a.object);
  await getStore().updateAnymon(a.id, { moves });
  return moves;
}
