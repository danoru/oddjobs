import type { NextApiRequest, NextApiResponse } from "next";
import { findGame, gameAccess, gameOneShot } from "@/lib/games.server";
import { normalizeCode } from "@/lib/tables";
import { applyEdits } from "@/lib/tapestry";
import { NIGHT_INCLUDE, nightOf } from "@/lib/tapestry.server";

/**
 * GET — the night's tapestry for a game: panels woven from what the table
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
  const table = code ? await findGame(code, NIGHT_INCLUDE) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  let os;
  try {
    os = await gameOneShot(table);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  const isGm = (await gameAccess(req, table)).view;
  const { panels, edits } = nightOf(table, os);
  return res.status(200).json({ panels: applyEdits(panels, edits, isGm), edits: isGm ? edits : undefined, gm: isGm });
}
