// Password gate with two tiers: the table password lets players in, the GM
// password also opens the GM pages. A signed, expiring `<role>.<expires>`
// token in an httpOnly cookie; HMAC via Web Crypto so it runs in both Node
// and the proxy.

export const AUTH_COOKIE = "tearoff_auth";
export const ROLES = ["table", "gm"] as const;
export type Role = (typeof ROLES)[number];
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

export async function createToken(role: Role = "table", now = Date.now()): Promise<string> {
  const expires = now + TOKEN_TTL_MS;
  const payload = `${role}.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

/** The token's role if it is genuine and unexpired, otherwise null. */
export async function verifyToken(
  token: string | undefined,
  now = Date.now(),
): Promise<Role | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, expiresStr, sig] = parts;
  if (!(ROLES as readonly string[]).includes(role)) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < now) return null;
  const expected = await hmac(`${role}.${expiresStr}`);
  if (sig.length !== expected.length) return null;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0 ? (role as Role) : null;
}

/** Which role a password unlocks. The GM password is checked first. */
export function roleForPassword(
  password: unknown,
  env: Partial<Record<"GM_PASSWORD" | "APP_PASSWORD", string>> = process.env as Record<string, string>,
): Role | null {
  if (typeof password !== "string" || !password) return null;
  if (env.GM_PASSWORD && password === env.GM_PASSWORD) return "gm";
  if (env.APP_PASSWORD && password === env.APP_PASSWORD) return "table";
  return null;
}

/** Role from a Node request's cookie, for API routes and getServerSideProps. */
export async function requestRole(req: { cookies: Partial<Record<string, string>> }): Promise<Role | null> {
  return verifyToken(req.cookies[AUTH_COOKIE]);
}
