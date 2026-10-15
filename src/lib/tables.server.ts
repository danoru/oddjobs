import type { NextApiRequest } from "next";
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
