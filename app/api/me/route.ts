import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    id: user.id,
    email: user.email,
    image: user.image,
    username: user.username,
    needsUsername: !user.username,
  });
}
