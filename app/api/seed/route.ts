import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { NEARBY_RADIUS_M, rarityMaxHp, type Anymon } from "@/lib/types";

export const runtime = "nodejs";

// Bump when the seed set changes so old placeholders are cleaned up + replaced.
const SEED_VERSION = "v2";

// Real pre-generated starter Anymon: each `asset` has a matching sprite + 3D
// model under /public/seeds (built FROM that object via Gemini + Meshy, see
// scripts/gen-seeds.mjs), so name ↔ object ↔ model all agree and they read as
// genuine Anymon instead of random sample models with mismatched names.
// Commonness-based rarity stays harsh (everyday objects = 1 star).
const SEEDS = [
  { asset: "book", object: "book", name: "Tomeling", owner: "maple-7f3a", city: "Berkeley", country: "USA", rarity: 1 },
  { asset: "mug", object: "mug", name: "Muglet", owner: "comet-2b1c", city: "Tokyo", country: "Japan", rarity: 1 },
  { asset: "umbrella", object: "umbrella", name: "Brellox", owner: "river-9d4e", city: "London", country: "UK", rarity: 2 },
  { asset: "lamp", object: "lamp", name: "Lumosaur", owner: "nova-5a8b", city: "Paris", country: "France", rarity: 1 },
  { asset: "telescope", object: "telescope", name: "Scopestar", owner: "orbit-1a2b", city: "Reykjavik", country: "Iceland", rarity: 5 },
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

    const hits = await store.geoSearch(lng, lat, NEARBY_RADIUS_M);
    const nearby = (
      await Promise.all(hits.map((h) => store.getAnymon(h.id)))
    ).filter((a): a is Anymon => !!a);

    // Remove OUTDATED seed placeholders (previous versions used random sample
    // models with mismatched names) so they get replaced by the current set.
    let removed = 0;
    for (const a of nearby) {
      if (a.ownerId.startsWith("seed:") && !a.ownerId.startsWith(`seed:${SEED_VERSION}:`)) {
        await store.geoRemove(a.id);
        await store.deleteAnymon(a.id);
        removed++;
      }
    }

    // Already seeded this version here? Don't stack.
    const haveCurrent = nearby.some((a) =>
      a.ownerId.startsWith(`seed:${SEED_VERSION}:`),
    );
    if (haveCurrent) {
      return NextResponse.json({ ok: true, seeded: 0, removed });
    }

    let seeded = 0;
    for (let i = 0; i < SEEDS.length; i++) {
      const s = SEEDS[i];
      const pos = offset(lat, lng, 25 + i * 15, i * 90);
      const maxHp = rarityMaxHp(s.rarity);
      const a: Anymon = {
        id: crypto.randomUUID(),
        object: s.object,
        name: s.name,
        ownerId: `seed:${SEED_VERSION}:${s.owner}`,
        ownerName: s.owner,
        spriteDataUri: `/seeds/${s.asset}.png`,
        glbUrl: `/seeds/${s.asset}.glb`,
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
        rarity: s.rarity,
        maxHp,
        hp: maxHp,
        pendingWins: 0,
        pendingCoins: 0,
        capturedBy: null,
      };
      await store.saveAnymon(a);
      await store.geoAdd(a.id, pos.lng, pos.lat);
      seeded++;
    }

    return NextResponse.json({ ok: true, seeded, removed });
  } catch (e) {
    console.error("seed error", e);
    return NextResponse.json({ ok: false, error: "seed failed" }, { status: 500 });
  }
}
