import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// Poll endpoint: returns the shared room state for both clients.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ room: null }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ room: null }, { status: 400 });

  const store = getStore();
  const room = await store.getRoom(id);
  if (!room) return NextResponse.json({ room: null }, { status: 404 });

  // Only participants (or the still-invited target) can read the room.
  const isParticipant =
    room.challenger.userId === user.id || room.opponent?.userId === user.id;
  const invitedTo = await store.getIncomingInvite(user.id);
  if (!isParticipant && invitedTo !== id) {
    return NextResponse.json({ room: null }, { status: 403 });
  }

  return NextResponse.json({ room });
}
