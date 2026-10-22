import { usernameKey, type Viewer } from "./accounts";
import { gameOneShot } from "./games.server";
import { deriveHistory, summarizeHistory, type HistoryCast, type HistoryEntry, type HistorySummary } from "./history";
import { db } from "./prisma";
import type { OneShotWithCast } from "./schema";

/**
 * A member's WANTED poster (/u/<username>, phase 12): who they are, and
 * their history read from the games they saw to the end. Members only: the
 * page checks the viewer before calling this, and never for a guest.
 *
 * What it never holds: a character's secret, unless it's your own poster and
 * the GM marked that secret as having come out at the table. Secrets aren't
 * even read for anyone else's. Nobody's private data from a game (notes,
 * flashbacks, letters, rolls behind the screen) is read at all.
 */

export interface Profile {
  username: string;
  displayName: string;
  pronouns: string | null;
  /** The woodcut, a data URL, or null for the poster's plain engraving. */
  portrait: string | null;
  /** The viewer is reading their own poster. */
  own: boolean;
  history: HistoryEntry[];
  summary: HistorySummary;
}

/** What someone's character hides, as their own history would show it once it's out. Ten Candles has none. */
export function secretOf(c: OneShotWithCast["cast"][number]): string | null {
  if ("naughty" in c && c.naughty) {
    const n = c.naughty;
    return [`Secret society: ${n.society}`, n.mutantPower?.name ? `Mutant power: ${n.mutantPower.name}` : "", n.secret ?? ""].filter(Boolean).join(". ") || null;
  }
  const story = "story" in c ? (c.story as { secret?: unknown }) : null;
  return typeof story?.secret === "string" ? story.secret.trim() || null : null;
}

/** The parts of a game's content the history reads. `withSecrets` only for the owner's own poster. */
export function castOf(os: OneShotWithCast, withSecrets: boolean): HistoryCast {
  return {
    title: os.title,
    system: os.system,
    cast: Object.fromEntries(
      os.cast.map((c) => [
        c.id,
        { name: c.name, boardName: c.poster.alias ?? c.name, epithet: c.poster.epithet, ...(withSecrets ? { secret: secretOf(c) } : {}) },
      ]),
    ),
  };
}

const OVER = ["finished", "epilogued"];

/** The games someone saw to the end, as GM, co-GM or an account's seat. */
export async function gamesOf(userId: string) {
  return db().game.findMany({
    where: { status: { in: OVER }, OR: [{ gmId: userId }, { coGms: { some: { userId } } }, { claims: { some: { userId } } }] },
    select: {
      id: true,
      code: true,
      oneshot: true,
      status: true,
      gmId: true,
      pinnedAt: true,
      finishedAt: true,
      createdAt: true,
      coGms: { select: { userId: true } },
      claims: { select: { characterId: true, userId: true } },
      epilogue: { select: { data: true } },
    },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}

/** Someone's history: the games, the content each played (its pinned copy), and the rules in ./history.ts. */
export async function historyOf(userId: string, own: boolean): Promise<HistoryEntry[]> {
  const games = await gamesOf(userId);
  const casts = new Map<string, HistoryCast | null>();
  for (const g of games) {
    const os = await gameOneShot(g).catch(() => null);
    casts.set(g.id, os ? castOf(os, own) : null);
  }
  return deriveHistory(userId, games, (g) => casts.get(g.id) ?? null, own);
}

/** The poster for `/u/<username>`, as `viewer` (a signed-in member) may see it, or null if there's no such member. */
export async function profileFor(username: string, viewer: Viewer): Promise<Profile | null> {
  if (!username || username.length > 64) return null;
  const u = await db().user.findUnique({
    where: { usernameLower: usernameKey(username) },
    select: { id: true, username: true, displayName: true, pronouns: true, portrait: true, disabledAt: true },
  });
  if (!u || u.disabledAt) return null;
  const own = u.id === viewer.id;
  const history = await historyOf(u.id, own);
  return {
    username: u.username,
    displayName: u.displayName,
    pronouns: u.pronouns,
    portrait: u.portrait,
    own,
    history,
    summary: summarizeHistory(history),
  };
}
