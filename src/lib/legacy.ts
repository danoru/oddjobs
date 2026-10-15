import { z } from "zod";

/**
 * The shared world: what became of characters after their one-shot. A
 * survivor can turn up as a cameo in later one-shots, so a pile of one-shots
 * slowly becomes a setting. Records come from the epilogue page.
 */

export const FATES = ["survived", "fell", "vanished", "changed"] as const;
export type Fate = (typeof FATES)[number];

export const FATE_LABEL: Record<Fate, string> = {
  survived: "Survived",
  fell: "Fell",
  vanished: "Vanished",
  changed: "Changed forever",
};

const kebab = z.string().regex(/^[a-z0-9-]+$/);

export const survivorSchema = z.object({
  /** `<oneshot>/<character>/<yyyy-mm-dd>` — one record per character per game night. */
  id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}$/),
  oneshot: kebab,
  oneshotTitle: z.string(),
  characterId: kebab,
  name: z.string().max(80),
  epithet: z.string().max(80),
  fate: z.enum(FATES),
  /** Earned on the night, e.g. "Bell-thief". */
  title: z.string().max(60).optional(),
  scar: z.string().max(140).optional(),
  /** The line they gave the paper. */
  line: z.string().max(280).optional(),
  playedBy: z.string().max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type Survivor = z.infer<typeof survivorSchema>;

export const survivorFileSchema = z.array(survivorSchema);

/** Characters from *other* one-shots who lived, newest first — candidates for a cameo. */
export function cameosFor(slug: string, all: Survivor[], limit = 3): Survivor[] {
  return all
    .filter((s) => s.oneshot !== slug && (s.fate === "survived" || s.fate === "changed"))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** A cameo WANTED-style line for a survivor, e.g. on another one-shot's board. */
export function cameoHook(s: Survivor): string {
  const known = s.title ? `the ${s.title}` : s.epithet;
  return `${s.name}, ${known}. Last seen after ${s.oneshotTitle}.`;
}
