import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Same-origin proxy for remote .glb files (e.g. Hugging Face Space outputs) so
// the 3D viewer never hits cross-origin/CORS issues. Allow-listed hosts only.
const ALLOWED = [".hf.space", "huggingface.co", "hf.co"];

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

  const token = process.env.HF_TOKEN;
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
