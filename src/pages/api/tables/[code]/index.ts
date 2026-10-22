import type { NextApiRequest, NextApiResponse } from "next";
import { findGame, gameAccess } from "@/lib/games.server";
import { normalizeCode } from "@/lib/tables";
import { CLAIMS_IN_ORDER, stateOf } from "@/lib/tables.server";

/** GET — the game's one-shot, status and who has torn what. Polled by every player. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeCode(req.query.code);
  const game = code ? await findGame(code, CLAIMS_IN_ORDER) : null;
  if (!game) return res.status(404).json({ error: "No table with that code" });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(stateOf(game, (await gameAccess(req, game)).key));
}
