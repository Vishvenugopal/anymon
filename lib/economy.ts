import { clampRarity, rarityMaxHp, type Anymon } from "./types";
import type { Store } from "./store";

// ---------------------------------------------------------------------------
// Anymon economy (simple + demo-friendly). The loop:
//   EARN coins by WINNING battles (wild, roaming auto-battles, PvP) and by
//   CAPTURING other trainers' roaming Anymon. SPEND coins to HEAL hurt Anymon.
// There is NO passive/idle farming anymore — coins only come from real wins.
// Coins are stored per-Anymon; the deck total is the sum across an owner's deck.
// ---------------------------------------------------------------------------

// ---- Coin rewards (single source of truth; routes import these) ----
export const WILD_WIN_COINS = 10; // win a single-player wild battle
export const ROAM_WIN_COINS = 3; // a roaming Anymon wins an auto-skirmish
export const CAPTURE_BONUS_COINS = 8; // bonus for capturing another trainer's Anymon
// (PvP reward stays PVP_COINS_AWARDED in types.ts to avoid an import cycle.)

// ---- Healing (the coin sink) ----
// Cost scales with missing HP, with a small floor so trivial heals still cost.
export const HEAL_COST_PER_HP = 0.3; // ~30 coins to fully heal a 100-HP Anymon
export const HEAL_MIN_COST = 3;

/** Stored max HP, falling back to the rarity-derived value for older records. */
export function effectiveMaxHp(a: Anymon): number {
  return typeof a.maxHp === "number" ? a.maxHp : rarityMaxHp(a.rarity ?? 1);
}

/** Current HP, defaulting to full for older records that predate the field. */
export function currentHp(a: Anymon): number {
  return typeof a.hp === "number" ? a.hp : effectiveMaxHp(a);
}

/** Coin cost to fully heal an Anymon (0 if already at full HP). */
export function healCost(a: Anymon): number {
  const missing = Math.max(0, effectiveMaxHp(a) - currentHp(a));
  if (missing <= 0) return 0;
  return Math.max(HEAL_MIN_COST, Math.ceil(missing * HEAL_COST_PER_HP));
}

/** Total coins an owner has across all their Anymon (the spendable wallet). */
export async function ownerCoinTotal(store: Store, ownerId: string): Promise<number> {
  const owned = await store.listByOwner(ownerId);
  return owned.reduce((sum, a) => sum + (a.coins || 0), 0);
}

/**
 * Spend `amount` coins from an owner's pooled wallet, deducting from the
 * richest Anymon first. Returns false (and changes nothing) if they can't afford
 * it. Keeps the per-Anymon coin model while letting players pay from any pile.
 */
export async function spendFromOwner(
  store: Store,
  ownerId: string,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return true;
  const owned = await store.listByOwner(ownerId);
  const total = owned.reduce((sum, a) => sum + (a.coins || 0), 0);
  if (total < amount) return false;
  let remaining = amount;
  const sorted = [...owned].sort((a, b) => b.coins - a.coins);
  for (const a of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(a.coins, remaining);
    if (take > 0) {
      await store.updateAnymon(a.id, { coins: a.coins - take });
      remaining -= take;
    }
  }
  return true;
}

/**
 * Record that a roaming Anymon was captured by another trainer by leaving a
 * notice-only "ghost" in the ORIGINAL owner's collection (state==="captured").
 * The real Anymon transfers to the capturer; this ghost lets the deck UI tell
 * the original owner instead of the creature silently vanishing. Acknowledging
 * it (apiAcknowledge) deletes the ghost.
 */
export async function recordCaptureNotice(
  store: Store,
  captured: Anymon,
  capturerName: string,
): Promise<void> {
  const ghost: Anymon = {
    ...captured,
    id: crypto.randomUUID(),
    ownerId: captured.ownerId, // original owner (snapshot taken before transfer)
    ownerName: captured.ownerName,
    state: "captured",
    capturedBy: capturerName,
    status: "ready",
    glbUrl: captured.glbUrl,
    meshyTaskId: null,
    deployedAt: null,
    lat: null,
    lng: null,
    pendingWins: 0,
    pendingCoins: 0,
    createdAt: Date.now(),
  };
  await store.saveAnymon(ghost);
}

/**
 * Normalizes an Anymon for client responses: backfills rarity/HP/notification
 * fields for any older records. (Replaces the old passive-coin `withLiveCoins`;
 * coins are no longer accrued over time.)
 */
export function publicAnymon(a: Anymon): Anymon {
  const rarity = clampRarity(a.rarity ?? 1);
  const maxHp = effectiveMaxHp({ ...a, rarity });
  return {
    ...a,
    rarity,
    maxHp,
    hp: currentHp({ ...a, maxHp }),
    pendingWins: a.pendingWins ?? 0,
    pendingCoins: a.pendingCoins ?? 0,
  };
}
