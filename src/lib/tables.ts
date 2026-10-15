import { z } from "zod";

/**
 * Table sessions: a GM opens a table for one one-shot and reads out its short
 * code; players join with the code and their torn posters are shared with
 * everyone at that table. Shared by the API routes and the browser.
 */

/** No 0/O or 1/I, so a code read across a table can't be misheard. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;

export function makeTableCode(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(CODE_LENGTH);
  // 256 is a multiple of 32, so `% 32` is unbiased.
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function randomBytes(n: number) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** "ab-c 2d" → "ABC2D"; null if it can't be a table code. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

/** Header carrying the browser's made-up player id. */
export const PLAYER_HEADER = "x-tearoff-player";

const kebab = z.string().regex(/^[a-z0-9-]+$/).max(80);
export const playerIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
export const playerNameSchema = z.string().trim().min(1).max(40);

export const openTableBody = z.object({ oneshot: kebab });
export const claimBody = z.object({ characterId: kebab, name: playerNameSchema });

export type TableClaim = {
  characterId: string;
  name: string;
  /** Torn by the browser asking. Other players' ids are never sent. */
  mine: boolean;
  claimedAt: string;
};

export type TableState = { code: string; oneshot: string; claims: TableClaim[] };

/** Poll interval for shared claims. */
export const POLL_MS = 3000;
