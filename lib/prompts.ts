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

// Capture-time identify + creative name in one Claude call.
export const IDENTIFY_AND_NAME_PROMPT = [
  "Look at this image. Identify the single primary physical object, then invent a fun",
  "Pokemon-style creature name for an 'Anymon' based on it. The name should HINT at the",
  "real object (blend its word with a creature-y suffix), be catchy, 3-14 letters, one word,",
  "no spaces, capitalized like a Pokemon (e.g. a mug -> 'Muglet', a bottle -> 'Aquaflask',",
  "a lamp -> 'Lumosaur', a book -> 'Tomeling').",
  'Respond with ONLY a JSON object, no markdown fences: {"object":"<one lowercase noun>","name":"<CreativeName>"}',
].join(" ");

// ---- Matchup reasoning (the "weakness initialization") ----
export const MATCHUP_SYSTEM_PROMPT = [
  "You are the type-matchup engine for Anymon, an educational monster-battler.",
  "Two creatures based on REAL-WORLD objects are about to battle. Using real physics,",
  "chemistry, biology, or materials science, decide how effective each one is against the",
  "other. Effectiveness is a damage multiplier in {0.5, 1, 1.5, 2}: 2 = super effective,",
  "1.5 = effective, 1 = neutral, 0.5 = resisted. Give a short, true reason for each direction.",
  "Respond with ONLY a JSON object (no markdown fences) EXACTLY:",
  '{"intro":"<<=12 word punchy weakness-initialization line>","field":"<physics|chemistry|biology|materials>","aToB":{"multiplier":<0.5|1|1.5|2>,"reason":"<<=14 word real reason A beats/loses to B>"},"bToA":{"multiplier":<0.5|1|1.5|2>,"reason":"<<=14 word real reason B beats/loses to A>"}}',
].join(" ");

export function matchupUserPrompt(aObject: string, bObject: string): string {
  return `Anymon A is based on a ${aObject}. Anymon B is based on a ${bObject}. How effective is each against the other, and why?`;
}

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

// ---- Move generation (turn-based, Pokemon-style) ----
export const MOVES_SYSTEM_PROMPT = [
  "You design a moveset for a creature in Anymon, an educational monster-battler.",
  "The creature is based on a REAL-WORLD object. Invent exactly 4 battle moves that come",
  "from that object's true physical properties, materials, uses, or science.",
  "Make them fun and punchy like Pokemon moves.",
  "Vary the moves: include strong/risky ones (high power, lower accuracy), reliable ones,",
  "and at least one 'status' move (buff/defense/heal-ish, power can be 0).",
  "The blurb must be SUPER SIMPLE: 3-6 easy words a 7-year-old understands, plain language",
  "saying what the move does. Keep the real-world idea but say it the easy way",
  '(e.g. "splashes water to put out fire", "heavy metal smash", "blocks the next hit").',
  "No jargon, no formulas, no big words.",
  "Respond with ONLY a JSON array (no markdown fences) of 4 objects, each EXACTLY:",
  '{"name":"<<=18 chars>","power":<integer 0-40>,"accuracy":<integer 70-100>,"kind":"physical"|"special"|"status","emoji":"<1 emoji>","blurb":"<3-6 simple words, what it does>"}',
].join(" ");

export function movesUserPrompt(object: string): string {
  return `Create the 4-move moveset for an Anymon based on a ${object}.`;
}
