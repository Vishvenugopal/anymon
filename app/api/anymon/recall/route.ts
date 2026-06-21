import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MAX_DECK } from "@/lib/types";

export const runtime = "nodejs";

// Bring a ROAMING Anymon back into the deck (the inverse of release-to-wild).
// Respects MAX_DECK and removes it from the geo index so it stops roaming.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    }
    const store = getStore();

    const anymon = await store.getAnymon(id);
    if (!anymon || anymon.ownerId !== user.id) {
      return NextResponse.json({ ok: false, error: "not your anymon" }, { status: 403 });
    }
    if (anymon.state !== "wild") {
      return NextResponse.json(
        { ok: false, error: "this anymon isn't roaming" },
        { status: 409 },
      );
    }

    const deckCount = await store.countByState(user.id, "deck");
    if (deckCount >= MAX_DECK) {
      return NextResponse.json(
        { ok: false, error: `deck is full (max ${MAX_DECK})` },
        { status: 409 },
      );
    }

    await store.geoRemove(id);
    await store.updateAnymon(id, { state: "deck", deployedAt: null });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("recall error", e);
    return NextResponse.json({ ok: false, error: "recall failed" }, { status: 500 });
  }
}
