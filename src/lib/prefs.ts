import { z } from "zod";
import { readingSchema } from "./reading";

/**
 * Someone's defaults for how the site reads and sounds (phase 12): reading
 * modes, dice and sound. A member's live on their account (`User.prefs`,
 * changed in /settings) and follow them to any phone; a guest's stay in the
 * browser. Either way the browser keeps a copy, so sheets render with them
 * at once (see usePrefs in storage.ts).
 *
 * - dice.shake: start with shake-to-roll on where the phone allows it without
 *   asking (iOS still asks once, from a tap).
 * - sound.volume: how loud the soundboard, the bell and the candles play.
 * - sound.buzz: the phone buzzes with the bell and the candles.
 */

export const diceSchema = z.object({
  shake: z.boolean().default(false),
});

export const soundSchema = z.object({
  volume: z.number().min(0).max(1).default(0.8),
  buzz: z.boolean().default(true),
});

export const prefsSchema = z.object({
  reading: readingSchema.default({ large: false, contrast: false, dyslexia: false }),
  dice: diceSchema.default({ shake: false }),
  sound: soundSchema.default({ volume: 0.8, buzz: true }),
});
export type Prefs = z.infer<typeof prefsSchema>;

export const defaultPrefs = (): Prefs => prefsSchema.parse({});

/**
 * Whatever was stored (or nothing) as a full set, keeping each part that
 * parses: a bad dice block doesn't throw away someone's reading modes.
 */
export function parsePrefs(raw: unknown): Prefs {
  const base = defaultPrefs();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const part = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, v: unknown, fallback: T): T => {
    const p = schema.safeParse(v ?? {});
    return p.success ? p.data : fallback;
  };
  return {
    reading: part(readingSchema, r.reading, base.reading),
    dice: part(diceSchema, r.dice, base.dice),
    sound: part(soundSchema, r.sound, base.sound),
  };
}
