import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getMovesFor, scaleMovesByRarity } from "@/lib/moves";
import { judgeMatchup } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth-helpers";
import { clampRarity, rarityMaxHp } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Sets up a turn-based battle: validates the matchup, locks the defender, and
// returns both combatants with their (object-generated, cached) movesets.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

    const { attackerId, defenderId } = await req.json();
    const store = getStore();
    const attacker = await store.getAnymon(attackerId);
    const defender = await store.getAnymon(defenderId);
    if (!attacker || !defender) {
      return NextResponse.json({ error: "anymon not found" }, { status: 404 });
    }
    if (attacker.ownerId !== user.id) {
      return NextResponse.json({ error: "not your fighter" }, { status: 403 });
    }
    if (defender.id === attacker.id) {
      return NextResponse.json({ error: "pick a different target" }, { status: 400 });
    }

    // Lock the wild Anymon so two players can't battle it at once.
    const locked = await store.acquireLock(defenderId, 120000);
    if (!locked) {
      return NextResponse.json(
        { error: "this anymon is already in a battle!" },
        { status: 423 },
      );
    }

    const [aMoves, dMoves, matchup] = await Promise.all([
      getMovesFor(attacker),
      getMovesFor(defender),
      judgeMatchup(attacker.object, defender.object),
    ]);

    // Scale HP + move power by rarity so rarer Anymon are stronger. maxHp is the
    // battle's starting/cap HP; hp is the stored current HP (for healed/hurt UI).
    const pack = (a: typeof attacker, moves: typeof aMoves) => {
      const rarity = clampRarity(a.rarity ?? 1);
      const maxHp = typeof a.maxHp === "number" ? a.maxHp : rarityMaxHp(rarity);
      return {
        id: a.id,
        name: a.name,
        object: a.object,
        spriteDataUri: a.spriteDataUri,
        glbUrl: a.glbUrl,
        rarity,
        maxHp,
        hp: typeof a.hp === "number" ? a.hp : maxHp,
        moves: scaleMovesByRarity(moves, rarity),
      };
    };

    return NextResponse.json({
      attacker: pack(attacker, aMoves),
      defender: pack(defender, dMoves),
      matchup, // attacker = a, defender = b
    });
  } catch (e) {
    console.error("battle start error", e);
    return NextResponse.json({ error: "could not start battle" }, { status: 500 });
  }
}
