import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ROAM_WIN_COINS } from "@/lib/economy";
import { AUTO_BATTLE_CHANCE, NEARBY_RADIUS_M } from "@/lib/types";

export const runtime = "nodejs";

// Lightweight background mechanic: when two wild Anymons of DIFFERENT types are
// close, there's a 50% chance they auto-skirmish and the winner's owner earns a
// few coins. Coin-only (no ownership change) to stay cheap and safe to run often.
export async function POST(req: Request) {
  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ battles: 0 });
    }
    const store = getStore();
    const hits = await store.geoSearch(lng, lat, NEARBY_RADIUS_M);
    if (hits.length < 2) return NextResponse.json({ battles: 0 });

    // Only consider the two closest for a single cheap tick.
    const a = await store.getAnymon(hits[0].id);
    const b = await store.getAnymon(hits[1].id);
    if (!a || !b || a.state !== "wild" || b.state !== "wild") {
      return NextResponse.json({ battles: 0 });
    }
    if (a.object === b.object) return NextResponse.json({ battles: 0 });
    if (Math.random() > AUTO_BATTLE_CHANCE) return NextResponse.json({ battles: 0 });

    const winner = Math.random() < 0.5 ? a : b;
    // Record the roaming win: coins + a pending tally the deck shows as
    // "won N battles / +$" the next time the owner opens their deck.
    await store.updateAnymon(winner.id, {
      coins: winner.coins + ROAM_WIN_COINS,
      pendingWins: (winner.pendingWins ?? 0) + 1,
      pendingCoins: (winner.pendingCoins ?? 0) + ROAM_WIN_COINS,
    });

    return NextResponse.json({
      battles: 1,
      winner: winner.name,
      headline: `${a.name} and ${b.name} skirmished while roaming`,
    });
  } catch {
    return NextResponse.json({ battles: 0 });
  }
}
