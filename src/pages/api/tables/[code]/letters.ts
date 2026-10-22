import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/prisma";
import { asStatus, isOver } from "@/lib/games";
import { findGame, gameAccess, gameOneShot } from "@/lib/games.server";
import { normalizeCode } from "@/lib/tables";
import { deliverBody, letterText, resolveLetter, type LetterView } from "@/lib/letters";

/**
 * Sealed letters at a game.
 * GET — the GM sees every delivery (no text needed, they have it); a player
 *       sees letters addressed to characters they hold, with the text.
 * POST { letterId } — GM delivers a letter (content letter or inherited beat).
 * PATCH { letterId } — the recipient breaks the seal.
 * DELETE ?letterId= — GM takes a letter back.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const game = code ? await findGame(code, { claims: true, deliveries: true }) : null;
  if (!game) return res.status(404).json({ error: "No table with that code" });

  let os;
  try {
    os = await gameOneShot(game);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  const access = await gameAccess(req, game);
  const present = game.claims.map((c) => c.characterId);
  const held = new Set(game.claims.filter((c) => access.key && c.playerId === access.key).map((c) => c.characterId));

  const view = (d: (typeof game.deliveries)[number]): LetterView | null => {
    const t = letterText(os, d.letterId);
    if (!t) return null;
    return {
      id: d.letterId,
      to: d.characterId,
      title: t.title,
      deliveredAt: d.deliveredAt.toISOString(),
      openedAt: d.openedAt?.toISOString() ?? null,
      ...(held.has(d.characterId) ? { text: t.text } : {}),
    };
  };
  const visible = async () => {
    const deliveries = await db().delivery.findMany({ where: { gameId: game.id }, orderBy: { deliveredAt: "asc" } });
    return deliveries
      .filter((d) => access.view || held.has(d.characterId))
      .map(view)
      .filter((v): v is LetterView => v !== null);
  };

  if (req.method === "GET") return res.status(200).json({ letters: await visible() });

  if (req.method === "PATCH") {
    const body = deliverBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Which letter?" });
    const d = game.deliveries.find((x) => x.letterId === body.data.letterId);
    if (!d || !held.has(d.characterId)) return res.status(403).json({ error: "That letter isn't yours to open" });
    if (!d.openedAt) await db().delivery.update({ where: { id: d.id }, data: { openedAt: new Date() } });
    return res.status(200).json({ letters: await visible() });
  }

  if (!access.act) return res.status(403).json({ error: access.view ? "Only this game's GM can do that" : "Only the GM hands out letters" });
  if (isOver(asStatus(game.status))) return res.status(409).json({ error: "This game is over" });

  if (req.method === "POST") {
    const body = deliverBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Which letter?" });
    const letter = resolveLetter(os, body.data.letterId, present);
    if (!letter) return res.status(409).json({ error: "Nobody at the table can receive that letter right now" });
    await db().delivery.upsert({
      where: { gameId_letterId: { gameId: game.id, letterId: letter.id } },
      create: { gameId: game.id, letterId: letter.id, characterId: letter.to },
      update: {},
    });
    return res.status(201).json({ letters: await visible() });
  }

  const letterId = typeof req.query.letterId === "string" ? req.query.letterId : "";
  await db().delivery.deleteMany({ where: { gameId: game.id, letterId } });
  return res.status(200).json({ letters: await visible() });
}
