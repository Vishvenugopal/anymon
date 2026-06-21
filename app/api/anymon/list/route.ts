import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { publicAnymon } from "@/lib/economy";
import { resolveGlb } from "@/lib/pipeline";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ anymons: [] }, { status: 401 });

  const store = getStore();
  const owned = await store.listByOwner(user.id);

  // Lazily advance any still-incubating Anymon's 3D status. The capture/status
  // poll only runs while the IncubatingScreen is open, so if the player tapped
  // "keep scanning" before the provider finished, this is what flips them to
  // ready (or failed) — otherwise they'd show "incubating…" forever even though
  // the model is done. Only the incubating ones hit the provider.
  const resolved = await Promise.all(
    owned.map(async (a) => {
      if (a.status !== "incubating") return a;
      try {
        const r = await resolveGlb(a);
        if (r.status === "ready" && r.glbUrl) {
          return (
            (await store.updateAnymon(a.id, {
              status: "ready",
              glbUrl: r.glbUrl,
              thumbUrl: r.thumbUrl ?? null,
            })) ?? a
          );
        }
        if (r.status === "failed") {
          return (await store.updateAnymon(a.id, { status: "failed" })) ?? a;
        }
      } catch {
        /* leave it incubating; next refresh retries */
      }
      return a;
    }),
  );

  // Includes deck + roaming Anymon AND any state==="captured" notice ghosts so
  // the deck UI can read win/capture notifications straight off each object.
  const anymons = resolved
    .map(publicAnymon)
    .sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ anymons });
}
