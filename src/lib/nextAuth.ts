import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Claims } from "./session";
import { accounts } from "./users.server";
import { ipKey } from "./rateLimit.server";

/**
 * Auth.js (v5): sign in with a username and a password, nothing else. The
 * session is an encrypted JWT in a cookie (Credentials sign-in can't keep
 * sessions in the database) carrying the claims in ./session.ts. Whenever
 * Auth.js reads the session (the GM bar asks on every page load, through
 * /api/whoami), the claims are refreshed from the database at most once a
 * minute, and a disabled account or a changed password ends the session.
 * Privileged pages and APIs don't wait for that: they read the user from the
 * database on every request (`currentUser` in ./auth.ts).
 *
 * The routes are served by src/app/api/auth/[...nextauth]/route.ts. Server-only.
 */

const REFRESH_MS = 60_000;
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

class TooManyTries extends CredentialsSignin {
  code = "rate_limited";
}

type UserClaims = Omit<Claims, "chk" | "sub"> & { id: string; name: string };

const claimsOf = (u: { id: string; username: string; displayName: string; role: string; author: boolean; tokenVersion: number }): UserClaims => ({
  id: u.id,
  name: u.displayName,
  username: u.username,
  role: u.role === "admin" ? "admin" : "member",
  author: u.author,
  tv: u.tokenVersion,
});

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: { username: { label: "Username" }, password: { label: "Password", type: "password" } },
      async authorize(credentials, request) {
        const r = await accounts.authenticate(credentials?.username, credentials?.password, ipKey(request.headers));
        if (!r.ok) {
          if (r.reason === "limited") throw new TooManyTries();
          return null;
        }
        return claimsOf(r.user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as UserClaims;
        return { ...token, sub: u.id, name: u.name, username: u.username, role: u.role, author: u.author, tv: u.tv, chk: Date.now() };
      }
      const t = token as typeof token & Partial<Claims>;
      if (typeof t.chk === "number" && Date.now() - t.chk < REFRESH_MS) return token;
      if (!t.sub || typeof t.tv !== "number") return null;
      const u = await accounts.findUser(t.sub);
      if (!u || u.disabledAt || u.tokenVersion !== t.tv) return null;
      const c = claimsOf(u);
      return { ...token, name: c.name, username: c.username, role: c.role, author: c.author, tv: c.tv, chk: Date.now() };
    },
    async session({ session, token }) {
      const t = token as typeof token & Partial<Claims>;
      return {
        ...session,
        user: { ...session.user, id: t.sub ?? "", name: token.name ?? null, username: t.username, role: t.role, author: t.author },
      };
    },
  },
};

export const { handlers, auth } = NextAuth(authConfig);
