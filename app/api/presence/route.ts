import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { NEARBY_PLAYERS_RADIUS_M } from "@/lib/types";

export const runtime = "nodejs";

// Upserts the caller's live presence and returns nearby trainers + any incoming
// PvP invite. Called from the boot/refresh loop on the client.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.username) {
    return NextResponse.json({ trainers: [], invite: null }, { status: 200 });
  }

  let lat = NaN;
  let lng = NaN;
  try {
    const body = await req.json();
    lat = Number(body.lat);
    lng = Number(body.lng);
  } catch {
    /* ignore */
  }

  const store = getStore();

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    await store.setPresence(user.id, lat, lng, user.username);
  }

  const trainers =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? (await store.nearbyPlayers(lat, lng, NEARBY_PLAYERS_RADIUS_M))
          .filter((t) => t.userId !== user.id)
          .map((t) => ({ ...t, distM: Math.round(t.distM) }))
      : [];

  // Surface a pending invite addressed to me (if its room is still pending).
  let invite: { roomId: string; fromUsername: string } | null = null;
  const inviteRoomId = await store.getIncomingInvite(user.id);
  if (inviteRoomId) {
    const room = await store.getRoom(inviteRoomId);
    if (room && room.status === "pending") {
      invite = { roomId: room.id, fromUsername: room.challenger.username };
    } else {
      await store.setIncomingInvite(user.id, null);
    }
  }

  return NextResponse.json({ trainers, invite });
}
