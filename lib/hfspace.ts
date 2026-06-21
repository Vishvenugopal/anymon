import { getStore } from "./store";
import { createImageTo3D, getImageTo3D } from "./meshy";

// Image -> 3D via the public Hugging Face Space "microsoft/TRELLIS.2".
// Free GPU (ZeroGPU) — needs an HF token for usable quota. The Space exposes a
// stateful Gradio API; the full flow is: start_session -> preprocess_image ->
// image_to_3d (GPU) -> extract_glb (returns the .glb file url).
const SPACE = process.env.HF_TRELLIS_SPACE || "microsoft/TRELLIS.2";

function dataUriToBlob(dataUri: string): Blob {
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/);
  const mime = m?.[1] || "image/png";
  const b64 = m?.[2] || dataUri;
  const buf = Buffer.from(b64, "base64");
  return new Blob([buf], { type: mime });
}

/** Runs the 4-step TRELLIS.2 Space flow and returns a downloadable .glb URL. */
export async function generateGlbViaSpace(spriteDataUri: string): Promise<string> {
  const token = process.env.HF_TOKEN as `hf_${string}` | undefined;
  const { Client } = await import("@gradio/client");
  const app = await Client.connect(SPACE, token ? { hf_token: token } : undefined);

  const image = dataUriToBlob(spriteDataUri);

  // start a session (server keeps the generated model in session state)
  try {
    await app.predict("/start_session", {});
  } catch {
    /* some deployments don't require this */
  }

  // 1) clean / alpha-mask the input
  const pre = await app.predict("/preprocess_image", { input: image });
  const processed = (pre.data as unknown[])[0];

  // 2) the GPU-heavy generation (result lives in session state)
  await app.predict("/image_to_3d", {
    image: processed,
    resolution: "1024",
  });

  // 3) export the GLB
  const glb = await app.predict("/extract_glb", {
    decimation_target: 300000,
    texture_size: 1024,
  });
  const arr = glb.data as Array<{ url?: string } | undefined>;
  const url = arr?.[0]?.url || arr?.[1]?.url;
  if (!url) throw new Error("TRELLIS.2 returned no GLB url");
  return url;
}

/** Meshy fallback: create an image-to-3D task and poll until the GLB is ready. */
async function generateGlbViaMeshy(spriteDataUri: string): Promise<string> {
  const taskId = await createImageTo3D(spriteDataUri);
  const deadline = Date.now() + 4 * 60 * 1000; // up to 4 min
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await getImageTo3D(taskId);
    if (s.status === "SUCCEEDED" && s.glbUrl) return s.glbUrl;
    if (s.status === "FAILED" || s.status === "CANCELED")
      throw new Error("Meshy task failed");
  }
  throw new Error("Meshy timed out");
}

/**
 * Fire-and-forget background job: generates the GLB and writes it back onto the
 * Anymon when done. Keeps the instant-2D UX (capture returns immediately; the
 * 3D model fills in on a later /capture/status poll). Works on a long-lived
 * Node server (next dev / self-host); not on per-request serverless platforms.
 *
 * Strategy: try the free HF Space (with retries); if it can't deliver, fall back
 * to Meshy when MESHY_API_KEY is set; otherwise mark failed (sample model shown).
 */
export async function startHfGeneration(
  anymonId: string,
  spriteDataUri: string,
): Promise<void> {
  const store = getStore();
  // The shared public TRELLIS.2 Space (ZeroGPU) intermittently errors when it's
  // out of quota or restarting, so retry a couple of times before giving up.
  const attempts = 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      const url = await generateGlbViaSpace(spriteDataUri);
      const proxied = `/api/glb?u=${encodeURIComponent(url)}`;
      await store.updateAnymon(anymonId, { glbUrl: proxied, status: "ready" });
      console.log(`[hfspace] ${anymonId} ready (attempt ${i})`);
      return;
    } catch (e) {
      const detail =
        e instanceof Error
          ? e.message
          : (() => {
              try {
                return JSON.stringify(e);
              } catch {
                return String(e);
              }
            })();
      console.error(`[hfspace] attempt ${i}/${attempts} failed:`, detail);
      if (i < attempts) await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }

  // HF Space gave up — fall back to Meshy if a key is configured.
  if (process.env.MESHY_API_KEY) {
    try {
      console.log(`[hfspace] falling back to Meshy for ${anymonId}`);
      const url = await generateGlbViaMeshy(spriteDataUri);
      const proxied = `/api/glb?u=${encodeURIComponent(url)}`;
      await store.updateAnymon(anymonId, { glbUrl: proxied, status: "ready" });
      console.log(`[hfspace] ${anymonId} ready via Meshy fallback`);
      return;
    } catch (e) {
      console.error("[meshy fallback] failed:", (e as Error).message);
    }
  }

  // Mark failed; resolveGlb hands back a sample model so the demo continues.
  await store.updateAnymon(anymonId, { status: "failed" });
}
