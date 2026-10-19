import { ABILITIES, mechSchema, type Ability, type Character, type Mech, type Ruleset } from "./schema";
import { abilityMod, derive, hitDieFor, totalLevel, type Derived } from "./derive";
import { expectedHp, expectedSlots, pactSlots } from "./rules";

/**
 * Rules help for the 5e builder: the derived numbers of a half-typed
 * character, the standard array and point buy, and what the class tables
 * suggest for saves, slots and hit points. Pure, so it runs as you type.
 */

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);

/** A raw (maybe incomplete) mech as a full Mech: valid as-is when it parses, otherwise filled with safe defaults. */
export function looseMech(raw: unknown): Mech {
  const parsed = mechSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const m = isObj(raw) ? raw : {};
  const abilities = isObj(m.abilities) ? m.abilities : {};
  const classes = (Array.isArray(m.classes) ? m.classes : [])
    .filter(isObj)
    .map((k) => ({
      name: typeof k.name === "string" ? k.name : "",
      subclass: typeof k.subclass === "string" ? k.subclass : undefined,
      level: Math.max(1, Math.min(20, num(k.level, 1))),
      hitDie: typeof k.hitDie === "number" ? k.hitDie : undefined,
    }));
  const sc = isObj(m.spellcasting) ? m.spellcasting : undefined;
  return {
    species: typeof m.species === "string" ? m.species : "",
    lineage: typeof m.lineage === "string" ? m.lineage : undefined,
    size: m.size === "Small" ? "Small" : "Medium",
    background: typeof m.background === "string" ? m.background : "",
    classes,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, Math.max(1, Math.min(30, num(abilities[a], 10)))])) as Mech["abilities"],
    saves: strs(m.saves).filter((a): a is Ability => (ABILITIES as readonly string[]).includes(a)),
    skills: strs(m.skills) as Mech["skills"],
    expertise: strs(m.expertise) as Mech["expertise"],
    jackOfAllTrades: m.jackOfAllTrades === true,
    hp: Math.max(1, num(m.hp, 1)),
    ac: { value: num(isObj(m.ac) ? m.ac.value : undefined, 10), note: "" },
    speed: num(m.speed, 30),
    initiativeBonus: num(m.initiativeBonus, 0),
    senses: strs(m.senses),
    languages: strs(m.languages),
    tools: strs(m.tools),
    armorTraining: strs(m.armorTraining),
    weaponTraining: strs(m.weaponTraining),
    originFeat: typeof m.originFeat === "string" ? m.originFeat : undefined,
    feats: strs(m.feats),
    weaponMasteries: strs(m.weaponMasteries),
    features: [],
    attacks: (Array.isArray(m.attacks) ? m.attacks : []).filter(isObj).map((a) => ({
      name: typeof a.name === "string" ? a.name : "?",
      kind: a.kind === "spell" ? "spell" : "weapon",
      ability: (ABILITIES as readonly unknown[]).includes(a.ability) ? (a.ability as Ability) : "str",
      save: (ABILITIES as readonly unknown[]).includes(a.save) ? (a.save as Ability) : undefined,
      proficient: a.proficient !== false,
      dice: typeof a.dice === "string" && a.dice ? a.dice : "1d4",
      damageType: typeof a.damageType === "string" ? a.damageType : "",
      addMod: a.addMod !== false,
      magicBonus: num(a.magicBonus, 0),
      range: typeof a.range === "string" ? a.range : undefined,
      properties: strs(a.properties),
      mastery: typeof a.mastery === "string" ? a.mastery : undefined,
      note: typeof a.note === "string" ? a.note : undefined,
    })),
    spellcasting: sc
      ? {
          ability: (ABILITIES as readonly unknown[]).includes(sc.ability) ? (sc.ability as Ability) : "int",
          slots: Array.isArray(sc.slots) ? sc.slots.map((n) => num(n, 0)) : [],
          pact: isObj(sc.pact) ? { count: num(sc.pact.count, 0), level: num(sc.pact.level, 1) } : undefined,
          spells: [],
        }
      : undefined,
    equipment: [],
    gold: num(m.gold, 0),
  };
}

/** A character shell around a mech, enough for derive() and the rules tables. */
export function asCharacter(mech: Mech, id = "draft"): Character {
  return { id, mech } as Character;
}

/** Derived numbers for a raw mech, or null when they can't be worked out yet (no class). */
export function deriveLoose(raw: unknown): Derived | null {
  const mech = looseMech(raw);
  if (!mech.classes.length) return null;
  try {
    return derive(asCharacter(mech));
  } catch {
    return null;
  }
}

// ---- Class tables -------------------------------------------------------------

export const CLASSES = [
  "Artificer",
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
] as const;

/** Saving throw proficiencies a class grants (first class only, when multiclassing). */
export const CLASS_SAVES: Record<string, [Ability, Ability]> = {
  artificer: ["con", "int"],
  barbarian: ["str", "con"],
  bard: ["dex", "cha"],
  cleric: ["wis", "cha"],
  druid: ["int", "wis"],
  fighter: ["str", "con"],
  monk: ["str", "dex"],
  paladin: ["wis", "cha"],
  ranger: ["str", "dex"],
  rogue: ["dex", "int"],
  sorcerer: ["con", "cha"],
  warlock: ["wis", "cha"],
  wizard: ["int", "wis"],
};

