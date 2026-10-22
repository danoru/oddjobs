import type { NextApiRequest, NextApiResponse } from "next";
import { findGame, gameAccess, gameOneShot } from "@/lib/games.server";
import { normalizeCode } from "@/lib/tables";
import type { Naughty } from "@/systems/paranoia/schema";

/**
 * Paranoia's naughty sides at a game. Player pages never carry them
 * (toPublic strips them); this hands each player the secret society, mutant
 * power, secret objectives, treasonous gear and favours of the Troubleshooters
 * they hold, resolved from the game's content on the server, and the GM
 * (and co-GMs, and an admin looking in) every one.
 * GET — { secrets: { [characterId]: Naughty } }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const game = code ? await findGame(code, { claims: true }) : null;
  if (!game) return res.status(404).json({ error: "No table with that code" });
  let os;
  try {
    os = await gameOneShot(game);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  if (os.system !== "paranoia") return res.status(200).json({ secrets: {} });
  const access = await gameAccess(req, game);
  const gm = access.view && req.query.as !== "player";
  const held = new Set(game.claims.filter((c) => access.key && c.playerId === access.key).map((c) => c.characterId));
  const secrets: Record<string, Naughty> = {};
  for (const c of os.cast) if (gm || held.has(c.id)) secrets[c.id] = c.naughty;
  return res.status(200).json({ secrets });
}
