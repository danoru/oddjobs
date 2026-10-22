import type { NextApiRequest, NextApiResponse } from "next";
import { apiViewer } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { isOver, newGameBody, userKey, type JobRecord } from "@/lib/games";
import { createGame, listGames, SUMMARY_INCLUDE, summarize } from "@/lib/games.server";
import { publishedOneShot } from "@/lib/source";

/**
 * Games, for the signed-in.
 * POST { oneshot, scheduledAt?, seats? } — run this job: a new game of any
 *   published one-shot, with you as its GM.
 * GET — your games: the ones you run or co-run and the ones you hold a seat
 *   in, newest first. `?all=1` (admins) every game.
 * GET ?oneshot=<slug> — that job's record for you: whether you know its
 *   secrets, which members have already played it, and your games of it.
 * GET ?known=1 — the one-shots you know or have played, for the board's
 *   "fresh to me" filter.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const viewer = await apiViewer(req, res, "member");
  if (!viewer) return;

  if (req.method === "POST") {
    const body = newGameBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Which one-shot, and when?" });
    const os = await publishedOneShot(body.data.oneshot);
    if (!os) return res.status(404).json({ error: "That one-shot isn't on the board" });
    const game = await createGame(viewer, os.slug, body.data);
    if (!game) return res.status(503).json({ error: "Couldn't find a free table code; try again" });
    const row = await db().game.findUniqueOrThrow({ where: { id: game.id }, include: SUMMARY_INCLUDE });
    return res.status(201).json(summarize(row, os.title, viewer));
  }

  if (req.query.known) {
    const [spoilers, seats] = await Promise.all([
      db().spoiler.findMany({ where: { userId: viewer.id }, select: { oneshot: true } }),
      db().game.findMany({ where: { claims: { some: { userId: viewer.id } } }, select: { oneshot: true }, distinct: ["oneshot"] }),
    ]);
    return res.status(200).json({ known: [...new Set([...spoilers, ...seats].map((r) => r.oneshot))].sort() });
  }

  const slug = typeof req.query.oneshot === "string" ? req.query.oneshot : null;
  const games = await listGames(viewer, slug ? { oneshot: slug } : { all: !!req.query.all });
  if (!slug) return res.status(200).json({ games });

  const [spoiled, gms, seats] = await Promise.all([
    db().spoiler.findUnique({ where: { userId_oneshot: { userId: viewer.id, oneshot: slug } } }),
    db().spoiler.findMany({ where: { oneshot: slug, userId: { not: viewer.id } }, include: { user: { select: { displayName: true, disabledAt: true } } } }),
    db().claim.findMany({
      where: { game: { oneshot: slug, status: { in: ["finished", "epilogued"] } }, userId: { not: null }, NOT: { playerId: userKey(viewer.id) } },
      select: { user: { select: { id: true, displayName: true, disabledAt: true } } },
    }),
  ]);
  const played: JobRecord["played"] = [];
  const seen = new Set<string>();
  const add = (u: { id: string; displayName: string; disabledAt: Date | null } | null, as: "gm" | "player") => {
    if (!u || u.disabledAt || seen.has(u.id)) return;
    seen.add(u.id);
    played.push({ displayName: u.displayName, as });
  };
  for (const s of gms) add({ id: s.userId, ...s.user }, "gm");
  for (const c of seats) add(c.user, "player");
  const record: JobRecord = { youKnow: !!spoiled, played, games: games.filter((g) => !isOver(g.status)) };
  return res.status(200).json(record);
}
