import type { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/lib/nextAuth";
import { currentUser } from "@/lib/auth";
import { canAuthor, canMakeInvites, isAdmin } from "@/lib/accounts";

/**
 * GET — who's signed in, for the bar across the top of every page (the
 * session cookie is httpOnly). Asking also refreshes the session through
 * Auth.js: claims catch up with the database, and a disabled account or a
 * changed password clears the cookie (`signedOut`), so the page can send them
 * to the door. It only shapes navigation: every page and API checks the user
 * again itself.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  const session = await auth(req, res);
  const v = session ? await currentUser(req) : null;
  if (!v) return res.status(200).json({ user: null, role: null, signedOut: !!req.headers.cookie?.includes("authjs.session-token") });
  return res.status(200).json({
    user: {
      username: v.username,
      displayName: v.displayName,
      role: v.role,
      author: canAuthor(v),
      canInvite: canMakeInvites(v),
    },
    // The table role, as before: the GM pages are the admins' until games arrive.
    role: isAdmin(v) ? "gm" : "table",
    signedOut: false,
  });
}
