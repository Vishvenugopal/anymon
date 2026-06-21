"use client";

import type { Anymon, BattleOutcome, GeoHit } from "./types";

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
  const res = await fetch("/api/me", { cache: "no-store" });
  if (res.status === 401) return { authenticated: false };
  return res.json();
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

export async function apiBattle(body: {
  attackerId: string;
  defenderId: string;
  pos: Position;
}): Promise<BattleOutcome> {
  const res = await fetch("/api/battle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "battle failed");
  return res.json();
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

export type { Anymon, BattleOutcome, GeoHit };
