import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// Permanently delete one of the CURRENT user's Anymon (deck or roaming). Also
// removes it from the geo index (deleteAnymon handles that) so a roaming one
// stops appearing in the wild. Identity is always server-derived — we never
// trust an owner id from the client body.
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

    await store.geoRemove(id);
    await store.deleteAnymon(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("delete error", e);
    return NextResponse.json({ ok: false, error: "delete failed" }, { status: 500 });
  }
}
