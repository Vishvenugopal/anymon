import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { resolveGlb } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const store = getStore();
  const anymon = await store.getAnymon(id);
  if (!anymon) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await resolveGlb(anymon);

  // Persist terminal states so we stop polling the provider AND so the stored
  // Anymon reflects reality (ready with its glb, or failed). Persisting "failed"
  // is what guarantees the next poll short-circuits and the UI stops incubating.
  if (result.status === "ready" && result.glbUrl && anymon.status !== "ready") {
    await store.updateAnymon(id, { status: "ready", glbUrl: result.glbUrl });
  } else if (result.status === "failed" && anymon.status !== "failed") {
    await store.updateAnymon(id, { status: "failed" });
  }

  // Always return the 2D sprite + a terminal flag so the client can leave the
  // "incubating" screen even when there's no 3D model (failed / fallback).
  return NextResponse.json({
    ...result,
    done: result.status === "ready" || result.status === "failed",
    spriteDataUri: anymon.spriteDataUri,
  });
}
