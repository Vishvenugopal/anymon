import { createImageTo3D as meshyCreate, getImageTo3D as meshyGet } from "./meshy";

// Pluggable image -> 3D backend. Choose with MODEL_3D_PROVIDER, or it auto-detects:
//   meshy   -> hosted Meshy API (needs MESHY_API_KEY)              [paid]
//   trellis -> your own TRELLIS HTTP server (needs TRELLIS_API_URL) [free/self-hosted GPU]
//   hfspace -> HF Space "microsoft/TRELLIS.2" (needs HF_TOKEN)      [free GPU, daily quota]
//   mock    -> placeholder sample .glb (no keys, instant demo)
export type Provider = "meshy" | "trellis" | "hfspace" | "mock";

export function provider(): Provider {
  const p = (process.env.MODEL_3D_PROVIDER || "").toLowerCase();
  if (p === "meshy" || p === "trellis" || p === "hfspace" || p === "mock") return p;
  if (process.env.TRELLIS_API_URL) return "trellis";
  if (process.env.MESHY_API_KEY) return "meshy";
  if (process.env.HF_TOKEN) return "hfspace";
  return "mock";
}

export function is3DMock(): boolean {
  return process.env.MOCK_PIPELINE === "1" || provider() === "mock";
}

export interface ThreeDStatus {
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  glbUrl: string | null;
  progress: number;
}

/** Kick off a 3D generation; returns a provider task id. */
export async function create3D(image: string): Promise<string> {
  switch (provider()) {
    case "meshy":
      return meshyCreate(image);
    case "trellis":
      return trellisCreate(image);
    default:
      return "mock";
  }
}

export async function get3D(taskId: string): Promise<ThreeDStatus> {
  switch (provider()) {
    case "meshy": {
      const s = await meshyGet(taskId);
      return { status: s.status, glbUrl: s.glbUrl, progress: s.progress };
    }
    case "trellis":
      return trellisGet(taskId);
    default:
      return { status: "PENDING", glbUrl: null, progress: 0 };
  }
}

// ---------------- TRELLIS (self-hosted) ----------------
// Expects a small HTTP server (see /trellis_server) exposing:
//   POST  {TRELLIS_API_URL}/generate   { image }      -> { task_id }
//   GET   {TRELLIS_API_URL}/status/:id                -> { status, progress, glb_url }
function trellisBase(): string {
  const url = process.env.TRELLIS_API_URL;
  if (!url) throw new Error("TRELLIS_API_URL missing");
  return url.replace(/\/$/, "");
}

async function trellisCreate(image: string): Promise<string> {
  const res = await fetch(`${trellisBase()}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new Error(`TRELLIS create failed: ${res.status}`);
  const data = (await res.json()) as { task_id: string };
  return data.task_id;
}

async function trellisGet(taskId: string): Promise<ThreeDStatus> {
  const res = await fetch(`${trellisBase()}/status/${taskId}`);
  if (!res.ok) throw new Error(`TRELLIS status failed: ${res.status}`);
  const data = (await res.json()) as {
    status: "pending" | "running" | "done" | "error";
    progress?: number;
    glb_url?: string;
  };
  const map: Record<string, ThreeDStatus["status"]> = {
    pending: "PENDING",
    running: "IN_PROGRESS",
    done: "SUCCEEDED",
    error: "FAILED",
  };
  // Make a relative glb_url absolute against the TRELLIS server.
  let glbUrl = data.glb_url ?? null;
  if (glbUrl && glbUrl.startsWith("/")) glbUrl = `${trellisBase()}${glbUrl}`;
  return {
    status: map[data.status] ?? "PENDING",
    glbUrl,
    progress: data.progress ?? 0,
  };
}
