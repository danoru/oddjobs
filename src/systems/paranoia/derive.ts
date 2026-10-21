import { SKILL_KEYS, SKILLS, STATS, type Character, type Mech, type Skill, type Stat } from "./schema";

/** Numbers a Troubleshooter's sheet shows that follow from their skills, and how their name is written. */

export const STAT_NAMES: Record<Stat, string> = { violence: "Violence", brains: "Brains", chutzpah: "Chutzpah", mechanics: "Mechanics" };

export const SKILL_NAMES: Record<Skill, string> = {
  athletics: "Athletics",
  guns: "Guns",
  melee: "Melee",
  throw: "Throw",
  alphaComplex: "Alpha Complex",
  bureaucracy: "Bureaucracy",
  psychology: "Psychology",
  science: "Science",
  bluff: "Bluff",
  charm: "Charm",
  intimidate: "Intimidate",
  stealth: "Stealth",
  demolitions: "Demolitions",
  engineer: "Engineer",
  operate: "Operate",
  program: "Program",
};

/** "+2", "−1", "0". */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Each stat: the number of positive skills under it. */
export function stats(m: Pick<Mech, "skills">): Record<Stat, number> {
  const out = Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;
  for (const k of SKILL_KEYS) if (m.skills[k] > 0) out[SKILLS[k]]++;
  return out;
}

export const skillsOf = (stat: Stat) => SKILL_KEYS.filter((k) => SKILLS[k] === stat);

/** "Bob-R-XYZ-1", with a later clone's number when one's been decanted. */
export function cloneName(m: Pick<Mech, "clone">, number = m.clone.number): string {
  return `${m.clone.name}-${m.clone.clearance}-${m.clone.sector}-${number}`;
}

/** NODE for a stat + skill + gear, before wounds. */
export const nodeFor = (m: Pick<Mech, "skills">, stat: Stat, skill: Skill | null, gear = 0) => stats(m)[stat] + (skill ? m.skills[skill] : 0) + gear;

/** Each character's skills and starting clone, for the table's rolls and tallies (./live.ts). */
export function sheetLimits(cast: readonly Pick<Character, "id" | "mech">[]) {
  return Object.fromEntries(cast.map((c) => [c.id, { skills: { ...c.mech.skills }, clone: c.mech.clone.number, moxie: c.mech.moxie, xp: c.mech.xp }]));
}
export type ParanoiaSheets = ReturnType<typeof sheetLimits>;
