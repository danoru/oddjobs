import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { loadOneShot } from "@/lib/content";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { playerIdOf } from "@/lib/tables.server";
import { deliverBody, letterText, resolveLetter, type LetterView } from "@/lib/letters";

/**
 * Sealed letters at a table.
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
  const table = code
    ? await db().table.findUnique({ where: { code }, include: { claims: true, deliveries: true } })
    : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });

  let os;
  try {
    os = loadOneShot(table.oneshot);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  const isGm = (await requestRole(req)) === "gm";
  const playerId = playerIdOf(req);
  const present = table.claims.map((c) => c.characterId);
  const held = new Set(table.claims.filter((c) => playerId && c.playerId === playerId).map((c) => c.characterId));

  const view = (d: (typeof table.deliveries)[number]): LetterView | null => {
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
    const deliveries = await db().delivery.findMany({ where: { tableId: table.id }, orderBy: { deliveredAt: "asc" } });
    return deliveries
      .filter((d) => isGm || held.has(d.characterId))
      .map(view)
      .filter((v): v is LetterView => v !== null);
  };

  if (req.method === "GET") return res.status(200).json({ letters: await visible() });

  if (req.method === "PATCH") {
    const body = deliverBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Which letter?" });
    const d = table.deliveries.find((x) => x.letterId === body.data.letterId);
    if (!d || !held.has(d.characterId)) return res.status(403).json({ error: "That letter isn't yours to open" });
    if (!d.openedAt) await db().delivery.update({ where: { id: d.id }, data: { openedAt: new Date() } });
    return res.status(200).json({ letters: await visible() });
  }

  if (!isGm) return res.status(403).json({ error: "Only the GM hands out letters" });

  if (req.method === "POST") {
    const body = deliverBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Which letter?" });
    const letter = resolveLetter(os, body.data.letterId, present);
    if (!letter) return res.status(409).json({ error: "Nobody at the table can receive that letter right now" });
    await db().delivery.upsert({
      where: { tableId_letterId: { tableId: table.id, letterId: letter.id } },
      create: { tableId: table.id, letterId: letter.id, characterId: letter.to },
      update: {},
    });
    return res.status(201).json({ letters: await visible() });
  }

  const letterId = typeof req.query.letterId === "string" ? req.query.letterId : "";
  await db().delivery.deleteMany({ where: { tableId: table.id, letterId } });
  return res.status(200).json({ letters: await visible() });
}
