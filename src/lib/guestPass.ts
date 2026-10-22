/**
 * A guest seat's pass (phase 11): someone without an account sits down at one
 * game with its code and a name. The pass is an httpOnly cookie, signed with
 * AUTH_SECRET (HMAC-SHA-256, Web Crypto, so the proxy can check it as well as
 * the API routes), carrying the game's code and one-shot, the guest's random
 * key at that game and their name. It lets them through the front door to
 * that one-shot's player pages and that game's table APIs, and nowhere else.
 * The key is made on the server, so no browser can pick someone else's.
 */

export const GUEST_COOKIE = "oddjobs-guest";
/** A week: long enough to come back for the morning after. */
export const GUEST_DAYS = 7;

export interface GuestPass {
  /** The game's join code. */
  code: string;
  oneshot: string;
  /** The guest's key at that game (hex, never `u-…`, which is an account's). */
  key: string;
  name: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`guest:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** A fresh guest key: 32 hex characters, like the browser ids before accounts. */
export function newGuestKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signGuestPass(pass: GuestPass, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(pass)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

function isPass(p: unknown): p is GuestPass {
  const g = p as Partial<GuestPass> | null;
  return (
    !!g &&
    typeof g.code === "string" &&
    typeof g.oneshot === "string" &&
    /^[a-z0-9-]+$/.test(g.oneshot) &&
    typeof g.key === "string" &&
    /^[0-9a-f]{32}$/.test(g.key) &&
    typeof g.name === "string" &&
    typeof g.exp === "number"
  );
}

/** The pass in a cookie value, if it's ours, well-formed and not expired. */
export async function verifyGuestPass(value: string | undefined | null, secret: string | undefined, now = Date.now()): Promise<GuestPass | null> {
  if (!value || !secret) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  let given: Uint8Array;
  try {
    given = unb64url(sig);
  } catch {
    return null;
  }
  const want = await hmac(secret, body);
  if (given.length !== want.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ given[i];
  if (diff !== 0) return null;
  try {
    const pass: unknown = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return isPass(pass) && pass.exp * 1000 > now ? pass : null;
  } catch {
    return null;
  }
}

/** The guest pass from a Cookie header. */
export async function readGuestPass(cookieHeader: string | null | undefined, secret = process.env.AUTH_SECRET): Promise<GuestPass | null> {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${GUEST_COOKIE}=([^;]+)`));
  return m ? verifyGuestPass(decodeURIComponent(m[1]), secret) : null;
}

/** Behind the screen: never a guest's, whatever the one-shot. */
const GM_PAGES = new Set(["gm", "kit", "box"]);

/**
 * Where a guest pass lets its holder in: the game's one-shot pages (the job
 * page, sheets, cards, the phone, the TV, the morning after) except the GM's,
 * and the game's own table APIs.
 */
export function guestMayVisit(pass: Pick<GuestPass, "code" | "oneshot">, pathname: string): boolean {
  const parts = pathname.replace(/\/+$/, "").split("/").slice(1);
  if (parts[0] === "api") return parts[1] === "tables" && parts[2]?.toUpperCase() === pass.code;
  if (parts[0] === "_next" && parts[1] === "data") parts.splice(0, 3); // /_next/data/<build>/<oneshot>/…json
  const [slug, page] = parts.map((p) => p.replace(/\.json$/, ""));
  return slug === pass.oneshot && !GM_PAGES.has(page ?? "");
}
