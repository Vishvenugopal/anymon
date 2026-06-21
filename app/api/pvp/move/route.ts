import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth-helpers";
import { effectivenessLabel, resolveMove } from "@/lib/pvp";
import { recordCaptureNotice } from "@/lib/economy";
import {
  MAX_DECK,
  PVP_COINS_AWARDED,
  type BattleFighter,
  type BattleLogEntry,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Apply one turn: validate it's the caller's turn, roll damage × effectiveness,
// append science reasoning, flip the turn, and resolve a faint to a winner.
export async function POST(req: Request) {
  const store = getStore();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

    const { roomId, moveName } = await req.json();
    if (!roomId || !moveName) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    const locked = await store.acquireLock(`room:${roomId}`, 8000);
    if (!locked) return NextResponse.json({ error: "busy, try again" }, { status: 423 });
    try {
      const room = await store.getRoom(roomId);
      if (!room || !room.opponent) {
        return NextResponse.json({ error: "room not ready" }, { status: 404 });
      }
      if (room.status !== "active") {
        return NextResponse.json({ error: "battle is over" }, { status: 409 });
      }
      if (room.turnUserId !== user.id) {
        return NextResponse.json({ error: "not your turn" }, { status: 409 });
      }

      const attackerIsChallenger = room.challenger.userId === user.id;
      if (!attackerIsChallenger && room.opponent.userId !== user.id) {
        return NextResponse.json({ error: "not in this battle" }, { status: 403 });
      }
      const attacker: BattleFighter = attackerIsChallenger ? room.challenger : room.opponent;
      const defender: BattleFighter = attackerIsChallenger ? room.opponent : room.challenger;

      const move = attacker.moves.find((m) => m.name === moveName);
      if (!move) return NextResponse.json({ error: "unknown move" }, { status: 400 });

      // challenger = a, opponent = b
      const eff = attackerIsChallenger
        ? room.matchup?.aToB.multiplier ?? 1
        : room.matchup?.bToA.multiplier ?? 1;
      const effReason = attackerIsChallenger
        ? room.matchup?.aToB.reason
        : room.matchup?.bToA.reason;

      const r = resolveMove(move, eff);

      const entry: BattleLogEntry = { text: "", reason: move.blurb, effectiveness: eff };
      if (move.kind === "status") {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + r.heal);
        entry.text = `${attacker.username}'s ${attacker.name} used ${move.emoji} ${move.name}!`;
      } else if (r.miss) {
        entry.text = `${attacker.username}'s ${attacker.name} used ${move.name}… but it missed!`;
      } else {
        defender.hp = Math.max(0, defender.hp - r.dmg);
        const label = effectivenessLabel(eff);
        entry.text = `${attacker.username}'s ${attacker.name} used ${move.emoji} ${move.name}! ${
          r.crit ? "Critical hit! " : ""
        }${label}`.trim();
        if (label && effReason) entry.reason = `${effReason} (${move.blurb})`;
      }

      const log = [...room.log, entry];

      // Faint -> finish.
      if (defender.hp <= 0) {
        const winner = attacker;
        const loser = defender;
        // coins to the winner's fighter (+ pending "+$" tally for the UI effect)
        const wAny = await store.getAnymon(winner.anymonId);
        if (wAny) {
          await store.updateAnymon(winner.anymonId, {
            coins: wAny.coins + PVP_COINS_AWARDED,
            pendingCoins: (wAny.pendingCoins ?? 0) + PVP_COINS_AWARDED,
          });
        }
        // capture the loser's fighter if there's deck room
        let captured = false;
        const loserAny = await store.getAnymon(loser.anymonId);
        if (loserAny && loserAny.ownerId === loser.userId) {
          const deckCount = await store.countByState(winner.userId, "deck");
          // Notify the original owner before ownership transfers.
          await recordCaptureNotice(store, loserAny, winner.username);
          await store.geoRemove(loser.anymonId).catch(() => {});
          await store.updateAnymon(loser.anymonId, {
            ownerId: winner.userId,
            ownerName: winner.username,
            state: deckCount < MAX_DECK ? "deck" : "wild",
            deployedAt: deckCount < MAX_DECK ? null : loserAny.deployedAt,
          });
          captured = true;
        }
        log.push({ text: `${loser.username}'s ${loser.name} fainted! ${winner.username} wins!` });

        await store.updateRoom(roomId, {
          challenger: attackerIsChallenger ? attacker : defender,
          opponent: attackerIsChallenger ? defender : attacker,
          log,
          status: "finished",
          turnUserId: null,
          winnerId: winner.userId,
          coinsAwarded: PVP_COINS_AWARDED,
          captured,
        });
        await store.setUserRoom(room.challenger.userId, null);
        await store.setUserRoom(room.opponent.userId, null);
        return NextResponse.json({ ok: true });
      }

      // Otherwise flip the turn.
      await store.updateRoom(roomId, {
        challenger: attackerIsChallenger ? attacker : defender,
        opponent: attackerIsChallenger ? defender : attacker,
        log,
        turnUserId: defender.userId,
      });
      return NextResponse.json({ ok: true });
    } finally {
      await store.releaseLock(`room:${roomId}`);
    }
  } catch (e) {
    console.error("pvp move error", e);
    return NextResponse.json({ error: "move failed" }, { status: 500 });
  }
}
