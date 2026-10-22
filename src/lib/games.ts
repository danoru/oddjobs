import { z } from "zod";
import { usernameSchema } from "./accounts";

/**
 * Games (phase 11): running a one-shot is a game. Anyone signed in can run
 * any published one-shot; the game has a GM account (and co-GMs), a status,
 * seats held by accounts or guests, and a pinned copy of the content. Shared
 * by the API routes and the browser; the server side is ./games.server.ts.
 */

export const GAME_STATUSES = ["planned", "open", "live", "finished", "epilogued"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const STATUS_LABEL: Record<GameStatus, string> = {
  planned: "planned",
  open: "seats open",
  live: "live",
  finished: "finished",
  epilogued: "in the paper",
};

export const asStatus = (s: string): GameStatus => ((GAME_STATUSES as readonly string[]).includes(s) ? (s as GameStatus) : "finished");

/** Over: the seats, the log and the letters are history now. Only the morning after can still change. */
export const isOver = (s: GameStatus) => s === "finished" || s === "epilogued";

/** Players can tear posters, roll and pass notes. A planned game is on the board but not seated yet. */
export const isSeating = (s: GameStatus) => s === "open" || s === "live";

/** The GM can still move it to the latest published version: nobody has played it yet. */
export const canRepin = (s: GameStatus) => s === "planned" || s === "open";

/**
 * The moves a GM makes by hand. Epilogued comes from saving the morning-after
 * front page; a finished game can be reopened if it was ended by mistake.
 */
const MOVES: Record<GameStatus, GameStatus[]> = {
  planned: ["open"],
  open: ["planned", "live", "finished"],
  live: ["finished"],
  finished: ["live"],
  epilogued: [],
};
export const canMove = (from: GameStatus, to: GameStatus) => MOVES[from].includes(to);

/** A player's key at a game: the account's id for an account, a random key for a guest. */
export const userKey = (userId: string) => `u-${userId}`;
export const userIdOfKey = (key: string | null | undefined): string | null => (key?.startsWith("u-") ? key.slice(2) : null);

const kebab = z.string().regex(/^[a-z0-9-]+$/).max(80);
const when = z.string().datetime({ offset: true }).nullable();
const seats = z.number().int().min(1).max(20).nullable();

/** POST /api/games: run this job. */
export const newGameBody = z.object({ oneshot: kebab, scheduledAt: when.optional(), seats: seats.optional() });

/** PATCH /api/games/<code>: the GM's controls. */
export const gamePatchBody = z.discriminatedUnion("op", [
  z.object({ op: z.literal("status"), status: z.enum(GAME_STATUSES) }),
  z.object({ op: z.literal("schedule"), scheduledAt: when, seats }),
  z.object({ op: z.literal("repin") }),
  z.object({ op: z.literal("transfer"), to: usernameSchema, stay: z.boolean().default(false) }),
  z.object({ op: z.literal("addCoGm"), username: usernameSchema }),
  z.object({ op: z.literal("removeCoGm"), username: usernameSchema }),
  z.object({ op: z.literal("inviteGuest"), characterId: kebab }),
]);
export type GamePatch = z.infer<typeof gamePatchBody>;

/** POST /api/guest: sit down at a game without an account. */
export const guestBody = z.object({ code: z.string().max(12), name: z.string().trim().min(1).max(40) });

export type Person = { username: string; displayName: string };

/** A game as its list and its GM controls show it. */
export interface GameSummary {
  code: string;
  oneshot: string;
  title: string;
  status: GameStatus;
  scheduledAt: string | null;
  seats: number | null;
  gm: Person | null;
  coGms: Person[];
  /** How the asker stands at it. */
  you: "gm" | "cogm" | "player" | "admin" | null;
  /** Characters the asker holds there. */
  yours: string[];
  taken: number;
  createdAt: string;
  finishedAt: string | null;
}

/** The GM's controls on top of the summary. */
export interface GameDetail extends GameSummary {
  /** Pinned to a copy of the content, and when. Null: plays whatever is published. */
  pinnedAt: string | null;
  /** A newer version has been published since it was pinned. */
  newer: boolean;
  /** Members who could take the game or co-run it. */
  members: Person[];
  /** Seats held by guests, who could keep them through an invite. */
  guests: { characterId: string; name: string }[];
}

/** GET /api/games?oneshot=: what the asker and the other members know of a one-shot. */
export interface JobRecord {
  /** The asker ran (or co-ran) it, so knows its secrets. */
  youKnow: boolean;
  /** Members who have run it or held a seat in a finished game of it. */
  played: { displayName: string; as: "gm" | "player" }[];
  /** The asker's games of it that aren't over. */
  games: GameSummary[];
}
