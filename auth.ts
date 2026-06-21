import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

// Build the provider list. Google is the primary sign-in. A "guest" provider
// is enabled only when ALLOW_GUEST=1 so you can run the app before configuring
// Google OAuth (handy for local dev / demos).
const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (process.env.ALLOW_GUEST === "1") {
  providers.push(
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {},
      async authorize() {
        const id = `guest_${crypto.randomUUID()}`;
        return { id, name: "guest", email: `${id}@guest.anymon` };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: {},
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
