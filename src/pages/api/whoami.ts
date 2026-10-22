import type { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/lib/nextAuth";
import { currentUser } from "@/lib/auth";
import { canAuthor, canMakeInvites } from "@/lib/accounts";
import { db } from "@/lib/prisma";
import { readGuestPass } from "@/lib/guestPass";

/**
 * GET — who's signed in, for the bar across the top of every page (the
 * session cookie is httpOnly). Asking also refreshes the session through
 * Auth.js: claims catch up with the database, and a disabled account or a
 * changed password clears the cookie (`signedOut`), so the page can send them
 * to the door. It only shapes navigation: every page and API checks the user
 * again itself.
 *
 * Also: the games the user runs or co-runs that aren't over (for the GM
 * bar), and a guest's pass (name and table). Signing in doesn't take over a
 * guest seat by itself (a phone passed round the table would hand Sam's
 * night to whoever signs in next): that's what an invite for the seat is for.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  const session = await auth(req, res);
  const v = session ? await currentUser(req) : null;
  if (!v) {
    const pass = await readGuestPass(req.headers.cookie);
    return res.status(200).json({
      user: null,
      running: [],
      guest: pass ? { name: pass.name, code: pass.code, oneshot: pass.oneshot } : null,
      signedOut: !!req.headers.cookie?.includes("authjs.session-token"),
    });
  }
  const running = await db().game.findMany({
    where: { status: { notIn: ["finished", "epilogued"] }, OR: [{ gmId: v.id }, { coGms: { some: { userId: v.id } } }] },
    select: { code: true, oneshot: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return res.status(200).json({
    user: {
      username: v.username,
      displayName: v.displayName,
      role: v.role,
      author: canAuthor(v),
      canInvite: canMakeInvites(v),
    },
    running,
    guest: null,
    signedOut: false,
  });
}
