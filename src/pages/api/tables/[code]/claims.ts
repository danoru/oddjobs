import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/prisma";
import { asStatus, isOver, isSeating, userIdOfKey } from "@/lib/games";
import { findGame, gameAccess } from "@/lib/games.server";
import { claimBody, normalizeCode } from "@/lib/tables";
import { isUniqueViolation, tableState } from "@/lib/tables.server";

/**
 * POST { characterId } — tear a poster: take that seat at the game, as your
 * account or under your guest pass. The (game, character) unique key is the
 * lock, so two players tearing at once can't both win.
 * DELETE ?characterId= — pin it back up: your own poster, or any as the GM.
 * Both answer with the game's new state.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeCode(req.query.code);
  const game = code ? await findGame(code, { _count: { select: { claims: true } } }) : null;
  if (!code || !game) return res.status(404).json({ error: "No table with that code" });
  const access = await gameAccess(req, game);
  const status = asStatus(game.status);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "POST") {
    const body = claimBody.safeParse(req.body);
    if (!body.success || !access.key) return res.status(400).json({ error: "Join the table with your name first" });
    if (!isSeating(status)) {
      const error = isOver(status) ? "This game is over" : "The GM hasn't opened the seats yet";
      return res.status(409).json({ error, state: await tableState(code, access.key) });
    }
    if (game.seats !== null && game._count.claims >= game.seats) {
      return res.status(409).json({ error: `All ${game.seats} seats are taken`, state: await tableState(code, access.key) });
    }
    try {
      await db().claim.create({
        data: { gameId: game.id, characterId: body.data.characterId, playerId: access.key, playerName: access.name ?? "someone", userId: userIdOfKey(access.key) },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const state = await tableState(code, access.key);
      const holder = state?.claims.find((c) => c.characterId === body.data.characterId);
      return res.status(409).json({ error: `Already torn down by ${holder?.name ?? "someone"}`, state });
    }
    return res.status(201).json(await tableState(code, access.key));
  }

  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : "";
  const claim = await db().claim.findUnique({ where: { gameId_characterId: { gameId: game.id, characterId } } });
  if (claim) {
    if (!access.act && claim.playerId !== access.key) {
      return res
        .status(403)
        .json({ error: "Only whoever tore it (or the GM) can pin it back up", state: await tableState(code, access.key) });
    }
    // History is history: who sat where is what the profiles remember.
    if (isOver(status)) return res.status(409).json({ error: "This game is over", state: await tableState(code, access.key) });
    // deleteMany: no error if someone else released it a moment ago.
    await db().claim.deleteMany({ where: { id: claim.id } });
  }
  return res.status(200).json(await tableState(code, access.key));
}
