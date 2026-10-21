/**
 * e2e-auth.mts — accounts for the end-to-end scripts. LOCAL ONLY.
 *
 * `ensureE2eUsers()` makes (or puts back) three test accounts in the local
 * database from .env: an admin, an author and a player, with known passwords.
 * It refuses any database that isn't on this machine. `signIn()` goes through
 * Auth.js's credentials flow (the CSRF token, then the form post), exactly as
 * the login page does, and leaves the session cookie in the browser context.
 */
import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, BrowserContext } from "playwright";
import { PrismaClient } from "@prisma/client";
import { resolveDbUrls } from "../src/lib/dbUrl";
import { usernameKey } from "../src/lib/accounts";
import { hashPassword } from "../src/lib/password.server";

export const E2E_USERS = {
  admin: { username: "e2e-admin", password: "e2e-admin-password", displayName: "E2E Admin", role: "admin", author: false },
  author: { username: "e2e-author", password: "e2e-author-password", displayName: "E2E Author", role: "member", author: true },
  player: { username: "e2e-player", password: "e2e-player-password", displayName: "E2E Player", role: "member", author: false },
} as const;
export type E2eWho = keyof typeof E2E_USERS;

/** .env into process.env (what isn't set already), as the Prisma CLI reads it. */
export function loadDotEnv() {
  const file = path.join(import.meta.dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

/** The local database, never the hosted one. */
export function localDb(): PrismaClient {
  loadDotEnv();
  const { url } = resolveDbUrls(process.env);
  if (!url) throw new Error("No database: set DATABASE_URL in .env (pnpm db:dev)");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`e2e accounts only go in a local database, not ${host}`);
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Makes the three test accounts, or puts them back as they should be (enabled, known password, role, no lockout). */
export async function ensureE2eUsers(which: E2eWho[] = ["admin", "author", "player"]): Promise<void> {
  const client = localDb();
  try {
    for (const who of which) {
      const u = E2E_USERS[who];
      const data = {
        username: u.username,
        displayName: u.displayName,
        passwordHash: await hashPassword(u.password),
        role: u.role,
        author: u.author,
        canInvite: u.role === "admin",
        disabledAt: null,
      };
      await client.user.upsert({ where: { usernameLower: usernameKey(u.username) }, create: { ...data, usernameLower: usernameKey(u.username) }, update: data });
      await client.authAttempt.deleteMany({ where: { key: `login:user:${usernameKey(u.username)}` } });
    }
    // Forgive this machine's failed sign-ins from earlier runs (e2e:accounts trips the limit on purpose).
    await client.authAttempt.deleteMany({ where: { key: { startsWith: "login:ip:" } } });
    await client.authAttempt.deleteMany({ where: { key: { startsWith: "token:ip:" } } });
  } finally {
    await client.$disconnect();
  }
}

type Target = BrowserContext | APIRequestContext;
const requestOf = (t: Target): APIRequestContext => ("request" in t ? t.request : t);

/** Signs in through Auth.js. `ok` is whether a session cookie came back; `code` is Auth.js's reason when not. */
export async function signIn(target: Target, base: string, username: string, password: string): Promise<{ ok: boolean; status: number; code: string | null }> {
  const req = requestOf(target);
  const csrf = (await (await req.get(`${base}/api/auth/csrf`)).json()) as { csrfToken: string };
  const r = await req.post(`${base}/api/auth/callback/credentials`, {
    form: { username, password, csrfToken: csrf.csrfToken, callbackUrl: `${base}/board` },
    maxRedirects: 0,
  });
  const location = r.headers()["location"] ?? "";
  const code = location.includes("error=") ? (new URL(location, base).searchParams.get("code") ?? new URL(location, base).searchParams.get("error")) : null;
  const cookies = await (await req.storageState()).cookies;
  const ok = !code && cookies.some((c) => c.name.endsWith("authjs.session-token") && c.value);
  return { ok, status: r.status(), code };
}

/** Signs a context in as one of the test accounts, or throws. */
export async function signInAs(target: Target, base: string, who: E2eWho): Promise<void> {
  const u = E2E_USERS[who];
  const r = await signIn(target, base, u.username, u.password);
  if (!r.ok) throw new Error(`Sign-in as ${u.username} failed (${r.status} ${r.code ?? ""}): is the server running at ${base}, and did ensureE2eUsers() run?`);
}
