import type { NextApiRequest, NextApiResponse } from "next";
import { apiViewer } from "@/lib/auth";
import { accounts } from "@/lib/users.server";
import { allow, bodyOf, sendAccountError } from "@/lib/accountsApi.server";

/**
 * Your own account (/settings).
 * PATCH { displayName, pronouns } — what the table calls you.
 * POST { current, password } — change your password. Every session ends,
 *   this one included; the page signs in again with the new password.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allow(req, res, ["PATCH", "POST"])) return;
  const viewer = await apiViewer(req, res, "member");
  if (!viewer) return;
  const body = bodyOf(req);
  try {
    if (req.method === "PATCH") {
      const u = await accounts.updateProfile(viewer.id, body);
      return res.status(200).json({ displayName: u.displayName, pronouns: u.pronouns });
    }
    await accounts.changePassword(viewer.id, body.current, body.password);
    return res.status(200).json({ ok: true, username: viewer.username });
  } catch (e) {
    return sendAccountError(res, e);
  }
}
