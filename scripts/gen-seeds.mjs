// One-off: generate matching seed Anymon (sprite + 3D model) so the wild
// placeholders feel real (name ↔ object ↔ model all agree). Saves assets to
// public/seeds/. Run: node scripts/gen-seeds.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "seeds");
mkdirSync(OUT, { recursive: true });

// Parse keys out of .env.local (avoids putting secrets on the command line).
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const getKey = (name) => {
  const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
};
const GEMINI = getKey("GEMINI_API_KEY");
const MESHY = getKey("MESHY_API_KEY");
const GEMINI_MODEL = getKey("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
if (!GEMINI || !MESHY) throw new Error("missing GEMINI_API_KEY or MESHY_API_KEY");

// key ↔ name ↔ object all match by construction (model is built FROM the object).
const SEEDS = [
  { key: "book", object: "book", name: "Tomeling" },
  { key: "mug", object: "mug", name: "Muglet" },
  { key: "umbrella", object: "umbrella", name: "Brellox" },
  { key: "lamp", object: "lamp", name: "Lumosaur" },
  { key: "telescope", object: "telescope", name: "Scopestar" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function prompt(object) {
  return [
    `A single cute collectible creature monster (an "Anymon") inspired by a ${object}.`,
    `It clearly reads as a ${object}: keep the object's recognizable shape, proportions, colors and key features, but give it big expressive eyes and a little personality.`,
    `Art style: glossy vinyl gummy toy, smooth rounded chunky shapes, soft bevels, bold clean outlines.`,
    `Accent palette: white base with lime green (#32CD32) and deep sky blue (#00BFFF) highlights.`,
    `Pose: centered, full body fully visible, standing hero pose, slight 3/4 front view.`,
    `Background: plain solid flat PURE WHITE (#FFFFFF), no scene, soft even studio lighting, clear readable silhouette.`,
    `Exactly one subject, no text, no logo, no watermark, no extra props, no cropping. Product-render quality suitable for 3D reconstruction.`,
  ].join(" ");
}

async function genSprite(object) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(object) }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return { b64: p.inlineData.data, mime: p.inlineData.mimeType || "image/png" };
    }
  }
  throw new Error("gemini returned no image");
}

async function meshyCreate(dataUri) {
  const res = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
    method: "POST",
    headers: { Authorization: `Bearer ${MESHY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: dataUri,
      should_texture: true,
      enable_pbr: false,
      target_formats: ["glb"],
    }),
  });
  if (!res.ok) throw new Error(`meshy create ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

async function meshyPoll(taskId) {
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${MESHY}` },
    });
    if (res.ok) {
      const d = await res.json();
      if (d.status === "SUCCEEDED" && d.model_urls?.glb) return d.model_urls.glb;
      if (d.status === "FAILED" || d.status === "CANCELED")
        throw new Error(`meshy ${d.status}`);
    }
    await sleep(5000);
  }
  throw new Error("meshy timed out");
}

async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

async function one(s) {
  const glbPath = join(OUT, `${s.key}.glb`);
  if (existsSync(glbPath)) {
    console.log(`[${s.key}] already exists, skipping`);
    return;
  }
  console.log(`[${s.key}] generating sprite…`);
  const { b64, mime } = await genSprite(s.object);
  writeFileSync(join(OUT, `${s.key}.png`), Buffer.from(b64, "base64"));
  console.log(`[${s.key}] sprite saved; submitting to Meshy…`);
  const taskId = await meshyCreate(`data:${mime};base64,${b64}`);
  console.log(`[${s.key}] meshy task ${taskId}; polling…`);
  const glbUrl = await meshyPoll(taskId);
  await download(glbUrl, glbPath);
  console.log(`[${s.key}] ✓ glb saved`);
}

const results = await Promise.allSettled(SEEDS.map(one));
results.forEach((r, i) => {
  if (r.status === "rejected") console.error(`[${SEEDS[i].key}] FAILED:`, r.reason.message);
});
console.log("done");
