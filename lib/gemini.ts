import { GoogleGenAI } from "@google/genai";
import { anymonStylePrompt } from "./prompts";

// Default to "Nano Banana" (Gemini 2.5 Flash Image) — the stable, low-latency
// image model that the @google/genai SDK exposes for generateContent. Override
// with GEMINI_IMAGE_MODEL (e.g. "gemini-3-pro-image" / "gemini-3.1-flash-image").
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// Real Google AI Studio (Generative Language API) keys look like "AIza…". Tokens
// that start with "AQ." are OAuth/other tokens the SDK will reject. Warn loudly
// (without leaking the secret) so the placeholder-sprite fallback is explained.
function warnIfSuspiciousKey(apiKey: string): void {
  if (!apiKey.startsWith("AIza")) {
    console.error(
      `[gemini] GEMINI_API_KEY does not look like a Google AI Studio key ` +
        `(expected "AIza…", got "${apiKey.slice(0, 4)}…"). Image generation will ` +
        `likely fail and fall back to the placeholder sprite. Get a valid key at ` +
        `https://aistudio.google.com/apikey`,
    );
  }
}

// Strips a data: URI prefix if present, returning { mimeType, data }.
function splitDataUri(input: string): { mimeType: string; data: string } {
  const m = input.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: "image/jpeg", data: input };
}

/**
 * Image-to-image: feeds the REAL user photo + the Anymon style prompt into
 * Gemini "Nano Banana Pro" and returns the generated sprite as a data URI.
 */
export async function generateAnymonSprite(
  photoBase64OrDataUri: string,
  object: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  warnIfSuspiciousKey(apiKey);

  const ai = new GoogleGenAI({ apiKey });
  const { mimeType, data } = splitDataUri(photoBase64OrDataUri);

  console.log(`[gemini] generating sprite for "${object}" via ${MODEL}…`);
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { inlineData: { mimeType, data } }, // the actual photograph
        { text: anymonStylePrompt(object) }, // transform instructions
      ],
    });
  } catch (e) {
    // Surface the real cause (bad key, retired model, quota) so it's diagnosable.
    console.error(`[gemini] generateContent failed (model=${MODEL}):`, (e as Error).message);
    throw e;
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = (part as { inlineData?: { mimeType?: string; data?: string } })
      .inlineData;
    if (inline?.data) {
      console.log(`[gemini] sprite ready for "${object}" (${inline.mimeType || "image/png"})`);
      return `data:${inline.mimeType || "image/png"};base64,${inline.data}`;
    }
  }
  console.error("[gemini] response contained no inline image data");
  throw new Error("Gemini returned no image");
}
