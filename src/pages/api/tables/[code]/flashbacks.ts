import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { playerIdOf } from "@/lib/tables.server";
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
  const table = code ? await db().table.findUnique({ where: { code }, include: { claims: true } }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  const isGm = (await requestRole(req)) === "gm";
  const playerId = playerIdOf(req);

  const list = async (): Promise<FlashbackView[]> => {
    const rows = await db().flashback.findMany({ where: { tableId: table.id }, orderBy: { updatedAt: "asc" } });
    return rows
      .filter((r) => isGm || (playerId && r.playerId === playerId))
      .map((r) => ({ characterId: r.characterId, answer: r.answer, mine: r.playerId === playerId }));
  };

  if (req.method === "GET") return res.status(200).json({ flashbacks: await list() });

  const body = flashbackBody.safeParse(req.body);
  if (!body.success || !playerId) return res.status(400).json({ error: "Write a line first (up to 400 characters)" });
  const claim = table.claims.find((c) => c.characterId === body.data.characterId);
  if (!claim || claim.playerId !== playerId) return res.status(403).json({ error: "Tear that poster down first" });
  await db().flashback.upsert({
    where: { tableId_characterId: { tableId: table.id, characterId: body.data.characterId } },
    create: { tableId: table.id, characterId: body.data.characterId, playerId, answer: body.data.answer },
    update: { playerId, answer: body.data.answer },
  });
  return res.status(200).json({ flashbacks: await list() });
}
