import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  CAPTURE_BONUS_COINS,
  recordCaptureNotice,
  WILD_WIN_COINS,
  effectiveMaxHp,
} from "@/lib/economy";
import { MAX_DECK, type BattleOutcome } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const COINS_AWARDED = WILD_WIN_COINS;

// Default post-battle HP (fraction of maxHp) when the client doesn't send the
// exact remaining HP. Winning leaves the fighter lightly hurt; losing leaves it
// badly hurt — both create a reason to spend coins healing.
const WIN_HP_FRACTION = 0.7;
const LOSS_HP_FRACTION = 0.3;

// Resolves a finished turn-based battle: awards coins to the winner and, if the
// player beat someone else's wild Anymon, captures it. The interactive fight
// happens on the client; this just commits the outcome and releases the lock.
export async function POST(req: Request) {
  let defenderId = "";
  const store = getStore();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    const ownerId = user.id;

    const body = await req.json();
    const attackerId: string = body.attackerId;
    defenderId = body.defenderId;
    const winnerId: string = body.winnerId;
    // Optional precise remaining HP from the client; falls back to a sensible
    // fraction of maxHp so the fighter ends the battle "hurt" either way.
    const attackerHpFromClient: number | undefined =
      typeof body.attackerHp === "number" ? body.attackerHp : undefined;

    const attacker = await store.getAnymon(attackerId);
    const defender = await store.getAnymon(defenderId);
    if (!attacker || !defender) {
      return NextResponse.json({ error: "anymon not found" }, { status: 404 });
    }
    if (attacker.ownerId !== ownerId) {
      return NextResponse.json({ error: "not your fighter" }, { status: 403 });
    }

    const attackerWon = winnerId === attacker.id;
    const winner = attackerWon ? attacker : defender;
    const loser = attackerWon ? defender : attacker;

    // Award coins + record the win as a pending "+$" amount for the UI effect.
    await store.updateAnymon(winner.id, {
      coins: winner.coins + COINS_AWARDED,
      pendingCoins: (winner.pendingCoins ?? 0) + COINS_AWARDED,
    });

    // Track damage: the player's fighter ends the battle hurt (heal costs coins).
    const aMax = effectiveMaxHp(attacker);
    const attackerHp =
      attackerHpFromClient !== undefined
        ? Math.max(0, Math.min(aMax, Math.round(attackerHpFromClient)))
        : Math.round(aMax * (attackerWon ? WIN_HP_FRACTION : LOSS_HP_FRACTION));
    await store.updateAnymon(attacker.id, { hp: attackerHp });

    // Capture: beat a wild Anymon owned by someone else -> it joins your deck.
    let captured = false;
    if (attackerWon && defender.ownerId !== ownerId) {
      const deckCount = await store.countByState(ownerId, "deck");
      // Leave the original owner a capture notice before ownership transfers.
      await recordCaptureNotice(store, defender, attacker.ownerName);
      await store.geoRemove(defender.id);
      await store.updateAnymon(defender.id, {
        ownerId,
        ownerName: attacker.ownerName,
        state: deckCount < MAX_DECK ? "deck" : "wild",
        deployedAt: deckCount < MAX_DECK ? null : defender.deployedAt,
        hp: Math.round(effectiveMaxHp(defender) * LOSS_HP_FRACTION),
      });
      // Capture bonus to the capturing fighter (extra "+$" tally too).
      await store.updateAnymon(attacker.id, {
        coins: attacker.coins + COINS_AWARDED + CAPTURE_BONUS_COINS,
        pendingCoins: (attacker.pendingCoins ?? 0) + COINS_AWARDED + CAPTURE_BONUS_COINS,
        hp: attackerHp,
      });
      captured = true;
    }

    await store.releaseLock(defenderId);

    const outcome: BattleOutcome = {
      winnerId: winner.id,
      loserId: loser.id,
      winnerObject: winner.object,
      loserObject: loser.object,
      headline: attackerWon ? "you won!" : "you were defeated!",
      lesson: "",
      field: "battle",
      coinsAwarded: COINS_AWARDED,
      captured,
    };
    return NextResponse.json(outcome);
  } catch (e) {
    console.error("battle resolve error", e);
    if (defenderId) await store.releaseLock(defenderId).catch(() => {});
    return NextResponse.json({ error: "battle failed" }, { status: 500 });
  }
}
