import { creativeName, identifyAndName } from "./claude";
import { generateAnymonSprite } from "./gemini";
import { create3D, get3D, is3DMock, provider } from "./threed";
import { isRasterImage } from "./meshy";
import { placeholderSprite, sampleGlb } from "./placeholder";
import { clampRarity, rarityMaxHp, type Anymon } from "./types";

// The IMAGE half (object label + 2D sprite) is mocked when its keys are absent
// or MOCK_PIPELINE=1. The 3D half is handled separately by the threed provider.
export function isImageMock(): boolean {
  if (process.env.MOCK_PIPELINE === "1") return true;
  return !(process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY);
}

export interface CaptureInput {
  imageBase64: string;
  ownerId: string;
  ownerName: string;
  lat: number | null;
  lng: number | null;
  city: string;
  country: string;
}

/**
 * Runs the quick part of the pipeline: object label + 2D sprite + 3D kickoff.
 * Returns an incubating Anymon; the 3D .glb is polled separately.
 */
export async function runCapture(input: CaptureInput): Promise<Anymon> {
  const id = crypto.randomUUID();

  // 1) object label + creative name + commonness-based rarity + 2) 2D sprite.
  // Rarity now reflects how COMMON the object is (harsh): everyday objects = 1,
  // only genuinely rare/unusual things = 5. Default to 1 if Claude is unavailable.
  let object = "mystery";
  let name = creativeName(object);
  let rarity = 1; // harsh fallback: assume common unless Claude says otherwise
  let sprite: string;
  if (isImageMock()) {
    sprite = placeholderSprite(object);
  } else {
    try {
      const idn = await identifyAndName(input.imageBase64);
      object = idn.object;
      name = idn.name;
      rarity = idn.rarity;
    } catch (e) {
      console.error("identifyAndName failed", e);
      object = "creature";
      name = creativeName(object);
      rarity = 1;
    }
    try {
      sprite = await generateAnymonSprite(input.imageBase64, object);
    } catch (e) {
      console.error("generateAnymonSprite failed", e);
      sprite = placeholderSprite(object);
    }
  }

  // Derive HP from the (commonness-based) rarity. Keeps rarity->stat scaling as-is.
  const safeRarity = clampRarity(rarity);
  const maxHp = rarityMaxHp(safeRarity);
  const base: Omit<Anymon, "object" | "name" | "spriteDataUri" | "meshyTaskId"> = {
    id,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    glbUrl: null,
    status: "incubating",
    city: input.city,
    country: input.country,
    state: "deck",
    coins: 0,
    lat: input.lat,
    lng: input.lng,
    createdAt: Date.now(),
    deployedAt: null,
    rarity: safeRarity,
    maxHp,
    hp: maxHp,
    pendingWins: 0,
    pendingCoins: 0,
    capturedBy: null,
  };

  // 3) kick off 3D. Sentinels for meshyTaskId:
  //   "mock"   -> intentional no-keys demo path (resolveGlb serves a sample GLB)
  //   "hfspace"-> a background job will fill glbUrl (handled by the capture route)
  //   "failed" -> a REAL provider was configured but we can't make a model; we do
  //               NOT swap in a random sample GLB — the Anymon resolves to "failed"
  //   <id>     -> a real provider task id to poll
  const spriteIsRaster = isRasterImage(sprite);
  const photoIsRaster = isRasterImage(input.imageBase64);
  let meshyTaskId = "mock";
  if (is3DMock()) {
    meshyTaskId = "mock"; // demo path: sample GLB is expected, not a bug
  } else if (provider() === "hfspace") {
    // The HF Space path generates from the sprite (see startHfGeneration in the
    // capture route), so it needs a real raster sprite + token. No photo fallback
    // here — if Gemini failed there's nothing stylized to send.
    if (spriteIsRaster && process.env.HF_TOKEN) {
      meshyTaskId = "hfspace";
    } else {
      console.error(
        "[pipeline] hfspace path unavailable (needs raster sprite + HF_TOKEN) — marking failed",
      );
      meshyTaskId = "failed";
    }
  } else {
    // meshy / trellis. Prefer the STYLIZED Gemini sprite. If Gemini failed (the
    // sprite fell back to the SVG placeholder — e.g. quota/billing 429), send the
    // ORIGINAL captured photo instead: a real un-stylized 3D model beats no model,
    // and Meshy reconstructs straight from any raster photo. We still NEVER swap in
    // a random sample GLB (that was the old placeholder bug).
    const threeDImage = spriteIsRaster
      ? sprite
      : photoIsRaster
        ? input.imageBase64
        : null;
    if (!threeDImage) {
      console.error(
        `[pipeline] ${id}: no raster image to send to ${provider()} (both the ` +
          `sprite and the original photo are non-raster) — marking 3D failed.`,
      );
      meshyTaskId = "failed";
    } else {
      if (!spriteIsRaster) {
        console.warn(
          `[pipeline] ${id}: Gemini sprite unavailable (likely quota/billing 429) — ` +
            `falling back to the ORIGINAL photo for ${provider()} (un-stylized 3D model).`,
        );
      }
      try {
        meshyTaskId = await create3D(threeDImage);
        console.log(`[pipeline] ${id}: ${provider()} task started -> ${meshyTaskId}`);
      } catch (e) {
        console.error(
          `[pipeline] ${id}: create3D (${provider()}) failed -> marking 3D failed:`,
          (e as Error).message,
        );
        meshyTaskId = "failed";
      }
    }
  }

  return {
    ...base,
    object,
    name,
    spriteDataUri: sprite,
    meshyTaskId,
  };
}

