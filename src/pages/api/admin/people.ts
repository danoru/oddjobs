import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { apiViewer } from "@/lib/auth";
import { accounts } from "@/lib/users.server";
import { allow, bodyOf, sendAccountError } from "@/lib/accountsApi.server";

const access = z.object({
  action: z.literal("access"),
  userId: z.string(),
  role: z.enum(["admin", "member"]).optional(),
  author: z.boolean().optional(),
  canInvite: z.boolean().optional(),
  disabled: z.boolean().optional(),
});
const reset = z.object({ action: z.literal("reset"), userId: z.string() });
const body = z.discriminatedUnion("action", [access, reset]);

/**
 * The people page's API. Admins only, checked against the database.
 * GET — every account.
 * POST { action: "access", userId, role?, author?, canInvite?, disabled? } — grant or take away.
 * POST { action: "reset", userId } — a one-time reset link's token, shown once.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allow(req, res, ["GET", "POST"])) return;
  const viewer = await apiViewer(req, res, "admin");
  if (!viewer) return;
  try {
    if (req.method === "GET") return res.status(200).json({ people: await accounts.listPeople() });
    const parsed = body.safeParse(bodyOf(req));
    if (!parsed.success) return res.status(400).json({ error: "Expected an access or reset request" });
    const b = parsed.data;
    if (b.action === "reset") {
      const r = await accounts.makeReset(viewer, b.userId);
      return res.status(201).json({ token: r.token, expiresAt: r.expiresAt.toISOString(), username: r.username });
    }
    const { userId, action: _action, ...change } = b;
    void _action;
    const u = await accounts.setAccess(viewer, userId, change);
    return res.status(200).json({ id: u.id, role: u.role, author: u.author, canInvite: u.canInvite, disabled: !!u.disabledAt });
  } catch (e) {
    return sendAccountError(res, e);
  }
}
