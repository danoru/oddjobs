import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { db } from "./prisma";

/**
 * Rate limiting for the door: failed sign-ins, reset links and invite codes
 * are counted in the database (`AuthAttempt`), so the limit holds across
 * Vercel's serverless instances. Only failures count, so a table of friends
 * signing in from one house never trips it. Server-only.
 */

export const WINDOW_MS = 15 * 60 * 1000;

/** How many failures in WINDOW_MS before the door stays shut. */
export const LIMITS = {
  /** Wrong passwords for one username, from anywhere. */
  loginUser: 5,
  /** Wrong passwords from one address, for any usernames. */
  loginIp: 25,
  /** Bad reset links or invite codes from one address. */
  token: 20,
} as const;

/** A request's address, hashed: enough to tell callers apart, without keeping who they are. */
export function ipKey(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (k: string) => {
    const v = headers instanceof Headers ? headers.get(k) : headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const ip = (get("x-forwarded-for") ?? "").split(",")[0].trim() || get("x-real-ip") || "local";
  return createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 20);
}

export class RateLimiter {
  constructor(
    private readonly client: () => PrismaClient = db,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether any key has had `max` failures in the window. */
  async limited(checks: { key: string; max: number }[]): Promise<boolean> {
    const since = new Date(this.now() - WINDOW_MS);
    for (const { key, max } of checks) {
      const n = await this.client().authAttempt.count({ where: { key, createdAt: { gt: since } } });
      if (n >= max) return true;
    }
    return false;
  }

  async fail(keys: string[]): Promise<void> {
    const now = new Date(this.now());
    await this.client().authAttempt.createMany({ data: keys.map((key) => ({ key, createdAt: now })) });
    // Now and then, sweep out what no window will look at again.
    if (Math.random() < 0.05) {
      await this.client().authAttempt.deleteMany({ where: { createdAt: { lt: new Date(this.now() - 24 * 60 * 60 * 1000) } } });
    }
  }

  /** A good sign-in forgives that username's earlier slips. */
  async clear(key: string): Promise<void> {
    await this.client().authAttempt.deleteMany({ where: { key } });
  }
}

export const rateLimiter = new RateLimiter();
export const loginUserKey = (usernameLower: string) => `login:user:${usernameLower}`;
export const loginIpKey = (ip: string) => `login:ip:${ip}`;
export const tokenIpKey = (ip: string) => `token:ip:${ip}`;
