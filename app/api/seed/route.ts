import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { placeholderSprite, sampleGlb } from "@/lib/placeholder";
import { NEARBY_RADIUS_M, type Anymon } from "@/lib/types";

export const runtime = "nodejs";

const SEEDS = [
  { object: "book", name: "Tomeling", owner: "maple-7f3a", city: "Berkeley", country: "USA" },
  { object: "waterbottle", name: "Aquaflask", owner: "comet-2b1c", city: "Tokyo", country: "Japan" },
  { object: "umbrella", name: "Brellox", owner: "river-9d4e", city: "London", country: "UK" },
  { object: "lamp", name: "Lumosaur", owner: "nova-5a8b", city: "Paris", country: "France" },
];

function offset(lat: number, lng: number, meters: number, bearingDeg: number) {
  const dLat = (meters * Math.cos((bearingDeg * Math.PI) / 180)) / 111320;
  const dLng =
    (meters * Math.sin((bearingDeg * Math.PI) / 180)) /
    (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

export async function POST(req: Request) {
  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ ok: false, error: "bad coords" }, { status: 400 });
    }
    const store = getStore();

    // Don't keep stacking seeds: skip if the area already has wild Anymons.
    const existing = await store.geoSearch(lng, lat, NEARBY_RADIUS_M);
    if (existing.length >= 3) {
      return NextResponse.json({ ok: true, seeded: 0 });
    }

    let seeded = 0;
    for (let i = 0; i < SEEDS.length; i++) {
      const s = SEEDS[i];
      const pos = offset(lat, lng, 25 + i * 15, i * 90);
      const a: Anymon = {
        id: crypto.randomUUID(),
        object: s.object,
        name: s.name,
        ownerId: `seed:${s.owner}`,
        ownerName: s.owner,
        spriteDataUri: placeholderSprite(s.object),
        glbUrl: sampleGlb(i),
        meshyTaskId: null,
        status: "ready",
        city: s.city,
        country: s.country,
        state: "wild",
        coins: 5 + i * 3,
        lat: pos.lat,
        lng: pos.lng,
        createdAt: Date.now(),
        deployedAt: Date.now() - (i + 1) * 120000,
      };
      await store.saveAnymon(a);
      await store.geoAdd(a.id, pos.lng, pos.lat);
      seeded++;
    }

    return NextResponse.json({ ok: true, seeded });
  } catch (e) {
    console.error("seed error", e);
    return NextResponse.json({ ok: false, error: "seed failed" }, { status: 500 });
  }
}
