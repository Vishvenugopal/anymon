import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MAX_WILD } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });

    const { id, lat, lng } = await req.json();
    if (!id || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    }
    const store = getStore();

    const anymon = await store.getAnymon(id);
    if (!anymon || anymon.ownerId !== user.id) {
      return NextResponse.json({ ok: false, error: "not your anymon" }, { status: 403 });
    }
    if (anymon.state === "wild") {
      return NextResponse.json({ ok: false, error: "already in the wild" }, { status: 409 });
    }

    const wildCount = await store.countByState(user.id, "wild");
    if (wildCount >= MAX_WILD) {
      return NextResponse.json(
        { ok: false, error: `wild is full (max ${MAX_WILD})` },
        { status: 409 },
      );
    }

    await store.updateAnymon(id, {
      state: "wild",
      lat,
      lng,
      deployedAt: Date.now(),
    });
    await store.geoAdd(id, lng, lat);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("release error", e);
    return NextResponse.json({ ok: false, error: "release failed" }, { status: 500 });
  }
}
