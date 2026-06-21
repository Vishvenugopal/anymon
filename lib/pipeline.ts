import { creativeName, identifyAndName } from "./claude";
import { generateAnymonSprite } from "./gemini";
import { create3D, get3D, is3DMock, provider } from "./threed";
import { placeholderSprite, sampleGlb } from "./placeholder";
import type { Anymon } from "./types";

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
  };

  // 1) object label + creative name + 2) 2D sprite
  let object = "mystery";
  let name = creativeName(object);
  let sprite: string;
  if (isImageMock()) {
    sprite = placeholderSprite(object);
  } else {
    try {
      const id = await identifyAndName(input.imageBase64);
      object = id.object;
      name = id.name;
    } catch (e) {
      console.error("identifyAndName failed", e);
      object = "creature";
      name = creativeName(object);
    }
    try {
      sprite = await generateAnymonSprite(input.imageBase64, object);
    } catch (e) {
      console.error("generateAnymonSprite failed", e);
      sprite = placeholderSprite(object);
    }
  }

  // 3) kick off 3D (mock if no provider configured)
  let meshyTaskId = "mock";
  if (!is3DMock()) {
    if (provider() === "hfspace") {
      // Generation is started as a background job by the capture route (it needs
      // the saved Anymon id). Just flag it here; fall back to mock without a token.
      meshyTaskId = process.env.HF_TOKEN ? "hfspace" : "mock";
    } else {
      try {
        meshyTaskId = await create3D(sprite);
      } catch (e) {
        console.error("create3D failed", e);
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

/** Resolves the 3D model status for an Anymon (mock = timed, real = provider). */
export async function resolveGlb(
  a: Anymon,
): Promise<{ status: Anymon["status"]; glbUrl: string | null; progress: number }> {
  if (a.status === "ready" && a.glbUrl) {
    return { status: "ready", glbUrl: a.glbUrl, progress: 100 };
  }

  // HF Space: a background job updates the Anymon directly. We just report
  // progress here, and hand back a sample model if that job failed.
  if (a.meshyTaskId === "hfspace") {
    if (a.status === "failed") {
      return { status: "ready", glbUrl: sampleGlb(hash(a.id)), progress: 100 };
    }
    const elapsed = Date.now() - a.createdAt;
    return {
      status: "incubating",
      glbUrl: null,
      progress: Math.min(95, 15 + Math.round(elapsed / 2000)),
    };
  }

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
      return { status: "ready", glbUrl: task.glbUrl, progress: 100 };
    }
    if (task.status === "FAILED" || task.status === "CANCELED") {
      // Don't dead-end the demo: hand back a sample model.
      return { status: "ready", glbUrl: sampleGlb(hash(a.id)), progress: 100 };
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
