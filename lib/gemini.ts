import { GoogleGenAI } from "@google/genai";
import { anymonStylePrompt } from "./prompts";

// Default to "Nano Banana" (Gemini 2.5 Flash Image) — the current STABLE/GA image
// model the @google/genai SDK exposes for generateContent (model code
// "gemini-2.5-flash-image", GA since Oct 2025). Override with GEMINI_IMAGE_MODEL
// (e.g. "gemini-3-pro-image-preview" / "gemini-3.1-flash-image-preview").
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// Free-tier 429 backoff knobs. The image model's free tier has a *very* low
// request-per-minute limit, so a few short backoffs are enough to ride out a
// transient spike — but we must NOT loop forever (the capture POST is awaited).
const MAX_ATTEMPTS = 4; // 1 initial try + 3 retries
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 8000;

// Google AI Studio keys come in two valid shapes: the classic "AIza…" keys and
// the newer "AQ.…" project keys (both authenticate fine). Anything else is
// probably an OAuth/other token the SDK will reject. NOTE: a valid key can still
// fail with HTTP 429 `RESOURCE_EXHAUSTED` — the image model (Nano Banana) has a
// free-tier quota of ZERO, so image generation requires billing enabled on the
// key's Google Cloud project. That is NOT a bad key; see the 429 handling below.
function warnIfSuspiciousKey(apiKey: string): void {
  if (!apiKey.startsWith("AIza") && !apiKey.startsWith("AQ.")) {
    console.error(
      `[gemini] GEMINI_API_KEY does not look like a Google AI Studio key ` +
        `(expected "AIza…" or "AQ.…", got "${apiKey.slice(0, 4)}…"). Image ` +
        `generation will likely fail and fall back to the placeholder sprite. Get ` +
        `a valid key at https://aistudio.google.com/apikey`,
    );
  }
}

// Strips a data: URI prefix if present, returning { mimeType, data }.
function splitDataUri(input: string): { mimeType: string; data: string } {
  const m = input.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: "image/jpeg", data: input };
}

// Best-effort extraction of an HTTP-ish status code from a @google/genai error.
function errorStatus(e: unknown): number | null {
  const anyE = e as {
    status?: number;
    code?: number;
    response?: { status?: number };
  };
  if (typeof anyE?.status === "number") return anyE.status;
  if (typeof anyE?.code === "number") return anyE.code;
  if (typeof anyE?.response?.status === "number") return anyE.response.status;
  const msg = String((e as Error)?.message ?? "");
  const m = msg.match(/\b(429|500|503)\b/);
  return m ? Number(m[1]) : null;
}

// 429 (rate limit / quota) and 503/500 (overloaded) are worth a short retry.
function isRetryable(e: unknown): boolean {
  const status = errorStatus(e);
  if (status === 429 || status === 503 || status === 500) return true;
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|rate limit/i.test(
    String((e as Error)?.message ?? ""),
  );
}

function isQuota(e: unknown): boolean {
  return (
    errorStatus(e) === 429 ||
    /RESOURCE_EXHAUSTED|quota|rate limit/i.test(String((e as Error)?.message ?? ""))
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Image-to-image: feeds the REAL user photo + the Anymon style prompt into
 * Gemini "Nano Banana" and returns the generated sprite as a data URI.
 *
 * Resilience: retries 429/503 with exponential backoff + jitter (a few times).
 * If still rate-limited, throws with a clear, actionable message so the caller
 * (pipeline) falls back to the 2D placeholder sprite and the capture RESOLVES
 * instead of hanging. Called exactly once per capture.
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

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `[gemini] generating sprite for "${object}" via ${MODEL} (attempt ${attempt}/${MAX_ATTEMPTS})…`,
    );
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          { inlineData: { mimeType, data } }, // the actual photograph
          { text: anymonStylePrompt(object) }, // transform instructions
        ],
        // Nano Banana REQUIRES an explicit image response modality to emit an image.
        config: { responseModalities: ["IMAGE"] },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const inline = (part as { inlineData?: { mimeType?: string; data?: string } })
          .inlineData;
        if (inline?.data) {
          console.log(
            `[gemini] sprite ready for "${object}" (${inline.mimeType || "image/png"})`,
          );
          return `data:${inline.mimeType || "image/png"};base64,${inline.data}`;
        }
      }
      // A 200 with no image is not retryable — surface it.
      throw new Error("Gemini returned no inline image data");
    } catch (e) {
      lastErr = e;
      const status = errorStatus(e);
      if (isRetryable(e) && attempt < MAX_ATTEMPTS) {
        const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 400);
        const wait = backoff + jitter;
        console.warn(
          `[gemini] attempt ${attempt} failed (status ${status ?? "?"}): ` +
            `${(e as Error).message}. retrying in ${wait}ms…`,
        );
        await sleep(wait);
        continue;
      }
      // Out of retries (or non-retryable). Surface the real cause clearly.
      console.error(
        `[gemini] generateContent failed (model=${MODEL}, status=${status ?? "?"}): ` +
          `${(e as Error).message}`,
      );
      break;
    }
  }

  // Specifically flag exhausted free-tier image quota as a USER ACTION ITEM.
  if (isQuota(lastErr)) {
    console.error(
      `[gemini] ACTION REQUIRED — image generation is HTTP 429 ` +
        `(RESOURCE_EXHAUSTED) after ${MAX_ATTEMPTS} attempts. The image model ` +
        `"${MODEL}" has a FREE-TIER quota of ZERO, so it requires BILLING enabled ` +
        `on the API key's Google Cloud project. A consumer "Gemini Pro"/"Google AI ` +
        `Pro" subscription does NOT count — it's a separate product. Fix: go to ` +
        `https://aistudio.google.com/apikey, open the key's project, and enable ` +
        `billing (pay-as-you-go, ~$0.04/image). The same key then works with no code ` +
        `change. Capture continues via the original-photo 3D fallback / 2D sprite.`,
    );
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini image generation failed");
}
