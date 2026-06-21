"use client";

import type {
  Anymon,
  BattleOutcome,
  BattleRoom,
  GeoHit,
  Matchup,
  Move,
  NearbyTrainer,
} from "./types";

// The signed-in player, derived from the server session (not localStorage).
export interface Player {
  id: string;
  name: string;
}

export interface Position {
  lat: number;
  lng: number;
}

export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

export async function reverseGeocode(
  pos: Position,
): Promise<{ city: string; country: string }> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lng}&localityLanguage=en`,
    );
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      countryName?: string;
    };
    return {
      city: data.city || data.locality || "Somewhere",
      country: data.countryName || "Earth",
    };
  } catch {
    return { city: "Somewhere", country: "Earth" };
  }
}

// ---- Account ----
export interface MeResponse {
  authenticated: boolean;
  id?: string;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  needsUsername?: boolean;
}

export async function apiMe(): Promise<MeResponse> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    const text = await res.text();
    if (!res.ok || !text) return { authenticated: false };
    return JSON.parse(text) as MeResponse;
  } catch {
    return { authenticated: false };
  }
}

export async function apiSetUsername(
  username: string,
): Promise<{ ok?: boolean; username?: string; error?: string }> {
  const res = await fetch("/api/me/username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  return res.json();
}

// ---- Capture ----
export interface CaptureResult {
  id: string;
  object: string;
  spriteDataUri: string;
  meshyTaskId: string | null;
  ownerName: string;
}

export async function apiCapture(body: {
  imageBase64: string;
  pos: Position | null;
  place: { city: string; country: string };
}): Promise<CaptureResult> {
  const res = await fetch("/api/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "capture failed");
  return res.json();
}

export async function apiCaptureStatus(
  id: string,
): Promise<{ status: string; glbUrl: string | null; progress: number }> {
  const res = await fetch(`/api/capture/status?id=${encodeURIComponent(id)}`);
  return res.json();
}

// ---- Anymon data ----
export async function apiList(): Promise<Anymon[]> {
  const res = await fetch("/api/anymon/list", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.anymons as Anymon[];
}

export async function apiNearby(
  pos: Position,
): Promise<Array<Anymon & { distM: number; mine: boolean }>> {
  const res = await fetch(`/api/anymon/nearby?lat=${pos.lat}&lng=${pos.lng}`, {
    cache: "no-store",
  });
  const data = await res.json();
  return data.anymons;
}

export async function apiRelease(
  id: string,
  pos: Position,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/anymon/release", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat: pos.lat, lng: pos.lng }),
  });
  return res.json();
}

// ---- Turn-based battle ----
export interface Combatant {
  id: string;
  name: string;
  object: string;
  spriteDataUri: string;
  glbUrl: string | null;
  maxHp: number;
  moves: Move[];
}

export async function apiBattleStart(body: {
  attackerId: string;
  defenderId: string;
}): Promise<{ attacker: Combatant; defender: Combatant; matchup: Matchup }> {
  const res = await fetch("/api/battle/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "could not start battle");
  return res.json();
}

export async function apiBattleResolve(body: {
  attackerId: string;
  defenderId: string;
  winnerId: string;
}): Promise<BattleOutcome> {
  const res = await fetch("/api/battle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "battle failed");
  return res.json();
}

export function apiBattleCancel(defenderId: string): void {
  // fire-and-forget; releasing the lock is best-effort
  fetch("/api/battle/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ defenderId }),
    keepalive: true,
  }).catch(() => {});
}

export async function apiSeed(pos: Position): Promise<void> {
  await fetch("/api/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
  });
}

export async function apiAutoBattle(
  pos: Position,
): Promise<{ battles: number; headline?: string }> {
  try {
    const res = await fetch("/api/anymon/autobattle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
    });
    return res.json();
  } catch {
    return { battles: 0 };
  }
}

// ---- Presence (nearby trainers + incoming PvP invites) ----
export interface PresenceResult {
  trainers: NearbyTrainer[];
  invite: { roomId: string; fromUsername: string } | null;
}

export async function apiPresence(pos: Position): Promise<PresenceResult> {
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
    });
    if (!res.ok) return { trainers: [], invite: null };
    return res.json();
  } catch {
    return { trainers: [], invite: null };
  }
}

// ---- Trainer-vs-trainer (PvP) battles ----
export async function apiPvpChallenge(body: {
  opponentUserId: string;
  fighterId: string;
}): Promise<{ roomId?: string; error?: string }> {
  const res = await fetch("/api/pvp/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPvpRespond(body: {
  roomId: string;
  accept: boolean;
  fighterId?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch("/api/pvp/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPvpRoom(roomId: string): Promise<BattleRoom | null> {
  try {
    const res = await fetch(`/api/pvp/room?id=${encodeURIComponent(roomId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.room as BattleRoom) ?? null;
  } catch {
    return null;
  }
}

export async function apiPvpMove(body: {
  roomId: string;
  moveName: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch("/api/pvp/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function apiPvpCancel(roomId: string): void {
  fetch("/api/pvp/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId }),
    keepalive: true,
  }).catch(() => {});
}

export type {
  Anymon,
  BattleOutcome,
  BattleRoom,
  GeoHit,
  Matchup,
  Move,
  NearbyTrainer,
};
