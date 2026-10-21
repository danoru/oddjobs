import { SKILLS, type HouseRules, type Skill, type Stat } from "./schema";
import { CLONES, DEAD, STARTING_MOXIE, cloneMoxie, woundPenalty } from "./rules";
import { stats, type ParanoiaSheets } from "./derive";

/**
 * Paranoia at the table, on the shared event log (src/lib/live.ts). Pure, so
 * the server (applying an action) and every browser (folding what it was
 * sent) agree on everyone's Moxie, wounds, treason, clone and XP.
 *
 * A NODE roll is stat + skill + gear dice, less the wound penalty, plus one
 * Computer die; every 5 or 6 succeeds. A negative pool rolls anti-dice: each
 * that misses takes a success away. The Computer notices on a 6, or lower
 * the more treasonous the roller is. Every change to a count is its own
 * `tally` row (a signed delta), clamped by the fold; a clone's death resets
 * its wounds and Moxie for the next one out of the vat.
 */

export interface NodeData {
  system: "node";
  who: string;
  characterId: string | null;
  label: string;
  stat: Stat;
  skill: Skill | null;
  /** The pool before the Computer die: stat + skill + gear − wounds. May be negative. */
  node: number;
  dice: number[];
  anti: number[];
  computer: number;
  successes: number;
  /** The Computer die came up at or over `threshold`. */
  noticed: boolean;
  threshold: number;
}

export type PTrack = "moxie" | "wounds" | "treason" | "clone" | "xp";

export interface PTallyData {
  characterId: string;
  track: PTrack;
  delta: number;
  why: string;
  name?: string;
}

export type PMarks = Record<PTrack, number>;
export interface PTallies {
  /** By character id. `clone` past 6 means out of clones. */
  marks: Record<string, PMarks>;
}

const d6 = (rng: () => number) => 1 + Math.floor(rng() * 6);
const hit = (v: number) => v >= 5;

export function rollNode(rng: () => number, node: number, threshold: number) {
  const dice = node > 0 ? Array.from({ length: Math.min(node, 30) }, () => d6(rng)) : [];
  const anti = node < 0 ? Array.from({ length: Math.min(-node, 30) }, () => d6(rng)) : [];
  const computer = d6(rng);
  const successes = dice.filter(hit).length + (hit(computer) ? 1 : 0) - anti.filter((v) => !hit(v)).length;
  return { dice, anti, computer, successes, noticed: computer >= threshold, threshold };
}

export const startMarks = (s: ParanoiaSheets[string]): PMarks => ({ moxie: s.moxie, wounds: 0, treason: 0, clone: s.clone, xp: s.xp });

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function foldParanoia(rows: readonly { kind: string; data: unknown }[], sheets: ParanoiaSheets, h: Pick<HouseRules, "treasonLevels" | "cloneMoxie">): PTallies {
  const marks: Record<string, PMarks> = {};
  for (const [id, s] of Object.entries(sheets)) marks[id] = startMarks(s);
  for (const r of rows) {
    if (r.kind !== "tally" || !r.data) continue;
    const x = r.data as PTallyData;
    const m = marks[x.characterId];
    if (!m || !(x.track in m)) continue;
    if (x.track === "clone") {
      const next = clamp(m.clone + x.delta, 1, CLONES + 1);
      // A new clone out of the vat: unhurt, with a new clone's Moxie.
      if (next > m.clone) Object.assign(m, { wounds: 0, moxie: cloneMoxie(h) });
      m.clone = next;
    } else if (x.track === "moxie") m.moxie = clamp(m.moxie + x.delta, 0, Math.max(STARTING_MOXIE, sheets[x.characterId].moxie));
    else if (x.track === "wounds") m.wounds = clamp(m.wounds + x.delta, 0, DEAD);
    else if (x.track === "treason") m.treason = clamp(m.treason + x.delta, 0, h.treasonLevels - 1);
    else m.xp = Math.max(0, m.xp + x.delta);
  }
  return { marks };
}

/** The pool a roll gets: stat + skill + gear, less the wound penalty. */
export function nodePool(skills: ParanoiaSheets[string]["skills"], stat: Stat, skill: Skill | null, gear: number, wounds: number) {
  return stats({ skills })[stat] + (skill ? skills[skill] : 0) + gear - woundPenalty(wounds);
}

/** A roll's tallies: the Computer's effect on Moxie, as the house rules have it. */
export function nodeTallies(r: Pick<NodeData, "noticed">, characterId: string, name: string, h: Pick<HouseRules, "computerMoxie">): PTallyData[] {
  if (!r.noticed || h.computerMoxie === "none") return [];
  return [{ characterId, track: "moxie", delta: h.computerMoxie === "gain" ? 1 : -1, why: "the Computer", name }];
}

/** "Guns: 3 successes, and the Computer noticed". */
export function nodeWords(x: NodeData): string {
  const n = x.successes;
  const s = `${n} success${Math.abs(n) === 1 ? "" : "es"}`;
  return `${x.label}: ${s}${x.noticed ? ", and Friend Computer noticed" : ""}`;
}

/** Whether a skill sits under a stat. */
export const under = (skill: Skill, stat: Stat) => SKILLS[skill] === stat;
