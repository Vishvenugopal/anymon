import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { publicAnymon } from "@/lib/economy";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ anymons: [] }, { status: 401 });

  const store = getStore();
  // Includes deck + roaming Anymon AND any state==="captured" notice ghosts so
  // the deck UI can read win/capture notifications straight off each object.
  const anymons = (await store.listByOwner(user.id))
    .map(publicAnymon)
    .sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ anymons });
}
