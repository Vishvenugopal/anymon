const BASE = "https://api.meshy.ai/openapi/v1";

function authHeaders() {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY missing");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// Meshy needs a RASTER image (PNG/JPEG/WEBP), either a public URL or a data URI.
// An SVG data URI (our placeholder sprite) makes Meshy 400, so we reject it
// before spending a request — the pipeline should never get here with an SVG.
export function isRasterImage(image: string): boolean {
  if (/^https?:\/\//i.test(image)) return true; // assume hosted raster
  const m = image.match(/^data:([^;]+);base64,/);
  if (!m) return false;
  return /^image\/(png|jpe?g|webp)$/i.test(m[1]);
}

/**
 * Submit an Image-to-3D task. `image` may be a public URL or a base64 data URI
 * (Meshy accepts data URIs directly, so Gemini output needs no hosting).
 * Returns the Meshy task id.
 */
export async function createImageTo3D(image: string): Promise<string> {
  if (!isRasterImage(image)) {
    throw new Error(
      "Meshy requires a raster image (PNG/JPEG/WEBP); refusing to send a non-raster input (e.g. SVG placeholder).",
    );
  }
  const res = await fetch(`${BASE}/image-to-3d`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      image_url: image,
      should_texture: true,
      // No PBR: our renderer (AnymonCanvas) has no environment map, so PBR
      // metallic/roughness maps can't reflect anything and only render darker —
      // plus generating them adds time. A plain baseColor-textured GLB looks
      // right with the basic lights and finishes faster.
      enable_pbr: false,
      target_formats: ["glb"],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[meshy] create failed: ${res.status} ${body}`);
    throw new Error(`Meshy create failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { result: string };
  console.log(`[meshy] image-to-3d task created: ${data.result}`);
  return data.result;
}

export interface MeshyStatus {
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  glbUrl: string | null;
  progress: number;
}

// Meshy serves the .glb from a CloudFront CDN with no CORS headers, so the
// browser's GLTF loader can't fetch it directly ("Load Failed"). Route it
// through our same-origin /api/glb proxy (the signed query string is preserved).
function proxiedGlb(url: string): string {
  return `/api/glb?u=${encodeURIComponent(url)}`;
}

export async function getImageTo3D(taskId: string): Promise<MeshyStatus> {
  const res = await fetch(`${BASE}/image-to-3d/${taskId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Meshy poll failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    status: MeshyStatus["status"];
    progress?: number;
    model_urls?: { glb?: string };
  };
  return {
    status: data.status,
    progress: data.progress ?? 0,
    glbUrl: data.model_urls?.glb ? proxiedGlb(data.model_urls.glb) : null,
  };
}
