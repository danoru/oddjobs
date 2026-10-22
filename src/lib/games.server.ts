import { createHash } from "node:crypto";
import type { GetServerSidePropsContext } from "next";
import type { Prisma } from "@prisma/client";
import { isAdmin, type Viewer as Account } from "./accounts";
import { pageViewer, userSource } from "./auth";
import type { Actor, Viewer } from "./game";
import { asStatus, isOver, isSeating, userKey, type GameStatus, type GameSummary, type Person } from "./games";
import { readGuestPass, type GuestPass } from "./guestPass";
import { checkDoc } from "./oneShotCheck";
import { db } from "./prisma";
import type { OneShotWithCast } from "./schema";
import { cookieHeaderOf, readClaims, type Claims } from "./session";
import { tableOneShot } from "./source";
import { coerceDoc } from "./store/doc";
import { storeKind } from "./store/kind";
import { isUniqueViolation } from "./tables.server";
import { makeTableCode, normalizeCode } from "./tables";

/**
 * Games on the server (phase 11): who's asking at a game and what they may
 * do, the content a game plays, and the bookkeeping around it (spoilers,
 * guest seats). Every table API goes through `gameAccess`: the GM's side of
 * a game belongs to its GM and co-GMs (admins may look, not act), and a
 * player is who their session or guest pass says, never a header.
 */

type NodeReq = Parameters<typeof cookieHeaderOf>[0];

/** What every access check needs from a game row. */
export type GameRow = { id: string; code: string; oneshot: string; gmId: string | null; status: string; coGms: { userId: string }[] };

/** Include this in a game query so `gameAccess` can tell who runs it. */
export const CO_GMS = { coGms: { select: { userId: true } } } as const;

export interface GameAccess {
  /** May see the GM's side: the GM, a co-GM, or an admin looking in. */
  view: boolean;
  /** May act as the GM: the GM or a co-GM (an admin only at a game from before accounts). */
  act: boolean;
  /** The asker's key as a player here (`u-<id>` for an account, a guest's own key), or null. */
  key: string | null;
  /** The name they sit down under. */
  name: string | null;
  userId: string | null;
  /** The account, when it was checked against the database (only for the GM's side). */
  account: Account | null;
}

const runs = (game: Pick<GameRow, "gmId" | "coGms">, userId: string) => game.gmId === userId || game.coGms.some((c) => c.userId === userId);

/**
 * Who is asking at this game. A player's session is taken at its word (the
 * phones poll every couple of seconds), but anyone who would see the GM's
 * side is checked against the database first, as admins always were.
 */
export async function gameAccess(req: NodeReq, game: Pick<GameRow, "code" | "gmId" | "coGms">): Promise<GameAccess> {
  const cookie = cookieHeaderOf(req);
  const claims = await readClaims(cookie);
  if (claims) return accessFor(claims, game);
  const pass = await readGuestPass(cookie);
  if (pass && pass.code === game.code) return { view: false, act: false, key: pass.key, name: pass.name, userId: null, account: null };
  return { view: false, act: false, key: null, name: null, userId: null, account: null };
}

async function accessFor(claims: Claims, game: Pick<GameRow, "gmId" | "coGms">): Promise<GameAccess> {
  const base = { key: userKey(claims.sub), name: claims.name ?? claims.username, userId: claims.sub };
  if (!runs(game, claims.sub) && claims.role !== "admin") return { ...base, view: false, act: false, account: null };
  const account = await userSource.viewer(claims.sub, claims.tv);
  if (!account) return { view: false, act: false, key: null, name: null, userId: null, account: null };
  const act = runs(game, account.id) || (game.gmId === null && isAdmin(account));
  return { ...base, name: account.displayName, view: act || isAdmin(account), act, account };
}

/** `?as=table` is the TV (even in the GM's browser), `?as=player` the phone. Anyone can ask to see less. */
export function viewerOf(access: GameAccess, as: unknown): Viewer {
  if (as === "table") return { role: "table" };
  if (access.view && as !== "player") return { role: "gm" };
  return access.key ? { role: "player", playerId: access.key } : { role: "table" };
}

