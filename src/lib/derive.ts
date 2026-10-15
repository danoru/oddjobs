import { ABILITIES, SKILLS, type Ability, type Attack, type Character, type Skill } from "./schema";

/** Numbers the sheet shows that follow from the authored record. */

const HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  artificer: 8,
  sorcerer: 6,
  wizard: 6,
};

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const SKILL_NAMES: Record<Skill, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** "+3", "-1", "+0". */
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const totalLevel = (c: Character) => c.mech.classes.reduce((sum, k) => sum + k.level, 0);

export function hitDieFor(k: Character["mech"]["classes"][number]): number {
  const die = k.hitDie ?? HIT_DIE[k.name.toLowerCase()];
  if (!die) throw new Error(`unknown hit die for class "${k.name}" — set hitDie`);
  return die;
}

export function hitDice(c: Character): { die: number; count: number }[] {
  const byDie = new Map<number, number>();
  for (const k of c.mech.classes) {
    const die = hitDieFor(k);
    byDie.set(die, (byDie.get(die) ?? 0) + k.level);
  }
  return [...byDie.entries()].sort((a, b) => b[0] - a[0]).map(([die, count]) => ({ die, count }));
}

export function classLine(c: Character): string {
  return c.mech.classes
    .map((k) => `${k.name}${k.subclass ? ` (${k.subclass})` : ""} ${k.level}`)
    .join(" / ");
}

export interface AttackLine {
  name: string;
  kind: Attack["kind"];
  toHit: string;
  damage: string;
  damageType: string;
  range?: string;
  properties: string[];
  mastery?: string;
  note?: string;
}

export interface Derived {
  level: number;
  prof: number;
  mods: Record<Ability, number>;
  saves: Record<Ability, { total: number; proficient: boolean }>;
  skills: Record<Skill, { total: number; proficient: boolean; expertise: boolean; ability: Ability }>;
  passive: { perception: number; insight: number; investigation: number };
  initiative: number;
  hitDice: { die: number; count: number }[];
  spell?: { ability: Ability; dc: number; attack: number };
  attacks: AttackLine[];
}

export function derive(c: Character): Derived {
  const level = totalLevel(c);
  const prof = proficiencyBonus(level);
  const m = c.mech;

  const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(m.abilities[a] ?? 10)])) as Record<
    Ability,
    number
  >;

  const saves = Object.fromEntries(
    ABILITIES.map((a) => {
      const proficient = m.saves.includes(a);
      return [a, { total: mods[a] + (proficient ? prof : 0), proficient }];
    }),
  ) as Derived["saves"];

  const half = m.jackOfAllTrades ? Math.floor(prof / 2) : 0;
  const skills = Object.fromEntries(
    (Object.keys(SKILLS) as Skill[]).map((s) => {
      const ab = SKILLS[s];
      const expertise = m.expertise.includes(s);
      const proficient = expertise || m.skills.includes(s);
      const bonus = expertise ? prof * 2 : proficient ? prof : half;
      return [s, { total: mods[ab] + bonus, proficient, expertise, ability: ab }];
    }),
  ) as Derived["skills"];

  const spell = m.spellcasting
    ? {
        ability: m.spellcasting.ability,
        dc: 8 + prof + mods[m.spellcasting.ability],
        attack: prof + mods[m.spellcasting.ability],
      }
    : undefined;

  const attacks = m.attacks.map((a): AttackLine => {
    const mod = mods[a.ability];
    const toHit = mod + (a.proficient ? prof : 0) + a.magicBonus;
    const dc = 8 + prof + mod;
    const flat = (a.addMod ? mod : 0) + a.magicBonus;
    const damage = flat === 0 ? a.dice : `${a.dice} ${flat > 0 ? "+" : "−"} ${Math.abs(flat)}`;
    return {
      name: a.name,
      kind: a.kind,
      toHit: a.save ? `DC ${dc} ${a.save.toUpperCase()}` : signed(toHit),
      damage,
      damageType: a.damageType,
      range: a.range,
      properties: a.properties,
      mastery: a.mastery,
      note: a.note,
    };
  });

  return {
    level,
    prof,
    mods,
    saves,
    skills,
    passive: {
      perception: 10 + skills.perception.total,
      insight: 10 + skills.insight.total,
      investigation: 10 + skills.investigation.total,
    },
    initiative: mods.dex + m.initiativeBonus,
    hitDice: hitDice(c),
    spell,
    attacks,
  };
}

export const ordinal = (n: number) =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
