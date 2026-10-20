import { createHash } from "node:crypto";
import type { NextApiRequest } from "next";
import type { Prisma, TableEvent } from "@prisma/client";
import type { LiveRow, NewRow, Person } from "./live";
import type { OneShotWithCast } from "./schema";
import { db } from "./prisma";
import { PLAYER_HEADER, playerIdSchema, type TableState } from "./tables";

/** The asking browser's player id, if it sent a well-formed one. */
export function playerIdOf(req: NextApiRequest): string | null {
  const parsed = playerIdSchema.safeParse(req.headers[PLAYER_HEADER]);
  return parsed.success ? parsed.data : null;
}

/** A table and its claims as one player sees them, or null if there's no such table. */
export async function tableState(code: string, playerId: string | null): Promise<TableState | null> {
  const table = await db().table.findUnique({
    where: { code },
    include: { claims: { orderBy: { claimedAt: "asc" } } },
  });
  if (!table) return null;
  return {
    code: table.code,
    oneshot: table.oneshot,
    claims: table.claims.map((c) => ({
      characterId: c.characterId,
      name: c.playerName,
      mine: playerId !== null && c.playerId === playerId,
      claimedAt: c.claimedAt.toISOString(),
    })),
  };
}

/** Prisma's unique-constraint error: someone got there first. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * A player's handle at one table: opaque and stable, so phones and the TV can
 * name each other without ever seeing a browser id (which would let them act
 * as that player).
 */
export function handleFor(tableId: string, playerId: string): string {
  return createHash("sha256").update(`${tableId}:${playerId}`).digest("hex").slice(0, 12);
}

type ClaimRow = { playerId: string; playerName: string; characterId: string; claimedAt: Date };

/**
 * Everyone at a table: whoever tore a poster, plus (Ten Candles) whoever took
 * a seat in the game. One person per browser; their first poster names them.
 */
export function peopleAt(
  table: { id: string; createdAt?: Date; claims: ClaimRow[]; game?: { state: unknown } | null },
  os: Pick<OneShotWithCast, "system" | "cast">,
): Person[] {
  const byId = new Map<string, Person>();
  const charName = (id: string | null) => (id ? (os.cast.find((c) => c.id === id)?.name ?? null) : null);
  for (const c of [...table.claims].sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime())) {
    if (byId.has(c.playerId)) continue;
    byId.set(c.playerId, {
      playerId: c.playerId,
      handle: handleFor(table.id, c.playerId),
      name: c.playerName,
      characterId: c.characterId,
      character: charName(c.characterId),
      since: c.claimedAt.toISOString(),
    });
  }
  if (os.system === "tencandles" && table.game) {
    const players = (table.game.state as { players?: { playerId: string; name: string; characterId: string | null; concept: { name: string } | null }[] }).players ?? [];
    for (const p of players) {
      const known = byId.get(p.playerId);
      const character = p.concept?.name ?? charName(p.characterId);
      if (known) byId.set(p.playerId, { ...known, character: character ?? known.character });
      else
        byId.set(p.playerId, {
          playerId: p.playerId,
          handle: handleFor(table.id, p.playerId),
          name: p.name,
          characterId: p.characterId,
          character,
          // A seat has no claim time; the spotlight's clock starts when the table opened.
          since: table.createdAt?.toISOString() ?? null,
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

/** Append rows to a table's event log, in order. */
export async function appendEvents(tableId: string, rows: NewRow[]): Promise<LiveRow[]> {
  const out: LiveRow[] = [];
  for (const r of rows) {
    const e = await db().tableEvent.create({
      data: { tableId, kind: r.kind, byPlayer: r.byPlayer, toPlayer: r.toPlayer, hidden: r.hidden, data: r.data as Prisma.InputJsonValue },
    });
    out.push(toLiveRow(e));
  }
  return out;
}

/** The act card a table's log shows now, or -1. */
export async function currentActOf(tableId: string): Promise<number> {
  const acts = await db().tableEvent.findMany({ where: { tableId, kind: "act" }, orderBy: { id: "desc" }, take: 20 });
  for (const a of acts) {
    const index = (a.data as { index: number | null }).index;
    if (index !== null) return index;
  }
  return -1;
}
