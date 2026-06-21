import Anthropic from "@anthropic-ai/sdk";
import {
  BATTLE_SYSTEM_PROMPT,
  MOVES_SYSTEM_PROMPT,
  OBJECT_ID_PROMPT,
  battleUserPrompt,
  movesUserPrompt,
} from "./prompts";
import { compressContext } from "./tokencompany";
import type { Move, MoveKind } from "./types";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
}

// Model aliases like "claude-3-5-sonnet-latest" can 404 once retired, which
// silently breaks captures + battles. Resolve a real, available model id from
// the account once and cache it. Prefer an explicit CLAUDE_MODEL, then the best
// Sonnet, then Haiku, then whatever exists.
let cachedModel: string | null = null;

// The installed SDK has no Models resource, so hit the REST endpoint directly.
async function listModelIds(): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`models ${res.status}`);
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id);
}

async function pickModel(): Promise<string> {
  if (cachedModel) return cachedModel;
  const env = process.env.CLAUDE_MODEL?.trim();
  try {
    const ids = await listModelIds();
    if (ids.length) {
      cachedModel =
        (env && ids.includes(env) && env) ||
        ids.find((i) => /sonnet/i.test(i)) ||
        ids.find((i) => /haiku/i.test(i)) ||
        ids[0];
      console.log("[claude] using model:", cachedModel, "(of", ids.length, "available)");
      return cachedModel!;
    }
  } catch (e) {
    console.warn("[claude] model discovery failed:", (e as Error).message);
  }
  cachedModel = env || "claude-3-5-sonnet-20241022";
  console.log("[claude] using fallback model:", cachedModel);
  return cachedModel;
}

function splitDataUri(input: string): { mimeType: string; data: string } {
  const m = input.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: "image/jpeg", data: input };
}

/** Claude Vision -> single lowercase noun for the scanned object. */
export async function identifyObject(
  photoBase64OrDataUri: string,
): Promise<string> {
  const { mimeType, data } = splitDataUri(photoBase64OrDataUri);
  const c = client();
  const msg = await c.messages.create({
    model: await pickModel(),
    max_tokens: 16,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data,
            },
          },
          { type: "text", text: OBJECT_ID_PROMPT },
        ],
      },
    ],
  });
  const text = msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim()
    .toLowerCase();
  return text.replace(/[^a-z]/g, "") || "creature";
}

export interface RawBattle {
  winner: "A" | "B";
  headline: string;
  lesson: string;
  field: string;
}

/** Educational battle engine. Returns which of A/B wins + a real-world lesson. */
export async function judgeBattle(args: {
  aObject: string;
  bObject: string;
  locationHint?: string;
}): Promise<RawBattle> {
  try {
    const userPrompt = await compressContext(battleUserPrompt(args));
    const c = client();
    const msg = await c.messages.create({
      model: await pickModel(),
      max_tokens: 400,
      system: BATTLE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    return parseBattle(text, args);
  } catch (e) {
    // Never hard-fail a battle on an API hiccup — use the heuristic result.
    console.warn("[claude] judgeBattle fell back to heuristic:", (e as Error).message);
    return parseBattle("", args);
  }
}

// ---- Move generation (turn-based battles) ----

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

function sanitizeMoves(raw: unknown, object: string): Move[] {
  const arr = Array.isArray(raw) ? raw : [];
  const kinds: MoveKind[] = ["physical", "special", "status"];
  const moves: Move[] = arr.slice(0, 4).map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    const kind = kinds.includes(o.kind as MoveKind)
      ? (o.kind as MoveKind)
      : "physical";
    return {
      name: String(o.name ?? "Tackle").slice(0, 18),
      power: clampInt(o.power, 0, 40, kind === "status" ? 0 : 20),
      accuracy: clampInt(o.accuracy, 70, 100, 95),
      kind,
      emoji: String(o.emoji ?? "✨").slice(0, 4),
      blurb: String(o.blurb ?? "").slice(0, 120),
    };
  });
  while (moves.length < 4) moves.push(fallbackMoves(object)[moves.length]);
  return moves;
}

/** Deterministic, no-API moveset so battles always work. */
export function fallbackMoves(object: string): Move[] {
  const o = object || "anymon";
  return [
    { name: "Tackle", power: 18, accuracy: 100, kind: "physical", emoji: "💥", blurb: `The ${o} throws its full mass into a hit (momentum = mass × velocity).` },
    { name: "Slam", power: 30, accuracy: 80, kind: "physical", emoji: "🔨", blurb: `A heavy, risky strike — more force, harder to aim.` },
    { name: "Quirk Beam", power: 25, accuracy: 90, kind: "special", emoji: "🌈", blurb: `Channels the ${o}'s signature property into energy.` },
    { name: "Brace", power: 0, accuracy: 100, kind: "status", emoji: "🛡️", blurb: `Stiffens up to absorb the next blow (rigidity resists deformation).` },
  ];
}

export async function generateMoves(object: string): Promise<Move[]> {
  try {
    const c = client();
    const msg = await c.messages.create({
      model: await pickModel(),
      max_tokens: 500,
      system: MOVES_SYSTEM_PROMPT,
      messages: [{ role: "user", content: movesUserPrompt(object) }],
    });
    const text = msg.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    const jsonStr = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    return sanitizeMoves(JSON.parse(jsonStr), object);
  } catch (e) {
    console.warn("[claude] generateMoves fell back:", (e as Error).message);
    return fallbackMoves(object);
  }
}

function parseBattle(
  text: string,
  args: { aObject: string; bObject: string },
): RawBattle {
  try {
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonStr) as Partial<RawBattle>;
    if (parsed.winner === "A" || parsed.winner === "B") {
      return {
        winner: parsed.winner,
        headline: parsed.headline || "a worthy clash!",
        lesson:
          parsed.lesson ||
          `The ${args.aObject} and ${args.bObject} tested their real-world properties.`,
        field: parsed.field || "physics",
      };
    }
  } catch {
    // fall through to heuristic
  }
  // Heuristic fallback so battles never hard-fail.
  return {
    winner: Math.random() < 0.5 ? "A" : "B",
    headline: "a close call!",
    lesson: `When a ${args.aObject} meets a ${args.bObject}, their material properties decide the day.`,
    field: "physics",
  };
}
