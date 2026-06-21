import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    return NextResponse.json({
      authenticated: true,
      id: user.id,
      email: user.email,
      image: user.image,
      username: user.username,
      needsUsername: !user.username,
    });
  } catch (e) {
    // e.g. AUTH_SECRET missing / no providers configured. Don't 500 (which
    // returns non-JSON and crashes the client); report unauthenticated.
    console.error("/api/me failed:", e);
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}
