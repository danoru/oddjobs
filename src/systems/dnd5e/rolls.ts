import { ABILITIES, SKILLS, type Ability, type Character, type Skill } from "./schema";
import { ABILITY_NAMES, SKILL_NAMES, derive } from "./derive";

/**
 * What a 5e sheet can roll at the table: checks, saves, skills, initiative,
 * attacks and their damage. The phone sends the spec and the server rolls
 * the dice (src/lib/live.ts), so the modifier shown on the TV is the one on
 * the sheet, tweaks and level included.
 */
export interface RollSpec {
  label: string;
  count: number;
  sides: number;
  mod: number;
  /** A single d20, so advantage and disadvantage apply. */
  d20: boolean;
}

const d20 = (label: string, mod: number): RollSpec => ({ label, count: 1, sides: 20, mod, d20: true });

/** "1d8 + 3", "2d6", "1d10 − 1" → dice and a flat modifier; null for anything fancier ("1d8 + 1d6"). */
export function parseDamage(damage: string): Pick<RollSpec, "count" | "sides" | "mod"> | null {
  const m = damage.replace(/−/g, "-").replace(/\s+/g, "").match(/^(\d{1,2})d(4|6|8|10|12|20|100)(?:([+-])(\d{1,2}))?$/);
  if (!m) return null;
  const mod = m[3] ? Number(m[4]) * (m[3] === "-" ? -1 : 1) : 0;
  return { count: Number(m[1]), sides: Number(m[2]), mod };
}

export const checkRoll = (c: Character, a: Ability) => d20(`${ABILITY_NAMES[a]} check`, derive(c).mods[a]);
export const saveRoll = (c: Character, a: Ability) => d20(`${ABILITY_NAMES[a]} save`, derive(c).saves[a].total);
export const skillRoll = (c: Character, k: Skill) => d20(SKILL_NAMES[k], derive(c).skills[k].total);
export const initiativeRoll = (c: Character) => d20("Initiative", derive(c).initiative);

/** An attack's to-hit roll (none for a save-based one) and its damage roll (when the dice are simple). */
export function attackRolls(c: Character, name: string): { hit: RollSpec | null; damage: RollSpec | null } {
  const a = derive(c).attacks.find((x) => x.name === name);
  if (!a) return { hit: null, damage: null };
  const hitMod = /^[+-]?\d+$/.test(a.toHit.replace("+", "")) ? Number(a.toHit.replace("+", "")) : null;
  const dmg = parseDamage(a.damage);
  return {
    hit: hitMod === null ? null : d20(`${a.name} to hit`, hitMod),
    damage: dmg ? { ...dmg, label: `${a.name} damage`, d20: false } : null,
  };
}

/** Every roll on the sheet, grouped, for the tray's menu. */
export function sheetRolls(c: Character): { group: string; rolls: RollSpec[] }[] {
  const d = derive(c);
  return [
    { group: "Checks", rolls: [initiativeRoll(c), ...ABILITIES.map((a) => checkRoll(c, a))] },
    { group: "Saves", rolls: ABILITIES.map((a) => saveRoll(c, a)) },
    { group: "Skills", rolls: (Object.keys(SKILLS) as Skill[]).map((k) => skillRoll(c, k)) },
    {
      group: "Attacks",
      rolls: d.attacks.flatMap((a) => {
        const r = attackRolls(c, a.name);
        return [r.hit, r.damage].filter((x): x is RollSpec => x !== null);
      }),
    },
  ];
}
