// The Anymon "style bible". Gemini receives the REAL user photo as image input
// plus this text, and performs an image-to-image transform so the resulting
// creature genuinely resembles the scanned object while staying on-brand and
// clean enough for Meshy's 3D reconstruction.
export function anymonStylePrompt(object: string): string {
  const obj = object?.trim() || "object";
  return [
    `Transform the real object in the provided photo into a single cute collectible creature monster (an "Anymon").`,
    `Keep its recognizable shape, proportions, colors, and key features so it clearly reads as a ${obj}.`,
    `Give it big expressive eyes and a small personality that fits the object (friendly, sleepy, mysterious, fierce, or proud).`,
    `Pose: centered, full body fully visible, standing hero pose, slight 3/4 front view.`,
    `Art style: glossy vinyl gummy toy, smooth rounded chunky shapes, soft bevels, bold clean outlines.`,
    `Accent palette: a white base with lime green (#32CD32) and deep sky blue (#00BFFF) highlights.`,
    `Background: plain solid flat pure-white, no scene, soft even studio lighting, gentle ambient occlusion, clear readable silhouette.`,
    `Strict constraints: exactly one subject, no text, no logo, no watermark, no extra props, no cropping, no drop shadow touching the edges.`,
    `Output a clean product-render quality image suitable for photogrammetry / 3D reconstruction.`,
  ].join(" ");
}

export const OBJECT_ID_PROMPT =
  "Identify the single primary physical object in this image. Reply with ONLY one lowercase noun, no punctuation, no extra words. If unclear, give your best single-word guess.";

export const BATTLE_SYSTEM_PROMPT = [
  "You are the Game Master for Anymon, an educational AR monster-battler for curious kids and teens.",
  "Two Anymons, each based on a real-world object, are battling. Decide the winner using REAL-WORLD logic:",
  "physics, chemistry, biology, materials science, or history. Account for any location buff provided.",
  "Be scientifically accurate but playful. The lesson must teach something true and memorable.",
  "Respond with ONLY a JSON object, no markdown fences, matching exactly:",
  '{"winner":"A"|"B","headline":"<<=8 word punchy line>","lesson":"<1-2 sentence real-world explanation a 12-year-old understands>","field":"<one of: physics, chemistry, biology, materials, history, geography>"}',
].join(" ");

export function battleUserPrompt(args: {
  aObject: string;
  bObject: string;
  locationHint?: string;
}): string {
  const loc = args.locationHint ? ` Location context: ${args.locationHint}.` : "";
  return `Anymon A is based on a ${args.aObject}. Anymon B is based on a ${args.bObject}.${loc} Who wins and why?`;
}
