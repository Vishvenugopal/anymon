import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MAX_DECK, type BattleOutcome } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const COINS_AWARDED = 10;

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

    await store.updateAnymon(winner.id, { coins: winner.coins + COINS_AWARDED });

    // Capture: beat a wild Anymon owned by someone else -> it joins your deck.
    let captured = false;
    if (attackerWon && defender.ownerId !== ownerId) {
      const deckCount = await store.countByState(ownerId, "deck");
      await store.geoRemove(defender.id);
      await store.updateAnymon(defender.id, {
        ownerId,
        ownerName: attacker.ownerName,
        state: deckCount < MAX_DECK ? "deck" : "wild",
        deployedAt: deckCount < MAX_DECK ? null : defender.deployedAt,
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
