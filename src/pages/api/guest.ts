import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/prisma";
import { guestBody } from "@/lib/games";
import { GUEST_COOKIE, GUEST_DAYS, newGuestKey, readGuestPass, signGuestPass } from "@/lib/guestPass";
import { ipKey, LIMITS, rateLimiter, tokenIpKey } from "@/lib/rateLimit.server";
import { readClaims } from "@/lib/session";
import { normalizeCode } from "@/lib/tables";
import { allow } from "@/lib/accountsApi.server";

/**
 * POST { code, name } — sit down at a game as a guest: no account, just the
 * table code and a name (public: the code is the key). Answers with the
 * game's one-shot and sets the guest pass (src/lib/guestPass.ts), which lets
 * this browser into that one-shot's player pages and that game's table. The
 * same browser sitting down again at the same game keeps its key, so its
 * seat stays its own. Bad codes count towards the door's rate limit.
 * DELETE — stand up: forget the pass.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allow(req, res, ["POST", "DELETE"])) return;
  // Over https (Vercel says so here); a local production build is plain http.
  const secure = req.headers["x-forwarded-proto"] === "https";
  const cookie = (value: string, maxAge: number) =>
    `${GUEST_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", cookie("", 0));
    return res.status(200).json({ ok: true });
  }

  if (await readClaims(req.headers.cookie)) return res.status(409).json({ error: "You're signed in: join the table as yourself" });
  const body = guestBody.safeParse(req.body);
  const code = body.success ? normalizeCode(body.data.code) : null;
  if (!body.success || !code) return res.status(400).json({ error: "A table code (five letters and numbers) and your name" });
  const ipK = tokenIpKey(ipKey(req.headers));
  if (await rateLimiter.limited([{ key: ipK, max: LIMITS.token }])) return res.status(429).json({ error: "Too many tries. Wait a few minutes." });
  const game = await db().game.findUnique({ where: { code }, select: { code: true, oneshot: true } });
  if (!game) {
    await rateLimiter.fail([ipK]);
    return res.status(404).json({ error: `There's no table ${code}` });
  }

  const before = await readGuestPass(req.headers.cookie);
  const key = before?.code === game.code ? before.key : newGuestKey();
  const exp = Math.floor(Date.now() / 1000) + GUEST_DAYS * 24 * 60 * 60;
  const pass = await signGuestPass({ code: game.code, oneshot: game.oneshot, key, name: body.data.name, exp }, process.env.AUTH_SECRET ?? "");
  res.setHeader("Set-Cookie", cookie(pass, GUEST_DAYS * 24 * 60 * 60));
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ code: game.code, oneshot: game.oneshot, name: body.data.name });
}
