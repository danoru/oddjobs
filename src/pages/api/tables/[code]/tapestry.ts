import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { loadOneShot } from "@/lib/content";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { applyEdits } from "@/lib/tapestry";
import { NIGHT_INCLUDE, nightOf } from "@/lib/tapestry.server";

/**
 * GET — the night's tapestry for a table: panels woven from what the table
 * saw, with the GM's edits applied. The GM also gets the dropped panels back
 * (marked), to restore them; edits go through PATCH /epilogue.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const table = code ? await db().table.findUnique({ where: { code }, include: NIGHT_INCLUDE }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  let os;
  try {
    os = loadOneShot(table.oneshot);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  const isGm = (await requestRole(req)) === "gm";
  const { panels, edits } = nightOf(table, os);
  return res.status(200).json({ panels: applyEdits(panels, edits, isGm), edits: isGm ? edits : undefined, gm: isGm });
}
