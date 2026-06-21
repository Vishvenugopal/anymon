import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { runCapture } from "@/lib/pipeline";
import { getCurrentUser } from "@/lib/auth-helpers";
import { provider, is3DMock } from "@/lib/threed";
import { startHfGeneration } from "@/lib/hfspace";
import { MAX_DECK } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    if (!user.username) {
      return NextResponse.json({ error: "choose a username first" }, { status: 403 });
    }

    const body = await req.json();
    const pos = body.pos ?? null;
    const place = body.place ?? {};
    const imageBase64: string = body.imageBase64 || "";
    if (!imageBase64) {
      return NextResponse.json({ error: "missing image" }, { status: 400 });
    }

    const store = getStore();
    const deckCount = await store.countByState(user.id, "deck");
    if (deckCount >= MAX_DECK) {
      return NextResponse.json(
        { error: `deck is full (max ${MAX_DECK}). release one into the wild first.` },
        { status: 409 },
      );
    }

    const anymon = await runCapture({
      imageBase64,
      ownerId: user.id,
      ownerName: user.username,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      city: place.city || "Somewhere",
      country: place.country || "Earth",
    });

    await store.saveAnymon(anymon);

    // Start the HF Space 3D generation in the background (doesn't block the
    // instant-2D response). The job writes glbUrl back onto the Anymon.
    if (!is3DMock() && provider() === "hfspace" && anymon.meshyTaskId === "hfspace") {
      void startHfGeneration(anymon.id, anymon.spriteDataUri);
    }

    return NextResponse.json({
      id: anymon.id,
      object: anymon.object,
      spriteDataUri: anymon.spriteDataUri,
      meshyTaskId: anymon.meshyTaskId,
      ownerName: anymon.ownerName,
    });
  } catch (e) {
    console.error("capture error", e);
    return NextResponse.json({ error: "capture failed" }, { status: 500 });
  }
}
