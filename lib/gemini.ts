import { GoogleGenAI } from "@google/genai";
import { anymonStylePrompt } from "./prompts";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

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

  const ai = new GoogleGenAI({ apiKey });
  const { mimeType, data } = splitDataUri(photoBase64OrDataUri);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { mimeType, data } }, // the actual photograph
      { text: anymonStylePrompt(object) }, // transform instructions
    ],
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = (part as { inlineData?: { mimeType?: string; data?: string } })
      .inlineData;
    if (inline?.data) {
      return `data:${inline.mimeType || "image/png"};base64,${inline.data}`;
    }
  }
  throw new Error("Gemini returned no image");
}
