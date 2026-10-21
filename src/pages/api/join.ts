import type { NextApiRequest, NextApiResponse } from "next";
import { accounts as defaultAccounts, type Accounts } from "@/lib/users.server";
import { ipKey } from "@/lib/rateLimit.server";
import { allow, bodyOf, sendAccountError } from "@/lib/accountsApi.server";

/**
 * POST { code, username, password, displayName, pronouns? } — sign up with an
 * invite (public: the invite is the key). The invite's use and the account
 * land together; a used-up, expired or taken-down invite is refused (410),
 * and bad codes count towards the door's rate limit. The page signs in
 * through Auth.js afterwards.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, accounts: Accounts = defaultAccounts) {
  if (!allow(req, res, ["POST"])) return;
  const { code, ...input } = bodyOf(req);
  try {
    const user = await accounts.join(code, input, ipKey(req.headers));
    return res.status(201).json({ username: user.username, author: user.author });
  } catch (e) {
    return sendAccountError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}
