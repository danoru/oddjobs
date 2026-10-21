import type { NextApiRequest, NextApiResponse } from "next";
import { apiViewer } from "@/lib/auth";
import { canMakeInvites } from "@/lib/accounts";
import { accounts } from "@/lib/users.server";
import { allow, bodyOf, sendAccountError } from "@/lib/accountsApi.server";

/**
 * Invite links: admins, and members an admin lets invite.
 * GET — the invites you may see (an admin's: all of them).
 * POST { note?, maxUses?, days?, grantsAuthor? } — a new link. A member's are
 *   single-use, a week at most, and never carry the author badge.
 * DELETE { id } — take one down.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allow(req, res, ["GET", "POST", "DELETE"])) return;
  const viewer = await apiViewer(req, res, "member");
  if (!viewer) return;
  if (!canMakeInvites(viewer)) return res.status(403).json({ error: "Ask an admin to let you invite people" });
  const body = bodyOf(req);
  try {
    if (req.method === "GET") return res.status(200).json({ invites: await accounts.listInvites(viewer) });
    if (req.method === "POST") {
      const inv = await accounts.makeInvite(viewer, body);
      return res.status(201).json({ code: inv.code, expiresAt: inv.expiresAt.toISOString() });
    }
    if (typeof body.id !== "string") return res.status(400).json({ error: "Expected { id }" });
    await accounts.revokeInvite(viewer, body.id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return sendAccountError(res, e);
  }
}
