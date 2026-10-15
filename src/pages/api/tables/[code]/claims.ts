import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { claimBody, normalizeCode } from "@/lib/tables";
import { isUniqueViolation, playerIdOf, tableState } from "@/lib/tables.server";

/**
 * POST { characterId, name } — tear a poster. The (table, character) unique
 * key is the lock, so two players tearing at once can't both win.
 * DELETE ?characterId= — pin it back up: your own poster, or any as the GM.
 * Both answer with the table's new state.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeCode(req.query.code);
  const table = code ? await db().table.findUnique({ where: { code } }) : null;
  if (!code || !table) return res.status(404).json({ error: "No table with that code" });
  const playerId = playerIdOf(req);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "POST") {
    const body = claimBody.safeParse(req.body);
    if (!body.success || !playerId) return res.status(400).json({ error: "Join the table with your name first" });
    try {
      await db().claim.create({
        data: { tableId: table.id, characterId: body.data.characterId, playerId, playerName: body.data.name },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const state = await tableState(code, playerId);
      const holder = state?.claims.find((c) => c.characterId === body.data.characterId);
      return res.status(409).json({ error: `Already torn down by ${holder?.name ?? "someone"}`, state });
    }
    return res.status(201).json(await tableState(code, playerId));
  }

  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : "";
  const claim = await db().claim.findUnique({ where: { tableId_characterId: { tableId: table.id, characterId } } });
  if (claim) {
    const isGm = (await requestRole(req)) === "gm";
    if (!isGm && claim.playerId !== playerId) {
      return res
        .status(403)
        .json({ error: "Only whoever tore it (or the GM) can pin it back up", state: await tableState(code, playerId) });
    }
    // deleteMany: no error if someone else released it a moment ago.
    await db().claim.deleteMany({ where: { id: claim.id } });
  }
  return res.status(200).json(await tableState(code, playerId));
}
