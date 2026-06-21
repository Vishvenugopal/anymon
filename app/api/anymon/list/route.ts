import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { withLiveCoins } from "@/lib/economy";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ anymons: [] }, { status: 401 });

  const store = getStore();
  const anymons = (await store.listByOwner(user.id))
    .map(withLiveCoins)
    .sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ anymons });
}