/** Who acts, or why they can't. An admin looking in from the GM's side may only watch. */
export function actorOf(access: GameAccess, as: unknown, status: GameStatus): { actor: Actor } | { status: number; error: string } {
  if (as === "table") return { status: 403, error: "The TV only watches" };
  if (isOver(status)) return { status: 409, error: "This game is over" };
  if (access.view && as !== "player") {
    return access.act ? { actor: { role: "gm" } } : { status: 403, error: "Only this game's GM can do that" };
  }
  if (!access.key) return { status: 401, error: "Join the table first" };
  if (!isSeating(status)) return { status: 409, error: "The GM hasn't opened the seats yet" };
  return { actor: { role: "player", playerId: access.key } };
}

/**
 * A game by its join code, with whatever else the route needs. Not its
 * pinned content: the phones poll every couple of seconds, and
 * `gameOneShot` reads that once per server instance.
 */
export function findGame<I extends Prisma.GameInclude>(code: string, include?: I) {
  return db().game.findUnique({ where: { code }, omit: { content: true }, include: { ...CO_GMS, ...(include ?? {}) } as I & typeof CO_GMS });
}

// ---- Content -----------------------------------------------------------------

export const hashDoc = (doc: unknown) => createHash("sha256").update(JSON.stringify(doc)).digest("hex");

/**
 * What a new game pins: the published document and its hash, from the
 * database store. Files only change with a deploy, so a game on the files
 * store plays them as they are (null).
 */
export async function pinnable(slug: string): Promise<{ content: Prisma.InputJsonValue; hash: string } | null> {
  if (storeKind() === "files") return null;
  const row = await db().oneShot.findUnique({ where: { slug }, select: { published: true } });
  if (row?.published == null) return null;
  return { content: row.published as Prisma.InputJsonValue, hash: hashDoc(row.published) };
}

const pinnedMemo = new Map<string, Promise<OneShotWithCast>>();
const PINNED_KEEP = 64;

/**
 * The one-shot a game plays: its pinned copy, read and parsed once per
 * server instance (it never changes under that pin), or what's published
 * now for a game with no pin (`pinnedAt` null).
 */
export function gameOneShot(game: { id: string; oneshot: string; pinnedAt: Date | null; content?: unknown }): Promise<OneShotWithCast> {
  if (!game.pinnedAt) return tableOneShot(game.oneshot);
  const key = `${game.id}:${game.pinnedAt.getTime()}`;
  const hit = pinnedMemo.get(key);
  if (hit) return hit;
  const os = (async () => {
    const content = game.content ?? (await db().game.findUnique({ where: { id: game.id }, select: { content: true } }))?.content;
    if (content == null) return tableOneShot(game.oneshot);
    const { parsed, issues } = checkDoc(coerceDoc(content), null);
    if (parsed) return parsed;
    console.warn(`[games] ${game.id}'s pinned copy of ${game.oneshot} fails its checks (${issues[0]?.message ?? "?"}); playing what's published`);
    return tableOneShot(game.oneshot);
  })();
  pinnedMemo.set(key, os);
  os.catch(() => pinnedMemo.delete(key));
  if (pinnedMemo.size > PINNED_KEEP) pinnedMemo.delete(pinnedMemo.keys().next().value!);
  return os;
}

// ---- The GM's pages ----------------------------------------------------------------

type PageCtx = Pick<GetServerSidePropsContext, "req" | "resolvedUrl" | "query">;

/**
 * For getServerSideProps on the GM's pages of one game (`/<slug>/gm`, the
 * kit, the box): `?game=<code>`, and the asker must run it or be an admin
 * looking in. No code: the asker's newest game of this one-shot, or the job
 * page to run one. Someone who only plays there goes to the player's side.
 */
