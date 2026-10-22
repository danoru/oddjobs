import { z } from "zod";
import type { GameStatus } from "./games";

/**
 * The table at a game (./games.ts): its short code is read out across the
 * table; players join with it and their torn posters are shared with
 * everyone at that game. Shared by the API routes and the browser.
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

const kebab = z.string().regex(/^[a-z0-9-]+$/).max(80);
export const playerIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
export const playerNameSchema = z.string().trim().min(1).max(40);

/** The name comes from the account or the guest pass; a browser can't sit down as someone else. */
export const claimBody = z.object({ characterId: kebab });

export type TableClaim = {
  characterId: string;
  name: string;
  /** Torn by whoever is asking. Other players' keys are never sent. */
  mine: boolean;
  /** Held by a guest (no account), who could keep it through an invite. */
  guest: boolean;
  claimedAt: string;
};

export type TableState = { code: string; oneshot: string; status: GameStatus; seats: number | null; claims: TableClaim[] };

/** Poll interval for shared claims. */
export const POLL_MS = 3000;
