export interface User {
  id: string;
  email: string | null;
  username: string;
  image: string | null;
  createdAt: number;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export type AnymonState = "deck" | "wild";
export type IncubationStatus = "incubating" | "ready" | "failed";

export const MAX_DECK = 5;
export const MAX_WILD = 5;
export const NEARBY_RADIUS_M = 100;
export const AUTO_BATTLE_CHANCE = 0.5;

// Max HP every Anymon starts a battle with.
export const BASE_HP = 100;

export type MoveKind = "physical" | "special" | "status";

// A single battle move, uniquely generated from the Anymon's real-world object.
export interface Move {
  name: string;
  power: number; // 0-40 base damage (0 = status move)
  accuracy: number; // 70-100 (% chance to land)
  kind: MoveKind;
  emoji: string;
  blurb: string; // short real-world science tie-in (educational)
}

export interface Anymon {
  id: string;
  object: string; // one-word label from Claude Vision (e.g. "bottle")
  name: string; // display name (e.g. "bottle-mon")
  ownerId: string;
  ownerName: string;
  spriteDataUri: string; // 2D art (data: URI) shown instantly
  glbUrl: string | null; // 3D model from Meshy (null while incubating)
  meshyTaskId: string | null;
  status: IncubationStatus;
  city: string;
  country: string;
  state: AnymonState;
  coins: number;
  lat: number | null;
  lng: number | null;
  createdAt: number;
  deployedAt: number | null; // when released into the wild (for passive farming)
  moves?: Move[]; // generated lazily from `object` on first battle, then cached
}

// Coins a deployed wild Anymon earns per minute.
export const COINS_PER_MIN = 2;

export interface GeoHit {
  id: string;
  distM: number;
  lat: number;
  lng: number;
}

export interface BattleOutcome {
  winnerId: string;
  loserId: string;
  winnerObject: string;
  loserObject: string;
  headline: string; // short punchy line
  lesson: string; // the educational explanation
  field: string; // physics | chemistry | biology | history | ...
  coinsAwarded: number;
  captured: boolean; // did ownership transfer?
}
