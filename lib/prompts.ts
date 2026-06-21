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

// Capture-time identify + creative name + commonness-based rarity in one call.
export const IDENTIFY_AND_NAME_PROMPT = [
  "Look at this image. Identify the single primary physical object, then:",
  "(1) invent a fun Pokemon-style creature name for an 'Anymon' based on it. The name should",
  "HINT at the real object (blend its word with a creature-y suffix), be catchy, 3-14 letters,",
  "one word, no spaces, capitalized like a Pokemon (e.g. a mug -> 'Muglet', a bottle ->",
  "'Aquaflask', a lamp -> 'Lumosaur', a book -> 'Tomeling').",
  "(2) rate how COMMON the object is in everyday life on an integer 1-5 scale, where rarity",
  "reflects how rarely an ordinary person encounters the object:",
  "1 = ubiquitous everyday object almost everyone owns/sees daily (phone, cup, mug, pen,",
  "pencil, chair, shoe, book, spoon, fork, key, bottle, laptop, plate, sock);",
  "2 = common household/workplace object seen often;",
  "3 = uncommon object not seen every day;",
  "4 = rare object most people seldom encounter;",
  "5 = genuinely rare, unusual, exotic, antique, collectible, or special object.",
  "Be HARSH and conservative: ordinary everyday objects MUST be 1. Do NOT inflate. Only give",
  "4 or 5 to things the average person rarely or almost never sees in daily life.",
  'Respond with ONLY a JSON object, no markdown fences: {"object":"<one lowercase noun>","name":"<CreativeName>","rarity":<1-5 integer>}',
].join(" ");

// ---- Matchup reasoning (the "weakness initialization") ----
export const MATCHUP_SYSTEM_PROMPT = [
  "You are the type-matchup engine for Anymon, an educational monster-battler.",
  "Two creatures based on REAL-WORLD objects are about to battle. Use real physics,",
  "chemistry, biology, or materials science to decide how effective each one is against",
  "the other. Effectiveness is a damage multiplier in {0.5, 1, 1.5, 2}: 2 = very effective,",
  "1.5 = effective, 1 = neutral, 0.5 = resisted.",
  "Each reason must be PLAIN and SCIENTIFICALLY ACCURATE: one short factual cause-and-effect",
  "clause. No flowery adjectives, no metaphors, no hype — just what happens and why.",
  "Respond with ONLY a JSON object (no markdown fences) EXACTLY:",
  '{"intro":"<<=10 word plain summary of the matchup>","field":"<physics|chemistry|biology|materials>","aToB":{"multiplier":<0.5|1|1.5|2>,"reason":"<<=14 word plain factual reason A vs B>"},"bToA":{"multiplier":<0.5|1|1.5|2>,"reason":"<<=14 word plain factual reason B vs A>"}}',
].join(" ");

export function matchupUserPrompt(aObject: string, bObject: string): string {
  return `Anymon A is based on a ${aObject}. Anymon B is based on a ${bObject}. How effective is each against the other, and why?`;
}

export const BATTLE_SYSTEM_PROMPT = [
  "You are the battle engine for Anymon, an educational monster-battler.",
  "Two Anymons, each based on a real-world object, are battling. Decide the winner using",
  "REAL-WORLD science: physics, chemistry, biology, materials science, or geography.",
  "Account for any location buff provided.",
  "Be accurate and plain. The lesson states the real cause and effect in one or two short,",
  "factual sentences a 12-year-old understands. No flowery language, no metaphors, no hype.",
  "Respond with ONLY a JSON object, no markdown fences, matching exactly:",
  '{"winner":"A"|"B","headline":"<<=8 word plain line>","lesson":"<1-2 short factual sentences>","field":"<one of: physics, chemistry, biology, materials, history, geography>"}',
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
  "You design a 4-move moveset for a creature in Anymon, an educational monster-battler.",
  "The creature is based on a REAL-WORLD object. Each move must come from that object's real",
  "physical or chemical properties, materials, or common use.",
  "Keep names short and clear. Vary the set: one reliable attack, one high-power lower-accuracy",
  "attack, and at least one 'status' move (defense/heal, power may be 0).",
  "The blurb must be PLAIN and SCIENTIFICALLY ACCURATE: one short factual phrase stating the",
  "real cause and effect (what happens and why). No flowery adjectives, no metaphors, no hype.",
  'Good blurbs: "water absorbs heat and cools the target", "dense metal transfers high impact force",',
  '"smooth surface deflects the blow", "stiffens to absorb the next hit".',
  "Respond with ONLY a JSON array (no markdown fences) of 4 objects, each EXACTLY:",
  '{"name":"<<=18 chars>","power":<integer 0-40>,"accuracy":<integer 70-100>,"kind":"physical"|"special"|"status","emoji":"<1 emoji>","blurb":"<short plain factual cause and effect>"}',
].join(" ");

export function movesUserPrompt(object: string): string {
  return `Create the 4-move moveset for an Anymon based on a ${object}.`;
}
