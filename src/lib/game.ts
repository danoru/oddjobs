import type { z } from "zod";

/**
 * Live table play, for any system: one game state per table, changed only by
 * a system's pure reducer, and read only through its projection, which
 * decides what each viewer may see. The API (/api/tables/<code>/game) stores
 * the state and checks who's asking; everything else is here and testable
 * without a database. The table toys every system shares (dice, notes, the
 * bell, coins…) live in the table's event log instead (src/lib/live.ts).
 */

/** Who is acting: the GM (by cookie role) or a player (by their browser's made-up id). */
export type Actor = { role: "gm" } | { role: "player"; playerId: string };

/** Who is looking. "table" is a screen nobody sits at (the TV), which sees only what's public. */
export type Viewer = Actor | { role: "table" };

export type Applied<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameRules<S, A, V> {
  /** A fresh game for a table. */
  init(): S;
  /** Actions are parsed with this before they reach `apply`. */
  action: z.ZodType<A>;
  /**
   * Pure: the next state, or why not. `rng` returns [0, 1) and is only used for
   * chance (dice, candle burn times); `now` is the server's clock in ms, for
   * anything timed (a candle's burn).
   */
  apply(state: S, action: A, actor: Actor, rng: () => number, now: number): Applied<S>;
  /** What one viewer may see. Never includes other players' ids. */
  view(state: S, viewer: Viewer): V;
}

// ---- Seats ---------------------------------------------------------------------

/**
 * Seat order round the table, clockwise from the GM's left. Every system can
 * use it: Ten Candles passes cards by it, and its seats are who's at the
 * table in the event log. `playerId` never leaves the server.
 */
export interface Seat {
  playerId: string;
  name: string;
  /** A pre-made poster this player tore down, if any. */
  characterId: string | null;
}

export type PublicSeat = { index: number; name: string; characterId: string | null };

export function seatOf(seats: readonly Seat[], playerId: string): number {
  return seats.findIndex((s) => s.playerId === playerId);
}

/** The player to a seat's left (the next seat clockwise), wrapping round the players only. */
export const leftOf = (i: number, n: number) => (i + 1) % n;
/** The player to a seat's right (the previous seat clockwise), wrapping round the players only. */
export const rightOf = (i: number, n: number) => (i - 1 + n) % n;

/** Move a seat to a new place, keeping the others in order. */
export function moveSeat<T>(seats: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= seats.length || to < 0 || to >= seats.length) return [...seats];
  const out = [...seats];
  const [s] = out.splice(from, 1);
  out.splice(to, 0, s);
  return out;
}

/** A random die roll from `rng`. */
export const d6 = (rng: () => number) => 1 + Math.floor(rng() * 6);

/** Server-side dice: crypto randomness, so no browser can pick its own rolls. */
export function cryptoRng(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 2 ** 32;
}
