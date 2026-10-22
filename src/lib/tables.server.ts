import { createHash } from "node:crypto";
import type { Prisma, TableEvent } from "@prisma/client";
import type { LiveRow, NewRow, Person } from "./live";
import type { OneShotWithCast } from "./schema";
import { db } from "./prisma";
import { asStatus } from "./games";
import type { TableState } from "./tables";

/** Include this in a game query for `stateOf`. */
export const CLAIMS_IN_ORDER = { claims: { orderBy: { claimedAt: "asc" } } } as const;

/** A game's seats as one player (by their key at it) sees them, or null if there's no such game. */
export async function tableState(code: string, key: string | null): Promise<TableState | null> {
  const game = await db().game.findUnique({ where: { code }, include: CLAIMS_IN_ORDER });
  return game ? stateOf(game, key) : null;
}

type StateRow = { code: string; oneshot: string; status: string; seats: number | null; claims: { characterId: string; playerName: string; playerId: string; userId: string | null; claimedAt: Date }[] };

export function stateOf(game: StateRow, key: string | null): TableState {
  return {
    code: game.code,
    oneshot: game.oneshot,
    status: asStatus(game.status),
    seats: game.seats,
    claims: game.claims.map((c) => ({
      characterId: c.characterId,
      name: c.playerName,
      mine: key !== null && c.playerId === key,
      guest: c.userId === null,
      claimedAt: c.claimedAt.toISOString(),
    })),
  };
}

/** Prisma's unique-constraint error: someone got there first. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * A player's handle at one game: opaque and stable, so phones and the TV can
 * name each other without ever seeing a key (an account id, or a guest's
 * secret).
 */
export function handleFor(gameId: string, playerId: string): string {
  return createHash("sha256").update(`${gameId}:${playerId}`).digest("hex").slice(0, 12);
}

type ClaimRow = { playerId: string; playerName: string; characterId: string; claimedAt: Date };

/**
 * Everyone at a game: whoever tore a poster, plus (Ten Candles) whoever took
 * a seat in the game's state. One person per key; their first poster names them.
 */
export function peopleAt(
  game: { id: string; createdAt?: Date; claims: ClaimRow[]; state?: { state: unknown } | null },
  os: Pick<OneShotWithCast, "system" | "cast">,
): Person[] {
  const byId = new Map<string, Person>();
  const charName = (id: string | null) => (id ? (os.cast.find((c) => c.id === id)?.name ?? null) : null);
  for (const c of [...game.claims].sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime())) {
    if (byId.has(c.playerId)) continue;
    byId.set(c.playerId, {
      playerId: c.playerId,
      handle: handleFor(game.id, c.playerId),
      name: c.playerName,
      characterId: c.characterId,
      character: charName(c.characterId),
      since: c.claimedAt.toISOString(),
    });
  }
  if (os.system === "tencandles" && game.state) {
    const players = (game.state.state as { players?: { playerId: string; name: string; characterId: string | null; concept: { name: string } | null }[] }).players ?? [];
    for (const p of players) {
      const known = byId.get(p.playerId);
      const character = p.concept?.name ?? charName(p.characterId);
      if (known) byId.set(p.playerId, { ...known, character: character ?? known.character });
      else
        byId.set(p.playerId, {
          playerId: p.playerId,
          handle: handleFor(game.id, p.playerId),
          name: p.name,
          characterId: p.characterId,
          character,
          // A seat has no claim time; the spotlight's clock starts when the game opened.
          since: game.createdAt?.toISOString() ?? null,
        });
    }
  }
  return [...byId.values()];
}

export const toLiveRow = (e: TableEvent): LiveRow => ({
  id: e.id,
  kind: e.kind as LiveRow["kind"],
  byPlayer: e.byPlayer,
  toPlayer: e.toPlayer,
  hidden: e.hidden,
  data: e.data,
  createdAt: e.createdAt.toISOString(),
});

/** Append rows to a game's event log, in order. */
export async function appendEvents(gameId: string, rows: NewRow[]): Promise<LiveRow[]> {
  const out: LiveRow[] = [];
  for (const r of rows) {
    const e = await db().tableEvent.create({
      data: { gameId, kind: r.kind, byPlayer: r.byPlayer, toPlayer: r.toPlayer, hidden: r.hidden, data: r.data as Prisma.InputJsonValue },
    });
    out.push(toLiveRow(e));
  }
  return out;
}

/** The act card a game's log shows now, or -1. */
export async function currentActOf(gameId: string): Promise<number> {
  const acts = await db().tableEvent.findMany({ where: { gameId, kind: "act" }, orderBy: { id: "desc" }, take: 20 });
  for (const a of acts) {
    const index = (a.data as { index: number | null }).index;
    if (index !== null) return index;
  }
  return -1;
}
