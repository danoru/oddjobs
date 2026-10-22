import { encode } from "next-auth/jwt";
import type { Viewer } from "./accounts";
import { userSource } from "./auth";
import { SESSION_COOKIE } from "./session";

/**
 * Sessions for unit tests, without a database: real Auth.js session tokens
 * (encrypted with AUTH_SECRET, as the app makes them) for a few made-up
 * people, and a user source that knows them. `installTestUsers()` once in a
 * test file, then `sessionCookies("gm")` for the request's cookies.
 *
 * "gm" is an admin; "table" a plain member. Who runs a game is per game.
 */
export const TEST_USERS = {
  gm: { id: "u-admin", username: "barkeep", displayName: "The Barkeep", pronouns: null, role: "admin", author: false, canInvite: true },
  author: { id: "u-author", username: "quill", displayName: "Quill", pronouns: "she/her", role: "member", author: true, canInvite: false },
  author2: { id: "u-author2", username: "nib", displayName: "Nib", pronouns: null, role: "member", author: true, canInvite: false },
  table: { id: "u-member", username: "rook", displayName: "Rook", pronouns: "they/them", role: "member", author: false, canInvite: false },
} as const satisfies Record<string, Viewer>;
export type TestWho = keyof typeof TEST_USERS;

/** Users the server will find, by id; tokenVersion 0 is the current one. */
export function installTestUsers(extra: Viewer[] = []) {
  process.env.AUTH_SECRET ??= "test-secret";
  const all = new Map<string, Viewer>([...Object.values(TEST_USERS), ...extra].map((v) => [v.id, v]));
  userSource.viewer = async (id, tv) => (tv === 0 ? (all.get(id) ?? null) : null);
}

export async function sessionToken(v: Viewer, tv = 0): Promise<string> {
  return encode({
    secret: process.env.AUTH_SECRET!,
    salt: SESSION_COOKIE,
    token: { sub: v.id, name: v.displayName, username: v.username, role: v.role, author: v.author, tv, chk: Date.now() },
  });
}

/** A request's `cookies` for a signed-in test user (or none). */
export async function sessionCookies(who: TestWho | Viewer | null | undefined): Promise<Record<string, string>> {
  if (!who) return {};
  const v = typeof who === "string" ? TEST_USERS[who] : who;
  return { [SESSION_COOKIE]: await sessionToken(v) };
}
