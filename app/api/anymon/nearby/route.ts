import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { publicAnymon } from "@/lib/economy";
import { getCurrentUser } from "@/lib/auth-helpers";
import { NEARBY_RADIUS_M } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "anon";

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radius = parseFloat(searchParams.get("radius") || `${NEARBY_RADIUS_M}`);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ anymons: [] });
  }

  const store = getStore();
  const hits = await store.geoSearch(lng, lat, radius);

  const anymons = [];
  for (const hit of hits) {
    const a = await store.getAnymon(hit.id);
    if (!a || a.state !== "wild") continue;
    anymons.push({
      ...publicAnymon(a),
      distM: Math.round(hit.distM),
      mine: a.ownerId === ownerId,
    });
  }

  return NextResponse.json({ anymons });
}
