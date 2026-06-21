import Anthropic from "@anthropic-ai/sdk";
import {
  BATTLE_SYSTEM_PROMPT,
  IDENTIFY_AND_NAME_PROMPT,
  MATCHUP_SYSTEM_PROMPT,
  MOVES_SYSTEM_PROMPT,
  OBJECT_ID_PROMPT,
  battleUserPrompt,
  matchupUserPrompt,
  movesUserPrompt,
} from "./prompts";
import { compressContext } from "./tokencompany";
import { clampRarity, type Matchup, type MatchupDir, type Move, type MoveKind } from "./types";

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

// ---- Creative naming ----

const NAME_SUFFIXES = ["mon", "ling", "zor", "saur", "puff", "ko", "drix", "ix", "let", "o"];

/**
 * Deterministic, offline Pokemon-style name from an object word. Same object
 * always yields the same name (so it reads as a real species), while still
 * clearly hinting at the source object.
 */
export function creativeName(object: string): string {
  const raw = (object || "creature").toLowerCase().replace(/[^a-z]/g, "");
  if (!raw) return "Anymon";
  // Use a stable hash to pick how much of the root to keep + which suffix.
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  const root = raw.length <= 4 ? raw : raw.slice(0, 3 + (h % 3)); // keep 3-5 chars
  const suffix = NAME_SUFFIXES[h % NAME_SUFFIXES.length];
  // Avoid an awkward double letter at the seam (e.g. "lampphone").
  const seam = root.endsWith(suffix[0]) ? suffix.slice(1) : suffix;
  const name = root + seam;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Claude Vision -> { object, creative name, commonness-based rarity } in one call.
 * `rarity` is 1-5 where 1 = ubiquitous everyday object and 5 = genuinely rare.
 * Falls back locally (object="creature", rarity=1) if Claude is unavailable.
 */
export async function identifyAndName(
  photoBase64OrDataUri: string,
): Promise<{ object: string; name: string; rarity: number }> {
  const { mimeType, data } = splitDataUri(photoBase64OrDataUri);
  try {
    const c = client();
    const msg = await c.messages.create({
      model: await pickModel(),
      max_tokens: 60,
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
            { type: "text", text: IDENTIFY_AND_NAME_PROMPT },
          ],
        },
      ],
    });
    const text = msg.content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonStr) as {
      object?: string;
      name?: string;
      rarity?: number;
    };
    const object = (parsed.object || "creature").toLowerCase().replace(/[^a-z ]/g, "").trim() || "creature";
    let name = (parsed.name || "").replace(/[^A-Za-z]/g, "").slice(0, 16);
    if (name.length < 3) name = creativeName(object);
    else name = name.charAt(0).toUpperCase() + name.slice(1);
    // Harsh commonness rarity: clamp to 1-5; default to 1 (common) if missing.
    // No randomization — keep it deterministic so common things stay 1 star.
    const rarity = Number.isFinite(Number(parsed.rarity))
      ? clampRarity(Number(parsed.rarity))
      : 1;
    return { object, name, rarity };
  } catch (e) {
    console.warn("[claude] identifyAndName fell back:", (e as Error).message);
    const object = "creature";
    return { object, name: creativeName(object), rarity: 1 };
  }
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
    { name: "Tackle", power: 18, accuracy: 100, kind: "physical", emoji: "💥", blurb: `solid body delivers blunt impact force` },
    { name: "Slam", power: 30, accuracy: 80, kind: "physical", emoji: "🔨", blurb: `heavy mass increases impact damage` },
    { name: "Quirk Beam", power: 25, accuracy: 90, kind: "special", emoji: "⚡", blurb: `${o} releases concentrated energy at the target` },
    { name: "Brace", power: 0, accuracy: 100, kind: "status", emoji: "🛡️", blurb: `stiffens to absorb the next hit` },
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
        headline: parsed.headline || "close match",
        lesson:
          parsed.lesson ||
          `The ${args.aObject} and ${args.bObject} were decided by their material properties.`,
        field: parsed.field || "physics",
      };
    }
  } catch {
    // fall through to heuristic
  }
  // Heuristic fallback so battles never hard-fail.
  return {
    winner: Math.random() < 0.5 ? "A" : "B",
    headline: "close match",
    lesson: `When a ${args.aObject} meets a ${args.bObject}, their material properties decide the result.`,
    field: "physics",
  };
}

// ---- Matchup reasoning ("weakness initialization") ----

