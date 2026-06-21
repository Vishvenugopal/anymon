import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Same-origin proxy for remote .glb files so the 3D viewer never hits
// cross-origin/CORS issues. Meshy serves models from a CloudFront CDN
// (assets.meshy.ai) that sends NO CORS headers, so the browser's GLTF loader
// fails with "Load Failed" on a direct fetch — proxying through our own origin
// fixes it. Allow-listed hosts only.
const HF_HOSTS = [".hf.space", "huggingface.co", "hf.co"];
const ALLOWED = [...HF_HOSTS, "assets.meshy.ai", ".meshy.ai"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get("u");
  if (!u) return NextResponse.json({ error: "missing u" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "https:") {
    return NextResponse.json({ error: "https only" }, { status: 400 });
  }
  const host = target.hostname.toLowerCase();
  if (!ALLOWED.some((h) => host === h || host.endsWith(h))) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  // Only HF needs an auth header; Meshy URLs are pre-signed (signature in the
  // query string) and must NOT receive a stray bearer token.
  const isHf = HF_HOSTS.some((h) => host === h || host.endsWith(h));
  const token = isHf ? process.env.HF_TOKEN : undefined;
  const upstream = await fetch(target.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
