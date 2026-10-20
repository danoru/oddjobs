import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";

/**
 * GET — which door this browser came in by ("table" or "gm"). The cookie is
 * httpOnly, so pages ask here to decide whether to show the GM bar. It only
 * shapes navigation: every GM page and API checks the role again itself.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ role: await requestRole(req) });
}
