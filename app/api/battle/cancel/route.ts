import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// Frees the defender lock when a player flees before the battle resolves.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    const { defenderId } = await req.json();
    if (defenderId) await getStore().releaseLock(defenderId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
