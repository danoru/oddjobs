import type { NextApiRequest, NextApiResponse } from "next";
import { accounts as defaultAccounts, type Accounts } from "@/lib/users.server";
import { ipKey } from "@/lib/rateLimit.server";
import { allow, bodyOf, sendAccountError } from "@/lib/accountsApi.server";

/**
 * POST { token, password } — set a new password with a one-time reset link
 * (public: the link is the key). Works once, before it expires; every
 * session the account had ends. Bad tokens count towards the door's rate
 * limit. The page signs in with the new password afterwards.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, accounts: Accounts = defaultAccounts) {
  if (!allow(req, res, ["POST"])) return;
  const { token, password } = bodyOf(req);
  try {
    const user = await accounts.useReset(token, password, ipKey(req.headers));
    return res.status(200).json({ username: user.username });
  } catch (e) {
    return sendAccountError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}
