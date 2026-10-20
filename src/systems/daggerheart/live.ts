import { EXPERIENCE_COST, MAX_FEAR, MAX_HOPE, STARTING_HOPE } from "./srd";

/**
 * Daggerheart at the table, on the shared event log (src/lib/live.ts): the
 * duality roll and the tallies it moves. Pure, so the server (applying an
 * action) and every browser (folding what it was sent) count Hope, Fear,
 * Stress, Hit Points and Armor the same way.
 *
 * A duality roll is two d12s, Hope and Fear, plus the trait and any
 * Experiences (each costs a Hope). Higher Hope die: "with Hope", the roller
 * gains a Hope. Higher Fear die: "with Fear", the GM gains a Fear. Matching
 * dice: a critical success, which gains a Hope and clears a Stress. Advantage
 * adds a d6, disadvantage takes one away. A reaction roll earns neither Hope
 * nor Fear. Every change is its own `tally` row (a signed delta), so two
 * phones acting at once can't overwrite each other, and the fold clamps each
 * count to its slots.
 */

export type Outcome = "hope" | "fear" | "crit";

export interface DualityData {
  system: "duality";
  who: string;
  characterId: string | null;
  label: string;
  hope: number;
  fear: number;
  /** Advantage (+) or disadvantage (−): a d6. */
  adv: { value: number; sign: 1 | -1 } | null;
  /** The trait (or other flat bonus) the phone sent. */
  mod: number;
  /** Experiences added, each for a Hope. */
  experiences: { name: string; bonus: number }[];
  total: number;
  outcome: Outcome;
  reaction: boolean;
  /** When the roller knows it. */
  difficulty: number | null;
  success: boolean | null;
}

export type Track = "hope" | "stress" | "hp" | "armor";

/** One change to a count: a character's Hope or marked slots, or the GM's Fear (characterId null). */
export interface TallyData {
  characterId: string | null;
  track: Track | "fear";
  delta: number;
  /** "with Hope", "critical", "Experience", "ticked", "spent"… */
  why: string;
  /** Whose count it is, for the GM's log. */
  name?: string;
}

/** What the rules allow each character's counts to reach, and the Experiences they can add. From content. */
export interface SheetLimits {
  hp: number;
  stress: number;
  armor: number;
  experiences: { name: string; bonus: number }[];
}

export type Marks = Record<Track, number>;

export interface Tallies {
  fear: number;
  /** By character id: Hope held, and Stress, Hit Points and Armor Slots marked. */
  marks: Record<string, Marks>;
}

const d = (sides: number, rng: () => number) => 1 + Math.floor(rng() * sides);

/** Roll the duality dice on the server. */
export function rollDuality(
  rng: () => number,
  o: { mod: number; adv: -1 | 0 | 1; experiences: { name: string; bonus: number }[]; reaction: boolean; difficulty: number | null },
): Omit<DualityData, "system" | "who" | "characterId" | "label"> {
  const hope = d(12, rng);
  const fear = d(12, rng);
  const adv = o.adv === 0 ? null : { value: d(6, rng), sign: o.adv };
  const total = hope + fear + (adv ? adv.value * adv.sign : 0) + o.mod + o.experiences.reduce((s, x) => s + x.bonus, 0);
  const outcome: Outcome = hope === fear ? "crit" : hope > fear ? "hope" : "fear";
  const success = outcome === "crit" ? true : o.difficulty === null ? null : total >= o.difficulty;
  return { hope, fear, adv, mod: o.mod, experiences: o.experiences, total, outcome, reaction: o.reaction, difficulty: o.difficulty, success };
}

/** The tallies a roll earns: the Experiences' Hope spent first, then what the dice give. */
export function rollTallies(r: Pick<DualityData, "outcome" | "reaction" | "experiences">, characterId: string, name: string): TallyData[] {
  const out: TallyData[] = [];
  if (r.experiences.length) out.push({ characterId, track: "hope", delta: -EXPERIENCE_COST * r.experiences.length, why: "Experience", name });
  if (r.reaction) return out;
  if (r.outcome === "hope") out.push({ characterId, track: "hope", delta: 1, why: "with Hope", name });
  if (r.outcome === "fear") out.push({ characterId: null, track: "fear", delta: 1, why: "with Fear", name: "the GM" });
  if (r.outcome === "crit") {
    out.push({ characterId, track: "hope", delta: 1, why: "critical", name });
    out.push({ characterId, track: "stress", delta: -1, why: "critical", name });
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function maxFor(track: Track, l: Pick<SheetLimits, "hp" | "stress" | "armor">): number {
  return track === "hope" ? MAX_HOPE : l[track];
}

/**
 * Hope, Fear and marked slots from the log, oldest first. Everyone at a
 * Daggerheart table starts the night with 2 Hope and nothing marked; the GM
 * starts at 0 Fear and takes the night's opening Fear from the GM page.
 */
export function foldTallies(rows: readonly { kind: string; data: unknown }[], limits: Record<string, Pick<SheetLimits, "hp" | "stress" | "armor">>): Tallies {
  const t: Tallies = { fear: 0, marks: {} };
  for (const id of Object.keys(limits)) t.marks[id] = { hope: STARTING_HOPE, stress: 0, hp: 0, armor: 0 };
  for (const r of rows) {
    if (r.kind !== "tally" || !r.data) continue;
    const x = r.data as TallyData;
    if (x.track === "fear") t.fear = clamp(t.fear + x.delta, 0, MAX_FEAR);
    else if (x.characterId && t.marks[x.characterId]) {
      const m = t.marks[x.characterId];
      m[x.track] = clamp(m[x.track] + x.delta, 0, maxFor(x.track, limits[x.characterId]));
    }
  }
  return t;
}

/** "Hope 12 · Fear 5 +2 = 19, with Hope". */
export function dualityWords(x: DualityData): string {
  const how = x.outcome === "crit" ? "a critical success!" : x.outcome === "hope" ? "with Hope" : "with Fear";
  const vs = x.difficulty !== null && x.outcome !== "crit" ? ` vs ${x.difficulty}, ${x.success ? "success" : "failure"}` : "";
  const exp = x.experiences.length ? ` (${x.experiences.map((e) => e.name).join(", ")})` : "";
  return `${x.label}${exp}: ${x.total}${vs}, ${how}${x.reaction ? " (reaction)" : ""}`;
}
