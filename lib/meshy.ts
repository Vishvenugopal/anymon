const BASE = "https://api.meshy.ai/openapi/v1";

function authHeaders() {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY missing");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Submit an Image-to-3D task. `image` may be a public URL or a base64 data URI
 * (Meshy accepts data URIs directly, so Gemini output needs no hosting).
 * Returns the Meshy task id.
 */
export async function createImageTo3D(image: string): Promise<string> {
  const res = await fetch(`${BASE}/image-to-3d`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      image_url: image,
      should_texture: true,
      enable_pbr: true,
      target_formats: ["glb"],
    }),
  });
  if (!res.ok) {
    throw new Error(`Meshy create failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { result: string };
  return data.result;
}

export interface MeshyStatus {
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  glbUrl: string | null;
  progress: number;
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
    glbUrl: data.model_urls?.glb ?? null,
  };
}
