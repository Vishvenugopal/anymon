import { auth } from "@/auth";
import { getStore } from "./store";
import type { User } from "./types";

export interface SessionUser {
  id: string;
  email: string | null;
  image: string | null;
  username: string | null; // null until the user picks one
}

/** Returns the authenticated user (with our app profile) or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const store = getStore();
  const profile: User | null = await store.getUser(id);
  return {
    id,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    username: profile?.username ?? null,
  };
}
