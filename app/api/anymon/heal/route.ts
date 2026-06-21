import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  currentHp,
  effectiveMaxHp,
  healCost,
  ownerCoinTotal,
  spendFromOwner,
} from "@/lib/economy";

export const runtime = "nodejs";

// Pay coins to fully restore a hurt Anymon's HP. Cost scales with missing HP
// (see economy.healCost). Coins are spent from the owner's pooled wallet.
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

    const maxHp = effectiveMaxHp(anymon);
    if (currentHp(anymon) >= maxHp) {
      return NextResponse.json({ ok: true, healed: 0, cost: 0, hp: maxHp });
    }

    const cost = healCost(anymon);
    const paid = await spendFromOwner(store, user.id, cost);
    if (!paid) {
      return NextResponse.json(
        { ok: false, error: `not enough coins (need ${cost})`, cost },
        { status: 402 },
      );
    }

    await store.updateAnymon(id, { hp: maxHp });
    const coins = await ownerCoinTotal(store, user.id);

    return NextResponse.json({
      ok: true,
      healed: maxHp - currentHp(anymon),
      cost,
      hp: maxHp,
      coins, // owner's remaining pooled coins after paying
    });
  } catch (e) {
    console.error("heal error", e);
    return NextResponse.json({ ok: false, error: "heal failed" }, { status: 500 });
  }
}
