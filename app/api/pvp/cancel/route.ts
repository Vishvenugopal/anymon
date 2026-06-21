import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// Cancel a room (challenger withdrawing a pending invite, or either side bailing
// mid-battle). Best-effort; clears the live-room + invite pointers.
export async function POST(req: Request) {
  const store = getStore();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { roomId } = await req.json();
    if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

    const room = await store.getRoom(roomId);
    if (!room) return NextResponse.json({ ok: true });

    const isParticipant =
      room.challenger.userId === user.id || room.opponent?.userId === user.id;
    if (!isParticipant) return NextResponse.json({ ok: false }, { status: 403 });

    if (room.status === "pending" || room.status === "active") {
      await store.updateRoom(roomId, { status: "cancelled", turnUserId: null });
    }
    await store.setUserRoom(room.challenger.userId, null);
    if (room.opponent) await store.setUserRoom(room.opponent.userId, null);
    // Clear any dangling invite to the challenged side.
    if (room.opponent) await store.setIncomingInvite(room.opponent.userId, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("pvp cancel error", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