export async function gmPage(
  ctx: PageCtx,
  slug: string,
): Promise<{ game: GameRow & { pinnedAt: Date | null }; os: OneShotWithCast; access: GameAccess } | { redirect: { destination: string; permanent: false } } | { notFound: true }> {
  const gate = await pageViewer(ctx, "member");
  if (gate.redirect) return { redirect: gate.redirect };
  const path = ctx.resolvedUrl.split("?")[0];
  const code = normalizeCode(ctx.query.game);
  if (!code) {
    const runs = { OR: [{ gmId: gate.viewer.id }, { coGms: { some: { userId: gate.viewer.id } } }] };
    const newest =
      (await db().game.findFirst({ where: { oneshot: slug, status: { notIn: ["finished", "epilogued"] }, ...runs }, orderBy: { createdAt: "desc" }, select: { code: true } })) ??
      (await db().game.findFirst({ where: { oneshot: slug, ...runs }, orderBy: { createdAt: "desc" }, select: { code: true } }));
    return { redirect: { destination: newest ? `${path}?game=${newest.code}` : `/${slug}?run=1`, permanent: false } };
  }
  const game = await findGame(code);
  if (!game || game.oneshot !== slug) return { notFound: true };
  const access = await gameAccess(ctx.req, game);
  if (!access.view) return { redirect: { destination: `/${slug}?table=${code}`, permanent: false } };
  try {
    return { game, os: await gameOneShot(game), access };
  } catch {
    return { notFound: true };
  }
}

// ---- Making games --------------------------------------------------------------

/** Running a one-shot means knowing its secrets, for good. */
export async function markSpoiled(userId: string, oneshot: string) {
  await db().spoiler.upsert({ where: { userId_oneshot: { userId, oneshot } }, create: { userId, oneshot }, update: {} });
}

/** A new game of a published one-shot with `gm` running it, under a fresh code. Null if no code was free. */
export async function createGame(gm: Account, oneshot: string, opts: { scheduledAt?: string | null; seats?: number | null } = {}) {
  const pin = await pinnable(oneshot);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const game = await db().game.create({
        data: {
          code: makeTableCode(),
          oneshot,
          gmId: gm.id,
          // Nothing to wait for without a date: the seats open at once.
          status: opts.scheduledAt ? "planned" : "open",
          scheduledAt: opts.scheduledAt ? new Date(opts.scheduledAt) : null,
          seats: opts.seats ?? null,
          ...(pin ? { content: pin.content, contentHash: pin.hash, pinnedAt: new Date() } : {}),
        },
        include: CO_GMS,
      });
      await markSpoiled(gm.id, oneshot);
      return game;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return null;
}

// ---- Summaries -------------------------------------------------------------------

type UserBit = { username: string; displayName: string };
export const PERSON = { select: { username: true, displayName: true } } as const;
export const SUMMARY_INCLUDE = {
  gm: PERSON,
  coGms: { select: { userId: true, user: PERSON } },
  claims: { select: { characterId: true, playerId: true } },
} as const;

type SummaryRow = Omit<GameRow, "coGms"> & {
  scheduledAt: Date | null;
  seats: number | null;
  createdAt: Date;
  finishedAt: Date | null;
  gm: UserBit | null;
  coGms: { userId: string; user: UserBit }[];
  claims: { characterId: string; playerId: string }[];
};

const person = (u: UserBit): Person => ({ username: u.username, displayName: u.displayName });

export function summarize(g: SummaryRow, title: string, viewer: Pick<Account, "id" | "role"> | null): GameSummary {
  const key = viewer ? userKey(viewer.id) : null;
  const yours = g.claims.filter((c) => c.playerId === key).map((c) => c.characterId);
  const you: GameSummary["you"] = !viewer
    ? null
    : g.gmId === viewer.id
      ? "gm"
      : g.coGms.some((c) => c.userId === viewer.id)
        ? "cogm"
        : yours.length
          ? "player"
          : isAdmin(viewer)
            ? "admin"
            : null;
  return {
    code: g.code,
    oneshot: g.oneshot,
    title,
    status: asStatus(g.status),
    scheduledAt: g.scheduledAt?.toISOString() ?? null,
    seats: g.seats,
    gm: g.gm ? person(g.gm) : null,
    coGms: g.coGms.map((c) => person(c.user)),
    you,
    yours,
    taken: g.claims.length,
    createdAt: g.createdAt.toISOString(),
    finishedAt: g.finishedAt?.toISOString() ?? null,
  };
}

