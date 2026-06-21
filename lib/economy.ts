import { COINS_PER_MIN, type Anymon } from "./types";

/** Current coin total including passive farming since deployment. */
export function liveCoins(a: Anymon): number {
  if (a.state !== "wild" || !a.deployedAt) return a.coins;
  const mins = (Date.now() - a.deployedAt) / 60000;
  return a.coins + Math.floor(mins * COINS_PER_MIN);
}

export function withLiveCoins(a: Anymon): Anymon {
  return { ...a, coins: liveCoins(a) };
}
