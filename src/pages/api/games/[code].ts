import type { NextApiRequest, NextApiResponse } from "next";
import { apiViewer } from "@/lib/auth";
import { canMakeInvites, isAdmin, usernameKey } from "@/lib/accounts";
import { db } from "@/lib/prisma";
import { asStatus, canMove, canRepin, gamePatchBody, isOver, type GameDetail } from "@/lib/games";
import { gameAccess, markSpoiled, PERSON, pinnable, SUMMARY_INCLUDE, summarize } from "@/lib/games.server";
import { accounts, AccountError } from "@/lib/users.server";
import { normalizeCode } from "@/lib/tables";
import { tableOneShot } from "@/lib/source";

/**
 * One game, for its GM's controls.
 * GET — the game as the asker stands at it. Its GM and co-GMs (and an admin
 *   looking in) also get the members they could hand it to, its guest seats
 *   and whether a newer version of the one-shot has been published.
 * PATCH { op, … } — the GM's controls (src/lib/games.ts, gamePatchBody):
 *   status, schedule and seats, update to the latest version (before it goes
 *   live), and, for the GM alone, handing the game on and choosing co-GMs.
 *   A co-GM can make an invite for a guest seat too, if they may invite.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const viewer = await apiViewer(req, res, "member");
  if (!viewer) return;
  const code = normalizeCode(req.query.code);
  const game = code ? await db().game.findUnique({ where: { code }, include: { ...SUMMARY_INCLUDE, claims: true } }) : null;
  if (!game) return res.status(404).json({ error: "No game with that code" });
  const access = await gameAccess(req, { code: game.code, gmId: game.gmId, coGms: game.coGms });
  const title = await tableOneShot(game.oneshot).then((os) => os.title, () => game.oneshot);

  const detail = async (): Promise<GameDetail> => {
    const g = await db().game.findUniqueOrThrow({ where: { id: game.id }, include: { ...SUMMARY_INCLUDE, claims: true } });
    const status = asStatus(g.status);
    const latest = g.contentHash && canRepin(status) ? await pinnable(g.oneshot) : null;
    const members = await db().user.findMany({ where: { disabledAt: null, id: { not: viewer.id } }, select: PERSON.select, orderBy: { displayName: "asc" } });
    return {
      ...summarize(g, title, viewer),
      pinnedAt: g.pinnedAt?.toISOString() ?? null,
      newer: !!latest && latest.hash !== g.contentHash,
      members,
      guests: g.claims.filter((c) => c.userId === null).map((c) => ({ characterId: c.characterId, name: c.playerName })),
    };
  };

  if (req.method === "GET") return res.status(200).json(access.view ? await detail() : summarize(game, title, viewer));

  if (!access.act) return res.status(403).json({ error: access.view ? "Only this game's GM can do that" : "Only the GM runs the game" });
  const body = gamePatchBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "That's not something a GM can do here" });
  const op = body.data;
  const status = asStatus(game.status);
  // Handing the game on and choosing who runs it with you are the GM's alone (an admin's, at a game from before accounts).
  const isGm = game.gmId === viewer.id || (game.gmId === null && isAdmin(viewer));
  const member = async (username: string) =>
    db().user.findFirst({ where: { usernameLower: usernameKey(username), disabledAt: null }, select: { id: true, displayName: true } });

  switch (op.op) {
    case "status": {
      if (!canMove(status, op.status)) return res.status(409).json({ error: `A ${status} game can't go to ${op.status}` });
      const now = new Date();
      await db().game.update({
        where: { id: game.id },
        data: {
          status: op.status,
          ...(op.status === "live" ? { startedAt: game.startedAt ?? now, finishedAt: null } : {}),
          ...(op.status === "finished" ? { finishedAt: now } : {}),
        },
      });
      break;
    }
    case "schedule": {
      if (isOver(status)) return res.status(409).json({ error: "This game is over" });
      if (op.seats !== null && op.seats < game.claims.length) return res.status(409).json({ error: `${game.claims.length} seats are already taken` });
      await db().game.update({ where: { id: game.id }, data: { scheduledAt: op.scheduledAt ? new Date(op.scheduledAt) : null, seats: op.seats } });
      break;
    }
    case "repin": {
      if (!canRepin(status)) return res.status(409).json({ error: "It's already being played: it keeps the version it started with" });
      const pin = await pinnable(game.oneshot);
      if (!pin) return res.status(409).json({ error: "This game plays whatever is published" });
      await db().game.update({ where: { id: game.id }, data: { content: pin.content, contentHash: pin.hash, pinnedAt: new Date() } });
      break;
    }
    case "transfer": {
      if (!isGm) return res.status(403).json({ error: "Only the GM can hand the game on" });
      const to = await member(op.to);
      if (!to) return res.status(404).json({ error: "Nobody by that name on the board" });
      if (to.id === game.gmId) return res.status(409).json({ error: "They already run it" });
      await db().$transaction([
        db().gameCoGm.deleteMany({ where: { gameId: game.id, userId: to.id } }),
        db().game.update({ where: { id: game.id }, data: { gmId: to.id } }),
        ...(op.stay && game.gmId ? [db().gameCoGm.upsert({ where: { gameId_userId: { gameId: game.id, userId: game.gmId } }, create: { gameId: game.id, userId: game.gmId }, update: {} })] : []),
      ]);
      await markSpoiled(to.id, game.oneshot);
      break;
    }
    case "addCoGm": {
      if (!isGm) return res.status(403).json({ error: "Only the GM chooses who runs it with them" });
      const to = await member(op.username);
      if (!to) return res.status(404).json({ error: "Nobody by that name on the board" });
      if (to.id === game.gmId) return res.status(409).json({ error: "They already run it" });
      await db().gameCoGm.upsert({ where: { gameId_userId: { gameId: game.id, userId: to.id } }, create: { gameId: game.id, userId: to.id }, update: {} });
      await markSpoiled(to.id, game.oneshot);
      break;
    }
    case "removeCoGm": {
      if (!isGm) return res.status(403).json({ error: "Only the GM chooses who runs it with them" });
      const to = await member(op.username);
      if (to) await db().gameCoGm.deleteMany({ where: { gameId: game.id, userId: to.id } });
      break;
    }
    case "inviteGuest": {
      const seat = game.claims.find((c) => c.characterId === op.characterId && c.userId === null);
      if (!seat) return res.status(404).json({ error: "That seat isn't a guest's" });
      if (!access.account || !canMakeInvites(access.account)) return res.status(403).json({ error: "Only members who can invite can do that; ask an admin" });
      try {
        const inv = await accounts.makeInvite(access.account, { note: `${seat.playerName}'s seat` }, { gameId: game.id, key: seat.playerId });
        return res.status(201).json({ ...(await detail()), invite: inv });
      } catch (e) {
        if (e instanceof AccountError) return res.status(e.status).json({ error: e.message });
        throw e;
      }
    }
  }
  return res.status(200).json(await detail());
}