/** Games the viewer runs, co-runs or holds a seat in (an admin: `all`, every game), newest first. */
export async function listGames(viewer: Account, opts: { oneshot?: string; all?: boolean } = {}): Promise<GameSummary[]> {
  const mine: Prisma.GameWhereInput = { OR: [{ gmId: viewer.id }, { coGms: { some: { userId: viewer.id } } }, { claims: { some: { userId: viewer.id } } }] };
  const where: Prisma.GameWhereInput = { ...(opts.oneshot ? { oneshot: opts.oneshot } : {}), ...(opts.all && isAdmin(viewer) ? {} : mine) };
  const rows = await db().game.findMany({ where, include: SUMMARY_INCLUDE, omit: { content: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const titles = new Map<string, string>();
  for (const r of rows) {
    if (!titles.has(r.oneshot)) titles.set(r.oneshot, await tableOneShot(r.oneshot).then((os) => os.title, () => r.oneshot));
  }
  return rows.map((r) => summarize(r, titles.get(r.oneshot) ?? r.oneshot, viewer));
}

// ---- Guest seats -------------------------------------------------------------------

/**
 * A guest's seats at a game become an account's: the claims, flashbacks,
 * recordings, everything in the event log and the game state move from the
 * guest's key to the account's, so the history goes with them. If the
 * account already had a recording there, it keeps its own.
 */
export async function adoptGuest(gameId: string, guestKey: string, user: { id: string; displayName: string }): Promise<number> {
  if (!/^[0-9a-f]{32}$/.test(guestKey)) return 0;
  const key = userKey(user.id);
  return db().$transaction(async (tx) => {
    const { count } = await tx.claim.updateMany({ where: { gameId, playerId: guestKey }, data: { playerId: key, userId: user.id, playerName: user.displayName } });
    await tx.flashback.updateMany({ where: { gameId, playerId: guestKey }, data: { playerId: key } });
    const mine = await tx.recording.findUnique({ where: { gameId_playerId: { gameId, playerId: key } } });
    if (mine) await tx.recording.deleteMany({ where: { gameId, playerId: guestKey } });
    else await tx.recording.updateMany({ where: { gameId, playerId: guestKey }, data: { playerId: key } });
    await tx.tableEvent.updateMany({ where: { gameId, byPlayer: guestKey }, data: { byPlayer: key } });
    await tx.tableEvent.updateMany({ where: { gameId, toPlayer: guestKey }, data: { toPlayer: key } });
    // The key inside the JSON too (a night's log is small). Keys are hex, so a plain swap can't touch anything else.
    const swap = (json: unknown) => JSON.parse(JSON.stringify(json).split(guestKey).join(key)) as Prisma.InputJsonValue;
    for (const e of await tx.tableEvent.findMany({ where: { gameId }, select: { id: true, data: true } })) {
      if (JSON.stringify(e.data).includes(guestKey)) await tx.tableEvent.update({ where: { id: e.id }, data: { data: swap(e.data) } });
    }
    const state = await tx.gameState.findUnique({ where: { gameId } });
    if (state && JSON.stringify(state.state).includes(guestKey)) {
      await tx.gameState.update({ where: { id: state.id }, data: { state: swap(state.state), version: { increment: 1 } } });
    }
    return count;
  });
}

/** A guest pass's seats, for an account that has just signed in or joined with it. */
export async function adoptGuestPass(pass: GuestPass | null, user: { id: string; displayName: string }): Promise<number> {
  if (!pass) return 0;
  const game = await db().game.findUnique({ where: { code: pass.code }, select: { id: true } });
  return game ? adoptGuest(game.id, pass.key, user) : 0;
}
