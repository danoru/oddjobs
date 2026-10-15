// Shared table password gate. A signed, expiring token in an httpOnly cookie;
// HMAC via Web Crypto so it runs in both Node and edge middleware.

export const AUTH_COOKIE = "tearoff_auth";
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

export async function createToken(now = Date.now()): Promise<string> {
  const expires = now + TOKEN_TTL_MS;
  const payload = `table.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < now) return false;
  const expected = await hmac(`${role}.${expiresStr}`);
  if (sig.length !== expected.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
