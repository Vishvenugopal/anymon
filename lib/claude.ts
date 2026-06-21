import Anthropic from "@anthropic-ai/sdk";
import {
  BATTLE_SYSTEM_PROMPT,
  OBJECT_ID_PROMPT,
  battleUserPrompt,
} from "./prompts";
import { compressContext } from "./tokencompany";

const MODEL = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
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
  const msg = await client().messages.create({
    model: MODEL,
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
  const userPrompt = await compressContext(battleUserPrompt(args));
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: BATTLE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  return parseBattle(text, args);
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