const MOCK_INCUBATE_MS = 6000;

// Hard cap on real 3D generation: a FAILURE ceiling, not the expected time. A
// successful task resolves the instant the provider finishes, so this never
// slows a good capture — it only bounds how long we wait before declaring a
// genuinely-stuck job failed (the 2D sprite still shows). It's measured from the
// Anymon's createdAt, which precedes the provider call (Claude + Gemini run
// first), so it must exceed the provider's own job time + queue. Meshy textured
// image-to-3D ran ~3 min (the old 3-min cap tripped ~0.3s too early); without
// PBR it's a bit faster, so 6 min is comfortable headroom.
const MAX_INCUBATE_MS = 6 * 60_000;

/** Resolves the 3D model status for an Anymon (mock = timed, real = provider). */
export async function resolveGlb(
  a: Anymon,
): Promise<{
  status: Anymon["status"];
  glbUrl: string | null;
  thumbUrl?: string | null;
  progress: number;
}> {
  if (a.status === "ready" && a.glbUrl) {
    return { status: "ready", glbUrl: a.glbUrl, thumbUrl: a.thumbUrl ?? null, progress: 100 };
  }

  // A real provider genuinely could not produce a model. Surface it as failed
  // rather than silently serving a random sample GLB (the placeholder bug). The
  // 2D sprite still renders via spriteFallback; the UI can offer a retry.
  if (a.meshyTaskId === "failed" || a.status === "failed") {
    return { status: "failed", glbUrl: null, progress: 100 };
  }

  // Watchdog: a real task (provider id or hfspace background job) that runs past
  // MAX_INCUBATE_MS is treated as failed so status polling always terminates.
  // The mock/demo path (no real provider) is exempt — it resolves on its own.
  const incubatingTooLong = Date.now() - a.createdAt > MAX_INCUBATE_MS;
  const isRealTask =
    !is3DMock() && !!a.meshyTaskId && a.meshyTaskId !== "mock";
  if (isRealTask && incubatingTooLong) {
    console.error(
      `[pipeline] ${a.id}: 3D generation exceeded ${MAX_INCUBATE_MS}ms ` +
        `(task=${a.meshyTaskId}) — marking failed so the UI stops incubating.`,
    );
    return { status: "failed", glbUrl: null, progress: 100 };
  }

  // HF Space: a background job updates the Anymon directly (failure flips status
  // to "failed", handled above). Here we just report incubation progress.
  if (a.meshyTaskId === "hfspace") {
    const elapsed = Date.now() - a.createdAt;
    return {
      status: "incubating",
      glbUrl: null,
      progress: Math.min(95, 15 + Math.round(elapsed / 2000)),
    };
  }

  // Intentional demo path only (no provider / MOCK_PIPELINE): a sample GLB is OK.
  if (!a.meshyTaskId || a.meshyTaskId === "mock" || is3DMock()) {
    const elapsed = Date.now() - a.createdAt;
    if (elapsed >= MOCK_INCUBATE_MS) {
      return { status: "ready", glbUrl: sampleGlb(hash(a.id)), progress: 100 };
    }
    return {
      status: "incubating",
      glbUrl: null,
      progress: Math.min(95, Math.round((elapsed / MOCK_INCUBATE_MS) * 100)),
    };
  }

  try {
    const task = await get3D(a.meshyTaskId);
    if (task.status === "SUCCEEDED" && task.glbUrl) {
      return {
        status: "ready",
        glbUrl: task.glbUrl,
        thumbUrl: task.thumbUrl ?? null,
        progress: 100,
      };
    }
    if (task.status === "FAILED" || task.status === "CANCELED") {
      // A real provider genuinely failed. Surface it as failed rather than
      // silently swapping in a random sample GLB (the placeholder bug). The UI
      // can prompt a re-capture / retry instead of showing a Duck/Avocado.
      console.error(`resolveGlb: ${provider()} task ${a.meshyTaskId} ${task.status}`);
      return { status: "failed", glbUrl: null, progress: 100 };
    }
    return { status: "incubating", glbUrl: null, progress: task.progress };
  } catch (e) {
    console.error("resolveGlb poll failed", e);
    return { status: "incubating", glbUrl: null, progress: 10 };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
