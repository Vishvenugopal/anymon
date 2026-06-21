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

  // Persist once the model is ready so we don't poll Meshy forever.
  if (result.status === "ready" && result.glbUrl && anymon.status !== "ready") {
    await store.updateAnymon(id, { status: "ready", glbUrl: result.glbUrl });
  }

  return NextResponse.json(result);
}
