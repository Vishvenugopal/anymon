import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// Acknowledge / clear a notification attached to an Anymon:
//   - a state==="captured" notice ghost  -> deleted (dismissed)
//   - a roaming Anymon with pendingWins   -> tally cleared (kept)
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

    if (anymon.state === "captured") {
      await store.deleteAnymon(id); // dismiss the capture notice
      return NextResponse.json({ ok: true, dismissed: true });
    }

    await store.updateAnymon(id, { pendingWins: 0, pendingCoins: 0 });
    return NextResponse.json({ ok: true, cleared: true });
  } catch (e) {
    console.error("notify ack error", e);
    return NextResponse.json({ ok: false, error: "ack failed" }, { status: 500 });
  }
}
