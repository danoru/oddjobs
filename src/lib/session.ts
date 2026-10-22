import { getToken } from "next-auth/jwt";
import type { SiteRole } from "./accounts";

/**
 * The session cookie, read without the database: Auth.js keeps the session in
 * an encrypted JWT (Credentials sign-in can't use database sessions), and
 * this is what the proxy trusts to let someone through. Server code that does
 * anything privileged reads the user from the database instead
 * (`currentUser` in ./auth.ts), which also catches a disabled account or a
 * changed password at once.
 *
 * Auth.js names the cookie `__Secure-authjs.session-token` over https and
 * `authjs.session-token` over http (a local production build), and salts the
 * token with that name; reading whichever one is there keeps the two in step.
 */

export const SESSION_COOKIE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;

/** What the session token carries (src/lib/nextAuth.ts sets it). */
export interface Claims {
  /** The user's id. */
  sub: string;
  username: string;
  /** The display name, as of the last check. */
  name?: string;
  role: SiteRole;
  author: boolean;
  /** The user's tokenVersion when the session started; a bump ends it. */
  tv: number;
  /** When the token was last checked against the database (ms). */
  chk: number;
}

function isClaims(t: unknown): t is Claims {
  const c = t as Partial<Claims> | null;
  return !!c && typeof c.sub === "string" && typeof c.username === "string" && (c.role === "admin" || c.role === "member") && typeof c.tv === "number";
}

/** The session's claims from a Cookie header, or null for no (or a broken) session. */
export async function readClaims(cookieHeader: string | null | undefined): Promise<Claims | null> {
  const cookie = cookieHeader ?? "";
  if (!cookie.includes(SESSION_COOKIE)) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const secureCookie = cookie.includes(SECURE_SESSION_COOKIE);
  const token = await getToken({ req: { headers: { cookie } }, secret, secureCookie });
  return isClaims(token) ? token : null;
}

/** A Node request's Cookie header (API routes and getServerSideProps). */
export function cookieHeaderOf(req: { headers?: Record<string, string | string[] | undefined>; cookies?: Partial<Record<string, string>> }): string {
  const h = req.headers?.cookie;
  if (typeof h === "string") return h;
  // Tests (and anything that only parsed cookies) pass `cookies`.
  return Object.entries(req.cookies ?? {})
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
