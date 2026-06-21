import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { judgeMatchup } from "@/lib/claude";
import { buildFighter } from "@/lib/pvp";

export const runtime = "nodejs";
export const maxDuration = 30;

// Accept or decline a pending invite. On accept: set the opponent fighter, init
// HP + matchup, choose the first turn, and flip the room to active.
export async function POST(req: Request) {
  const store = getStore();
  try {
    const user = await getCurrentUser();
    if (!user || !user.username) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    const { roomId, accept, fighterId } = await req.json();
    if (!roomId) return NextResponse.json({ error: "missing room" }, { status: 400 });

    // Only the invited trainer may respond.
    const myInvite = await store.getIncomingInvite(user.id);
    if (myInvite !== roomId) {
      return NextResponse.json({ error: "no invite for you" }, { status: 403 });
    }

    const room = await store.getRoom(roomId);
    if (!room) return NextResponse.json({ error: "room gone" }, { status: 404 });
    if (room.status !== "pending") {
      return NextResponse.json({ error: "invite no longer pending" }, { status: 409 });
    }

    if (!accept) {
      await store.updateRoom(roomId, { status: "declined" });
      await store.setIncomingInvite(user.id, null);
      await store.setUserRoom(room.challenger.userId, null);
      return NextResponse.json({ ok: true });
    }

    if (!fighterId) {
      return NextResponse.json({ error: "pick a fighter" }, { status: 400 });
    }
    const fighter = await store.getAnymon(fighterId);
    if (!fighter || fighter.ownerId !== user.id) {
      return NextResponse.json({ error: "not your fighter" }, { status: 403 });
    }

    // Serialize the accept so a double-tap can't init the room twice.
    const locked = await store.acquireLock(`room:${roomId}`, 8000);
    if (!locked) {
      return NextResponse.json({ error: "busy, try again" }, { status: 423 });
    }
    try {
      const cur = await store.getRoom(roomId);
      if (!cur || cur.status !== "pending") {
        return NextResponse.json({ error: "invite no longer pending" }, { status: 409 });
      }
      const opponent = await buildFighter(fighter, user.id, user.username);
      const matchup = await judgeMatchup(cur.challenger.object, opponent.object);
      await store.updateRoom(roomId, {
        opponent,
        status: "active",
        matchup,
        turnUserId: cur.challenger.userId, // challenger moves first
        log: [{ text: matchup.intro }],
      });
      await store.setUserRoom(user.id, roomId);
      await store.setIncomingInvite(user.id, null);
      return NextResponse.json({ ok: true });
    } finally {
      await store.releaseLock(`room:${roomId}`);
    }
  } catch (e) {
    console.error("pvp respond error", e);
    return NextResponse.json({ error: "could not respond" }, { status: 500 });
  }
}
