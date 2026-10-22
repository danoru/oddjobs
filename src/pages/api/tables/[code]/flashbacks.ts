import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/prisma";
import { asStatus, isOver } from "@/lib/games";
import { findGame, gameAccess } from "@/lib/games.server";
import { normalizeCode } from "@/lib/tables";
import { flashbackBody, type FlashbackView } from "@/lib/letters";

/**
 * Session zero: each player answers their character's flashback question.
 * GET — the GM sees every answer (for the "previously on…" recap); a player
 *       sees their own.
 * POST { characterId, answer } — answer for a character you hold.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const game = code ? await findGame(code, { claims: true }) : null;
  if (!game) return res.status(404).json({ error: "No table with that code" });
  const access = await gameAccess(req, game);
  const key = access.key;

  const list = async (): Promise<FlashbackView[]> => {
    const rows = await db().flashback.findMany({ where: { gameId: game.id }, orderBy: { updatedAt: "asc" } });
    return rows
      .filter((r) => access.view || (key && r.playerId === key))
      .map((r) => ({ characterId: r.characterId, answer: r.answer, mine: r.playerId === key }));
  };

  if (req.method === "GET") return res.status(200).json({ flashbacks: await list() });

  const body = flashbackBody.safeParse(req.body);
  if (!body.success || !key) return res.status(400).json({ error: "Write a line first (up to 400 characters)" });
  if (isOver(asStatus(game.status))) return res.status(409).json({ error: "This game is over" });
  const claim = game.claims.find((c) => c.characterId === body.data.characterId);
  if (!claim || claim.playerId !== key) return res.status(403).json({ error: "Tear that poster down first" });
  await db().flashback.upsert({
    where: { gameId_characterId: { gameId: game.id, characterId: body.data.characterId } },
    create: { gameId: game.id, characterId: body.data.characterId, playerId: key, answer: body.data.answer },
    update: { playerId: key, answer: body.data.answer },
  });
  return res.status(200).json({ flashbacks: await list() });
}