const MATCHUP_MULTS = [0.5, 1, 1.5, 2];
const snapMult = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return MATCHUP_MULTS.reduce((best, m) =>
    Math.abs(m - n) < Math.abs(best - n) ? m : best,
  );
};

// Loose property tags so the offline fallback can reason about materials.
const TAGS: Record<string, string[]> = {
  water: ["water", "bottle", "flask", "cup", "mug", "glass", "drink", "rain", "umbrella", "pool"],
  fire: ["fire", "candle", "lighter", "match", "torch", "stove", "heater"],
  metal: ["metal", "knife", "fork", "spoon", "key", "can", "coin", "wrench", "scissors", "phone", "laptop"],
  electric: ["electric", "phone", "laptop", "lamp", "charger", "battery", "wire", "cable", "bulb"],
  plant: ["plant", "leaf", "flower", "tree", "wood", "book", "paper", "pencil"],
  fragile: ["glass", "bulb", "egg", "mirror", "bottle", "cup"],
  soft: ["pillow", "plush", "cloth", "sock", "shoe", "towel", "sponge"],
};

function tagsOf(object: string): Set<string> {
  const o = (object || "").toLowerCase();
  const set = new Set<string>();
  for (const [tag, words] of Object.entries(TAGS)) {
    if (words.some((w) => o.includes(w))) set.add(tag);
  }
  return set;
}

/** Deterministic, offline matchup so battles always have a reason. */
export function heuristicMatchup(aObject: string, bObject: string): Matchup {
  const A = tagsOf(aObject);
  const B = tagsOf(bObject);
  const dir = (atk: Set<string>, def: Set<string>, a: string, b: string): MatchupDir => {
    if (atk.has("water") && def.has("fire"))
      return { multiplier: 2, reason: `water from the ${a} absorbs heat and puts out the ${b}'s fire.` };
    if (atk.has("water") && def.has("electric"))
      return { multiplier: 1.5, reason: `water from the ${a} conducts current and shorts the ${b}.` };
    if (atk.has("fire") && def.has("plant"))
      return { multiplier: 2, reason: `heat from the ${a} burns the ${b}'s dry fibers.` };
    if (atk.has("fire") && def.has("water"))
      return { multiplier: 0.5, reason: `the ${b}'s water absorbs the ${a}'s heat and resists burning.` };
    if (atk.has("metal") && def.has("fragile"))
      return { multiplier: 2, reason: `the hard metal ${a} cracks the brittle ${b}.` };
    if (atk.has("soft") && def.has("metal"))
      return { multiplier: 0.5, reason: `the soft ${a} cannot dent the rigid ${b}.` };
    if (atk.has("electric") && def.has("water"))
      return { multiplier: 1.5, reason: `current from the ${a} passes through the wet ${b}.` };
    return { multiplier: 1, reason: `the ${a} and ${b} are similar materials and trade even impacts.` };
  };
  const aToB = dir(A, B, aObject, bObject);
  const bToA = dir(B, A, bObject, aObject);
  const lead =
    aToB.multiplier > bToA.multiplier
      ? `${aObject} has the advantage`
      : bToA.multiplier > aToB.multiplier
        ? `${bObject} has the advantage`
        : "an even matchup";
  return { intro: `${lead}.`, field: "materials", aToB, bToA };
}

/** One cached call at battle start: effectiveness multipliers + reasons. */
export async function judgeMatchup(
  aObject: string,
  bObject: string,
): Promise<Matchup> {
  try {
    const c = client();
    const msg = await c.messages.create({
      model: await pickModel(),
      max_tokens: 300,
      system: MATCHUP_SYSTEM_PROMPT,
      messages: [{ role: "user", content: matchupUserPrompt(aObject, bObject) }],
    });
    const text = msg.content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const p = JSON.parse(jsonStr) as Partial<Matchup>;
    const fb = heuristicMatchup(aObject, bObject);
    const dir = (d: Partial<MatchupDir> | undefined, f: MatchupDir): MatchupDir => ({
      multiplier: snapMult(d?.multiplier),
      reason: String(d?.reason || f.reason).slice(0, 120),
    });
    return {
      intro: String(p.intro || fb.intro).slice(0, 90),
      field: String(p.field || fb.field).slice(0, 20),
      aToB: dir(p.aToB, fb.aToB),
      bToA: dir(p.bToA, fb.bToA),
    };
  } catch (e) {
    console.warn("[claude] judgeMatchup fell back to heuristic:", (e as Error).message);
    return heuristicMatchup(aObject, bObject);
  }
}
