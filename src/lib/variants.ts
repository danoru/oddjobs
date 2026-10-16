import type { Character, VariantCharacter } from "./schema";

/**
 * Level variants: the same cast at another level. A variant only carries each
 * character's mechanics (and options, when they differ); story, poster and
 * ties always come from the base character.
 */

type Variants = { level: number; note?: string; cast: VariantCharacter[] }[];
export type HasLevels<C> = { slug?: string; level: number; cast: C[]; variants: Variants };
type Mechanical = Pick<Character, "id" | "mech" | "options">;

export interface LevelChoice {
  level: number;
  note?: string;
  /** The level the one-shot was written for. */
  base: boolean;
}

/** Every level this one-shot can be played at, lowest first. */
export function levelsOf(os: HasLevels<unknown>): LevelChoice[] {
  return [{ level: os.level, base: true }, ...os.variants.map((v) => ({ level: v.level, note: v.note, base: false }))].sort(
    (a, b) => a.level - b.level,
  );
}

/** A level to play at: the one asked for if it's offered, else the base level. */
export function pickLevel(os: HasLevels<unknown>, wanted: unknown): number {
  const n = typeof wanted === "string" ? Number(wanted) : wanted;
  return typeof n === "number" && levelsOf(os).some((l) => l.level === n) ? n : os.level;
}

/** The one-shot at a level: the cast's mechanics swapped for that variant's. Unknown levels give the base. */
export function withVariant<C extends Mechanical, T extends HasLevels<C>>(os: T, level: number): T {
  const v = os.variants.find((x) => x.level === level);
  if (!v || level === os.level) return os;
  const cast = os.cast.map((c) => {
    const x = v.cast.find((y) => y.id === c.id);
    return x ? { ...c, mech: x.mech, options: x.options ?? c.options } : c;
  });
  return { ...os, level, cast };
}
