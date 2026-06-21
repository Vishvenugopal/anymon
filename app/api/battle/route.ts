import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { judgeBattle } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MAX_DECK, type BattleOutcome } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const COINS_AWARDED = 10;

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

    const attacker = await store.getAnymon(attackerId);
    const defender = await store.getAnymon(defenderId);
    if (!attacker || !defender) {
      return NextResponse.json({ error: "anymon not found" }, { status: 404 });
    }
    if (attacker.ownerId !== ownerId) {
      return NextResponse.json({ error: "not your attacker" }, { status: 403 });
    }

    // Atomic lock so two players can't battle the same wild Anymon at once.
    const locked = await store.acquireLock(defenderId, 15000);
    if (!locked) {
      return NextResponse.json(
        { error: "this anymon is already in a battle!" },
        { status: 423 },
      );
    }

    const locationHint =
      defender.city && defender.city !== "Somewhere"
        ? `near ${defender.city}`
        : undefined;

    const raw = await judgeBattle({
      aObject: attacker.object,
      bObject: defender.object,
      locationHint,
    });

    const attackerWon = raw.winner === "A";
    const winner = attackerWon ? attacker : defender;
    const loser = attackerWon ? defender : attacker;

    // Award coins to the winner.
    await store.updateAnymon(winner.id, { coins: winner.coins + COINS_AWARDED });

    // Capture: attacker steals a defending Anymon owned by someone else.
    let captured = false;
    if (attackerWon && defender.ownerId !== ownerId) {
      const deckCount = await store.countByState(ownerId, "deck");
      if (deckCount < MAX_DECK) {
        await store.geoRemove(defender.id);
        await store.updateAnymon(defender.id, {
          ownerId,
          ownerName: attacker.ownerName,
          state: "deck",
          deployedAt: null,
        });
      } else {
        await store.updateAnymon(defender.id, {
          ownerId,
          ownerName: attacker.ownerName,
        });
      }
      captured = true;
    }

    await store.releaseLock(defenderId);

    const outcome: BattleOutcome = {
      winnerId: winner.id,
      loserId: loser.id,
      winnerObject: winner.object,
      loserObject: loser.object,
      headline: raw.headline,
      lesson: raw.lesson,
      field: raw.field,
      coinsAwarded: COINS_AWARDED,
      captured,
    };
    return NextResponse.json(outcome);
  } catch (e) {
    console.error("battle error", e);
    if (defenderId) await store.releaseLock(defenderId).catch(() => {});
    return NextResponse.json({ error: "battle failed" }, { status: 500 });
  }
}
