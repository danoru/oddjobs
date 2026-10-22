import type { NextApiRequest, NextApiResponse } from "next";
import { accounts as defaultAccounts, type Accounts } from "@/lib/users.server";
import { ipKey } from "@/lib/rateLimit.server";
import { allow, bodyOf, sendAccountError } from "@/lib/accountsApi.server";
import { db } from "@/lib/prisma";
import { adoptGuest, adoptGuestPass } from "@/lib/games.server";
import { GUEST_COOKIE, readGuestPass } from "@/lib/guestPass";

/**
 * POST { code, username, password, displayName, pronouns? } — sign up with an
 * invite (public: the invite is the key). The invite's use and the account
 * land together; a used-up, expired or taken-down invite is refused (410),
 * and bad codes count towards the door's rate limit. The page signs in
 * through Auth.js afterwards.
 *
 * Guest seats (phase 11) come along: the invite's own, if a GM made it for
 * a guest's seat, and any this browser held under a guest pass.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, accounts: Accounts = defaultAccounts) {
  if (!allow(req, res, ["POST"])) return;
  const { code, ...input } = bodyOf(req);
  try {
    const user = await accounts.join(code, input, ipKey(req.headers));
    const inv = await db().invite.findUnique({ where: { code: String(code) }, select: { guestGameId: true, guestKey: true } });
    let seats = inv?.guestGameId && inv.guestKey ? await adoptGuest(inv.guestGameId, inv.guestKey, user) : 0;
    const pass = await readGuestPass(req.headers.cookie);
    if (pass) {
      seats += await adoptGuestPass(pass, user);
      res.setHeader("Set-Cookie", `${GUEST_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    }
    return res.status(201).json({ username: user.username, author: user.author, seats });
  } catch (e) {
    return sendAccountError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}
