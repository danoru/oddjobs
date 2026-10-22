import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/prisma";
import { asStatus } from "@/lib/games";
import { findGame, gameAccess } from "@/lib/games.server";
import { normalizeCode } from "@/lib/tables";
import { epilogueSchema, hasContent, noEdits, playerEntryBody, tapestryEditsSchema } from "@/lib/epilogueSchema";
import { emptyEpilogue } from "@/lib/epilogue";

/**
 * The morning after, kept per game so the chronicle can gather it.
 * GET — the epilogue (or null), the tapestry edits, and what the asker may
 *   change: the GM everything, a player their own character's line.
 * PUT { epilogue } — GM: the whole broadsheet. Once the game is finished, a
 *   front page with something on it puts it in the paper (epilogued); a
 *   draft written while it's still being played changes nothing about it.
 * PATCH { characterId, entry: { line, playedBy } } — a player's own line.
 * PATCH { tapestry } — GM: panels dropped or renamed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "PUT", "PATCH"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, PUT, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const game = code ? await findGame(code, { claims: true, epilogue: true }) : null;
  if (!game) return res.status(404).json({ error: "No table with that code" });
  const access = await gameAccess(req, game);
  const held = game.claims.filter((c) => access.key && c.playerId === access.key).map((c) => c.characterId);

  const current = () => {
    const ep = epilogueSchema.safeParse(game.epilogue?.data);
    const edits = tapestryEditsSchema.safeParse(game.epilogue?.tapestry);
    return { epilogue: ep.success ? ep.data : null, tapestry: edits.success ? edits.data : noEdits() };
  };
  const save = async (data: { epilogue?: unknown; tapestry?: unknown }) => {
    const now = current();
    const next = { data: (data.epilogue ?? now.epilogue ?? emptyEpilogue()) as Prisma.InputJsonValue, tapestry: (data.tapestry ?? now.tapestry) as Prisma.InputJsonValue };
    const row = await db().epilogue.upsert({ where: { gameId: game.id }, create: { gameId: game.id, ...next }, update: next });
    game.epilogue = row;
  };
  const reply = (status = 200) => res.status(status).json({ ...current(), canEdit: access.act ? "all" : held, status: asStatus(game.status) });
  const notGm = () => res.status(403).json({ error: access.view ? "Only this game's GM can do that" : "Only the GM sets the front page" });

  if (req.method === "GET") return reply();

  if (req.method === "PUT") {
    if (!access.act) return notGm();
    const ep = epilogueSchema.safeParse(req.body?.epilogue);
    if (!ep.success) return res.status(400).json({ error: "That front page doesn't parse" });
    await save({ epilogue: ep.data });
    if (hasContent(ep.data) && game.status === "finished") {
      const row = await db().game.update({ where: { id: game.id }, data: { status: "epilogued", finishedAt: game.finishedAt ?? new Date() } });
      game.status = row.status;
    }
    return reply();
  }

  if (req.body?.tapestry !== undefined) {
    if (!access.act) return notGm();
    const edits = tapestryEditsSchema.safeParse(req.body.tapestry);
    if (!edits.success) return res.status(400).json({ error: "Those edits don't parse" });
    await save({ tapestry: edits.data });
    return reply();
  }

  const body = playerEntryBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Which character, and what line?" });
  if (!access.act && !held.includes(body.data.characterId)) return res.status(403).json({ error: "You can only write your own character's line" });
  const ep = current().epilogue ?? emptyEpilogue();
  const entry = { ...ep.entries[body.data.characterId], ...body.data.entry };
  await save({ epilogue: { ...ep, entries: { ...ep.entries, [body.data.characterId]: entry } } });
  return reply();
}
