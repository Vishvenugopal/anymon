import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildFighter } from "@/lib/pvp";
import {
  PVP_CHALLENGE_COOLDOWN_MS,
  type BattleRoom,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Creates a pending PvP invite. Anti-spam: a per-direction cooldown plus a
// single-live-room rule for each participant.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.username) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    const { opponentUserId, fighterId } = await req.json();
    if (!opponentUserId || !fighterId) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    if (opponentUserId === user.id) {
      return NextResponse.json({ error: "you can't challenge yourself" }, { status: 400 });
    }

    const store = getStore();

    // anti-spam: short cooldown per (challenger -> opponent) direction.
    const fresh = await store.acquireLock(
      `pvpcd:${user.id}:${opponentUserId}`,
      PVP_CHALLENGE_COOLDOWN_MS,
    );
    if (!fresh) {
      return NextResponse.json(
        { error: "you just challenged them — give it a sec" },
        { status: 429 },
      );
    }

    // single-live-room: reject if either side is already in a pending/active room.
    if (await hasLiveRoom(user.id)) {
      return NextResponse.json({ error: "you're already in a battle" }, { status: 409 });
    }
    if (await hasLiveRoom(opponentUserId)) {
      return NextResponse.json(
        { error: "that trainer is already battling" },
        { status: 409 },
      );
    }

    const fighter = await store.getAnymon(fighterId);
    if (!fighter || fighter.ownerId !== user.id) {
      return NextResponse.json({ error: "not your fighter" }, { status: 403 });
    }

    const challenger = await buildFighter(fighter, user.id, user.username);
    const now = Date.now();
    const room: BattleRoom = {
      id: crypto.randomUUID(),
      challenger,
      opponent: null,
      status: "pending",
      turnUserId: null,
      log: [],
      matchup: null,
      winnerId: null,
      coinsAwarded: 0,
      captured: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await store.saveRoom(room);
    await store.setUserRoom(user.id, room.id);
    await store.setIncomingInvite(opponentUserId, room.id);

    return NextResponse.json({ roomId: room.id });
  } catch (e) {
    console.error("pvp challenge error", e);
    return NextResponse.json({ error: "could not send challenge" }, { status: 500 });
  }
}

async function hasLiveRoom(userId: string): Promise<boolean> {
  const store = getStore();
  const roomId = await store.getUserRoom(userId);
  if (!roomId) return false;
  const room = await store.getRoom(roomId);
  if (!room || room.status === "finished" || room.status === "declined" || room.status === "cancelled") {
    await store.setUserRoom(userId, null);
    return false;
  }
  return true;
}
