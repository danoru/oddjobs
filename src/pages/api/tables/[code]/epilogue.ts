import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { requestRole } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { playerIdOf } from "@/lib/tables.server";
import { epilogueSchema, noEdits, playerEntryBody, tapestryEditsSchema } from "@/lib/epilogueSchema";
import { emptyEpilogue } from "@/lib/epilogue";

/**
 * The morning after, kept per table so the chronicle can gather it.
 * GET — the epilogue (or null), the tapestry edits, and what the asker may
 *   change: the GM everything, a player their own character's line.
 * PUT { epilogue } — GM: the whole broadsheet.
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
  const table = code ? await db().table.findUnique({ where: { code }, include: { claims: true, epilogue: true } }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  const isGm = (await requestRole(req)) === "gm";
  const playerId = playerIdOf(req);
  const held = table.claims.filter((c) => playerId && c.playerId === playerId).map((c) => c.characterId);

  const current = () => {
    const ep = epilogueSchema.safeParse(table.epilogue?.data);
    const edits = tapestryEditsSchema.safeParse(table.epilogue?.tapestry);
    return { epilogue: ep.success ? ep.data : null, tapestry: edits.success ? edits.data : noEdits() };
  };
  const save = async (data: { epilogue?: unknown; tapestry?: unknown }) => {
    const now = current();
    const next = { data: (data.epilogue ?? now.epilogue ?? emptyEpilogue()) as Prisma.InputJsonValue, tapestry: (data.tapestry ?? now.tapestry) as Prisma.InputJsonValue };
    const row = await db().epilogue.upsert({ where: { tableId: table.id }, create: { tableId: table.id, ...next }, update: next });
    table.epilogue = row;
  };
  const reply = (status = 200) => res.status(status).json({ ...current(), canEdit: isGm ? "all" : held });

  if (req.method === "GET") return reply();

  if (req.method === "PUT") {
    if (!isGm) return res.status(403).json({ error: "Only the GM sets the front page" });
    const ep = epilogueSchema.safeParse(req.body?.epilogue);
    if (!ep.success) return res.status(400).json({ error: "That front page doesn't parse" });
    await save({ epilogue: ep.data });
    return reply();
  }

  if (req.body?.tapestry !== undefined) {
    if (!isGm) return res.status(403).json({ error: "Only the GM edits the tapestry" });
    const edits = tapestryEditsSchema.safeParse(req.body.tapestry);
    if (!edits.success) return res.status(400).json({ error: "Those edits don't parse" });
    await save({ tapestry: edits.data });
    return reply();
  }

  const body = playerEntryBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Which character, and what line?" });
  if (!isGm && !held.includes(body.data.characterId)) return res.status(403).json({ error: "You can only write your own character's line" });
  const ep = current().epilogue ?? emptyEpilogue();
  const entry = { ...ep.entries[body.data.characterId], ...body.data.entry };
  await save({ epilogue: { ...ep, entries: { ...ep.entries, [body.data.characterId]: entry } } });
  return reply();
}
