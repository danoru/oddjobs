import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { tableOneShot } from "@/lib/source";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { playerIdOf } from "@/lib/tables.server";
import type { Naughty } from "@/systems/paranoia/schema";

/**
 * Paranoia's naughty sides at a table. Player pages never carry them
 * (toPublic strips them); this hands each player the secret society, mutant
 * power, secret objectives, treasonous gear and favours of the Troubleshooters
 * they hold, resolved from content on the server, and the GM every one.
 * GET — { secrets: { [characterId]: Naughty } }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const table = code ? await db().table.findUnique({ where: { code }, include: { claims: true } }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  let os;
  try {
    os = await tableOneShot(table.oneshot);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  if (os.system !== "paranoia") return res.status(200).json({ secrets: {} });
  const isGm = (await requestRole(req)) === "gm" && req.query.as !== "player";
  const playerId = playerIdOf(req);
  const held = new Set(table.claims.filter((c) => playerId && c.playerId === playerId).map((c) => c.characterId));
  const secrets: Record<string, Naughty> = {};
  for (const c of os.cast) if (isGm || held.has(c.id)) secrets[c.id] = c.naughty;
  return res.status(200).json({ secrets });
}