/** Where a class usually puts its best scores, best first (for the standard array). */
export const CLASS_PRIORITY: Record<string, Ability[]> = {
  artificer: ["int", "con", "dex", "wis", "str", "cha"],
  barbarian: ["str", "con", "dex", "wis", "cha", "int"],
  bard: ["cha", "dex", "con", "wis", "int", "str"],
  cleric: ["wis", "con", "str", "dex", "cha", "int"],
  druid: ["wis", "con", "dex", "int", "cha", "str"],
  fighter: ["str", "con", "dex", "wis", "int", "cha"],
  monk: ["dex", "wis", "con", "str", "int", "cha"],
  paladin: ["str", "cha", "con", "wis", "dex", "int"],
  ranger: ["dex", "wis", "con", "str", "int", "cha"],
  rogue: ["dex", "con", "wis", "int", "cha", "str"],
  sorcerer: ["cha", "con", "dex", "wis", "int", "str"],
  warlock: ["cha", "con", "dex", "wis", "int", "str"],
  wizard: ["int", "con", "dex", "wis", "cha", "str"],
};

/** The spellcasting ability for a class or a third-caster subclass, if it casts. */
export function castingAbility(className: string, subclass = ""): Ability | null {
  const k = className.toLowerCase();
  if (["bard", "paladin", "sorcerer", "warlock"].includes(k)) return "cha";
  if (["cleric", "druid", "ranger"].includes(k)) return "wis";
  if (["wizard", "artificer"].includes(k)) return "int";
  if (/eldritch knight|arcane trickster/i.test(subclass)) return "int";
  return null;
}

// ---- Ability scores -------------------------------------------------------------

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** The standard array laid out best-first along `order`. */
export function standardArray(order: Ability[]): Record<Ability, number> {
  const out = {} as Record<Ability, number>;
  order.forEach((a, i) => (out[a] = STANDARD_ARRAY[i]));
  return out;
}

/** Abilities ranked by current score (ties keep sheet order), for "standard array, keep my order". */
export function rankAbilities(scores: Partial<Record<Ability, number>>): Ability[] {
  return [...ABILITIES].sort((a, b) => (scores[b] ?? 10) - (scores[a] ?? 10) || ABILITIES.indexOf(a) - ABILITIES.indexOf(b));
}

export function isStandardArray(scores: Partial<Record<Ability, number>>): boolean {
  const v = ABILITIES.map((a) => scores[a] ?? 0).sort((x, y) => y - x);
  return v.every((n, i) => n === STANDARD_ARRAY[i]);
}

const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

/** Points spent if these are point-buy scores before bonuses, or null when a score is outside 8–15. */
export function pointBuyCost(scores: Partial<Record<Ability, number>>): number | null {
  let total = 0;
  for (const a of ABILITIES) {
    const c = POINT_COST[scores[a] ?? 10];
    if (c === undefined) return null;
    total += c;
  }
  return total;
}

// ---- Hit points, slots ------------------------------------------------------------

export interface HpBreakdown {
  total: number;
  /** "10 (d10) + 4 × 6 + 5 × Con +2" */
  formula: string;
  /** Extra bonuses the rules check counts (Tough, dwarf, draconic). */
  extras: string[];
}

/** The fixed-average HP the rules check expects, and how it adds up. Null until every class has a known hit die. */
export function hpBreakdown(mech: Mech, ruleset: Ruleset): HpBreakdown | null {
  if (!mech.classes.length) return null;
  const c = asCharacter(mech);
  try {
    const parts: string[] = [];
    mech.classes.forEach((k, i) => {
      const die = hitDieFor(k);
      if (i === 0) parts.push(`${die} (first d${die})`);
      const rest = i === 0 ? k.level - 1 : k.level;
      if (rest > 0) parts.push(`${rest} × ${die / 2 + 1}`);
    });
    const level = totalLevel(c);
    const con = abilityMod(mech.abilities.con ?? 10);
    parts.push(`${level} × Con ${con >= 0 ? "+" : "−"}${Math.abs(con)}`);
    const total = expectedHp(c, ruleset);
    const base =
      mech.classes.reduce((sum, k, i) => sum + (i === 0 ? hitDieFor(k) : 0) + (i === 0 ? k.level - 1 : k.level) * (hitDieFor(k) / 2 + 1), 0) +
      con * level;
    const extras: string[] = [];
    if (total !== base) {
      const feats = [mech.originFeat ?? "", ...mech.feats].join("|");
      if (/\bTough\b/.test(feats)) extras.push(`Tough +${2 * level}`);
      if (/dwarf/i.test(mech.species) && (ruleset === "2024" || /hill/i.test(mech.lineage ?? ""))) extras.push(`dwarf +${level}`);
      const draconic = mech.classes.find((k) => k.name.toLowerCase() === "sorcerer" && /draconic/i.test(k.subclass ?? ""));
      if (draconic) extras.push(`draconic +${draconic.level}`);
    }
    return { total, formula: [...parts, ...extras].join(" + "), extras };
  } catch {
    return null;
  }
}

/** Spell slots by the class table, and pact magic for warlock levels. */
export function suggestedSlots(mech: Mech, ruleset: Ruleset): { slots: number[]; pact: { count: number; level: number } | null } {
  const c = asCharacter(mech);
  const warlock = mech.classes.find((k) => k.name.toLowerCase() === "warlock");
  return { slots: expectedSlots(c, ruleset), pact: warlock ? pactSlots(warlock.level) : null };
}
