import { z } from "zod";

/**
 * Per-viewer reading modes for sheets and printables. They combine freely
 * and are kept in localStorage (see useReading in storage.ts).
 *
 * - large: the sheet zoomed by LARGE_ZOOM; on paper each face then runs to two pages.
 * - contrast: black ink on white, heavier rules, no parchment.
 * - dyslexia: Atkinson Hyperlegible, no italics or small caps, looser spacing.
 */
export const READING_MODES = ["large", "contrast", "dyslexia"] as const;
export type ReadingMode = (typeof READING_MODES)[number];

export const readingSchema = z.object({
  large: z.boolean().default(false),
  contrast: z.boolean().default(false),
  dyslexia: z.boolean().default(false),
});
export type Reading = z.infer<typeof readingSchema>;

export const LARGE_ZOOM = 1.35;

export const READING_LABELS: Record<ReadingMode, { label: string; hint: string }> = {
  large: { label: "Large print", hint: "Bigger type; each printed face takes two pages." },
  contrast: { label: "High contrast", hint: "Black on white, no parchment." },
  dyslexia: { label: "Dyslexia-friendly", hint: "Atkinson Hyperlegible, looser spacing, no italics." },
};

/** Whatever was stored (or nothing) as a full set of modes. */
export function parseReading(raw: unknown): Reading {
  const parsed = readingSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : readingSchema.parse({});
}

/** data-* attributes for the element the modes apply to. */
export function readingAttrs(r: Reading): Record<string, string | undefined> {
  return {
    "data-large": r.large ? "" : undefined,
    "data-contrast": r.contrast ? "" : undefined,
    "data-dyslexia": r.dyslexia ? "" : undefined,
  };
}

export const anyReading = (r: Reading) => READING_MODES.some((m) => r[m]);
