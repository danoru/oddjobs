import { epilogueSchema } from "./epilogueSchema";
import type { Fate } from "./legacy";

/**
 * Someone's history (phase 12): every game they saw to the end, as its GM,
 * a co-GM or a player, read from the games themselves (the seats, the co-GMs
 * and the morning after), never stored apart. Pure, so the rules are tested
 * without a database; ./profile.server.ts does the fetching.
 *
 * - One entry per game per role: a GM who also held a seat has two.
 * - A seat counts once it belongs to an account (`userId`). A guest's seat
 *   isn't anyone's history until an invite hands it over (adoptGuest), and
 *   the paper's "played by" is free text, never who someone is.
 * - A secret shows only in its player's own history, and only if the GM
 *   marked it as having come out at the table (the morning after's `revealed`).
 *
 * Phase 13's keepsakes (./keepsakes.ts) are read from these entries: one per
 * entry, stacked by the object they resolve to.
 */

export type HistoryRole = "gm" | "cogm" | "player";

export const ROLE_LABEL: Record<HistoryRole, string> = { gm: "GM", cogm: "co-GM", player: "player" };

export interface HistoryCharacter {
  id: string;
  /** The name on the board (the alias for a mystery role) for others; the real one in your own history. */
  name: string;
  epithet: string;
  fate: Fate | null;
  /** The title earned on the night (an alias on the WANTED poster). */
  title: string | null;
  scar: string | null;
  /** The line they gave the paper. */
  line: string | null;
  /** Only in your own history, and only once it came out at the table. */
  secret?: string;
}

export interface HistoryEntry {
  /** The game's join code: its broadsheet and tapestry are `/<oneshot>/epilogue?table=<code>` and `/<oneshot>/tapestry?table=<code>`. */
  code: string;
  oneshot: string;
  /** The one-shot's title. */
  title: string;
  system: string;
  /** The game night, yyyy-mm-dd: the paper's date, else when it finished. */
  date: string;
  role: HistoryRole;
  /** Epilogued: it made the paper. */
  inPaper: boolean;
  /** For a player's seat. */
  character?: HistoryCharacter;
}

/** What the derivation needs from a game row. */
export interface HistoryGame {
  code: string;
  oneshot: string;
  status: string;
  gmId: string | null;
  coGms: { userId: string }[];
  claims: { characterId: string; userId: string | null }[];
  epilogue: { data: unknown } | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/** What the derivation needs from the content a game played. `secret` only where the asker may ever read it. */
export interface HistoryCast {
  title: string;
  system: string;
  cast: Record<string, { name: string; boardName: string; epithet: string; secret?: string | null }>;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const text = (s: string | undefined) => s?.trim() || null;

/**
 * The entries for `userId`, newest first. `own`: the person is reading their
 * own history (real names, and secrets that came out). `castOf` gives the
 * content each game played, or null if it's gone (the entry still counts,
 * under the one-shot's slug).
 */
export function deriveHistory<G extends HistoryGame>(userId: string, games: G[], castOf: (g: G) => HistoryCast | null, own: boolean): HistoryEntry[] {
  const out: (HistoryEntry & { at: number })[] = [];
  for (const g of games) {
    if (g.status !== "finished" && g.status !== "epilogued") continue;
    const os = castOf(g);
    const ep = epilogueSchema.safeParse(g.epilogue?.data);
    const paper = ep.success ? ep.data : null;
    const date = g.status === "epilogued" && paper ? paper.date : isoDay(g.finishedAt ?? g.createdAt);
    const base = {
      code: g.code,
      oneshot: g.oneshot,
      title: os?.title ?? g.oneshot,
      system: os?.system ?? "",
      date,
      inPaper: g.status === "epilogued",
      at: (g.finishedAt ?? g.createdAt).getTime(),
    };
    if (g.gmId === userId) out.push({ ...base, role: "gm" });
    else if (g.coGms.some((c) => c.userId === userId)) out.push({ ...base, role: "cogm" });
    for (const seat of g.claims) {
      if (seat.userId !== userId) continue;
      const c = os?.cast[seat.characterId];
      const e = paper?.entries[seat.characterId];
      const character: HistoryCharacter = {
        id: seat.characterId,
        name: c ? (own ? c.name : c.boardName) : seat.characterId,
        epithet: c?.epithet ?? "",
        fate: e?.fate ?? null,
        title: text(e?.title),
        scar: text(e?.scar),
        line: text(e?.line),
      };
      if (own && e?.revealed === true && c?.secret) character.secret = c.secret;
      out.push({ ...base, role: "player", character });
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return out.map(({ at, ...e }) => e);
}

export interface HistorySummary {
  /** The bounty: jobs survived, i.e. seats whose character lived (survived, or changed forever). */
  bounty: number;
  /** Seats played to the end, and games run (or co-run). */
  played: number;
  ran: number;
  /** Titles earned in the paper, newest first, each once. */
  aliases: { title: string; character: string; oneshot: string }[];
  /** Scars carried, newest first. */
  scars: { scar: string; character: string; oneshot: string }[];
}

/** What the WANTED poster says about someone, from their history. */
export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  const seats = entries.filter((e) => e.role === "player" && e.character);
  const aliases: HistorySummary["aliases"] = [];
  const scars: HistorySummary["scars"] = [];
  for (const e of seats) {
    const c = e.character!;
    if (c.title && !aliases.some((a) => a.title.toLowerCase() === c.title!.toLowerCase())) aliases.push({ title: c.title, character: c.name, oneshot: e.title });
    if (c.scar) scars.push({ scar: c.scar, character: c.name, oneshot: e.title });
  }
  return {
    bounty: seats.filter((e) => e.character!.fate === "survived" || e.character!.fate === "changed").length,
    played: seats.length,
    ran: entries.filter((e) => e.role !== "player").length,
    aliases,
    scars,
  };
}
