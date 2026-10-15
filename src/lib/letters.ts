import { z } from "zod";
import type { OneShotWithCast } from "./schema";
import { planTonight } from "./tonight";

/**
 * Sealed letters. Two kinds, both resolved from content on the server so the
 * text never sits in the database or in any page a player didn't earn:
 *   - a content letter (`os.letters[].id`), addressed to one character;
 *   - `beat:<from>:<n>` — the n-th `ifUnclaimed.reassign` beat of a character
 *     nobody is playing, handed to whoever inherits it tonight.
 */

export const letterIdSchema = z.string().regex(/^(beat:[a-z0-9-]+:\d{1,2}|[a-z0-9-]+)$/).max(120);
export const deliverBody = z.object({ letterId: letterIdSchema });
export const flashbackBody = z.object({ characterId: z.string().regex(/^[a-z0-9-]+$/), answer: z.string().trim().min(1).max(400) });

export interface ResolvedLetter {
  id: string;
  /** Character it's addressed to. */
  to: string;
  /** GM-facing label. */
  title: string;
  /** What the player reads once they break the seal. */
  text: string;
  kind: "letter" | "beat";
}

export const beatId = (from: string, n: number) => `beat:${from}:${n}`;

/** Every letter the GM could send tonight, given who's at the table. */
export function availableLetters(os: OneShotWithCast, present: string[]): ResolvedLetter[] {
  const content = os.letters.map((l): ResolvedLetter => ({ id: l.id, to: l.to, title: l.title, text: l.text, kind: "letter" }));
  const plan = planTonight(os.cast, present);
  const beats = os.cast.flatMap((c) =>
    (c.ifUnclaimed?.reassign ?? []).flatMap((r, n): ResolvedLetter[] => {
      const move = plan.moves.find((m) => m.from === c.id && m.beat === r.beat);
      return move
        ? [{ id: beatId(c.id, n), to: move.to, title: `${c.name}'s part: ${r.beat}`, text: move.text, kind: "beat" }]
        : [];
    }),
  );
  // Content letters only make sense for characters someone is actually playing.
  return [...content.filter((l) => present.includes(l.to)), ...beats];
}

export function resolveLetter(os: OneShotWithCast, letterId: string, present: string[]): ResolvedLetter | null {
  return availableLetters(os, present).find((l) => l.id === letterId) ?? null;
}

/** The text of a letter already delivered (recipient fixed at delivery time). */
export function letterText(os: OneShotWithCast, letterId: string): { title: string; text: string } | null {
  const content = os.letters.find((l) => l.id === letterId);
  if (content) return { title: content.title, text: content.text };
  const m = letterId.match(/^beat:([a-z0-9-]+):(\d+)$/);
  if (!m) return null;
  const c = os.cast.find((x) => x.id === m[1]);
  const r = c?.ifUnclaimed?.reassign[Number(m[2])];
  return c && r ? { title: `${c.name}'s part: ${r.beat}`, text: r.text } : null;
}

/** What the browser gets back about letters. Text only for letters to the asker. */
export type LetterView = {
  id: string;
  to: string;
  title: string;
  deliveredAt: string;
  openedAt: string | null;
  /** Present only for letters addressed to a character the asker holds. */
  text?: string;
};

/** A session-zero answer as the browser sees it. */
export type FlashbackView = { characterId: string; answer: string; mine: boolean };
