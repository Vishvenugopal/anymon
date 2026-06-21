import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getStore } from "@/lib/store";
import { USERNAME_RE, type User } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { username } = await req.json();
  const name = String(username || "").trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    return NextResponse.json(
      { error: "3-20 chars, lowercase letters, numbers, underscore" },
      { status: 400 },
    );
  }

  const store = getStore();

  // If the user already has a username, don't allow silent reassignment here.
  if (user.username && user.username !== name) {
    return NextResponse.json(
      { error: "username already set" },
      { status: 409 },
    );
  }

  const reserved = await store.reserveUsername(name, user.id);
  if (!reserved) {
    return NextResponse.json({ error: "username taken" }, { status: 409 });
  }

  const profile: User = {
    id: user.id,
    email: user.email,
    image: user.image,
    username: name,
    createdAt: Date.now(),
  };
  await store.saveUser(profile);

  return NextResponse.json({ ok: true, username: name });
}
