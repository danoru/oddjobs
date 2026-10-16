import type { Character, Ruleset } from "./schema";
import { abilityMod, hitDieFor, totalLevel } from "./derive";

/**
 * Rules arithmetic the validator holds every character to, so a level variant
 * can't quietly keep its level-5 slots or hit points. Same tables in 2014 and
 * 2024 except where noted.
 */

/** Spell slots by caster level (the multiclass table; index 0 = 1st-level slots). */
const SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const FULL = ["bard", "cleric", "druid", "sorcerer", "wizard"];
const HALF = ["paladin", "ranger"];
/** Subclasses that cast a third as well as a full caster. */
const THIRD = ["eldritch knight", "arcane trickster"];

/** Caster level for the multiclass slot table. 2014 half casters start at class level 2; 2024 ones at 1. */
export function casterLevel(c: Character, ruleset: Ruleset): number {
  let total = 0;
  for (const k of c.mech.classes) {
    const name = k.name.toLowerCase();
    const sub = (k.subclass ?? "").toLowerCase();
    if (FULL.includes(name)) total += k.level;
    else if (name === "artificer") total += Math.ceil(k.level / 2);
    else if (HALF.includes(name)) total += ruleset === "2024" ? Math.ceil(k.level / 2) : Math.floor(k.level / 2);
    else if (THIRD.some((t) => sub.includes(t))) total += Math.floor(k.level / 3);
  }
  return total;
}

/** The slots a character should have from their classes, or null when we can't tell (a single half caster at 1st in 2014 has none). */
export function expectedSlots(c: Character, ruleset: Ruleset): number[] {
  return SLOTS[Math.min(20, casterLevel(c, ruleset))];
}

/** Warlock pact magic by warlock level: how many slots, and of which level. */
export function pactSlots(warlockLevel: number): { count: number; level: number } | null {
  if (warlockLevel < 1) return null;
  const count = warlockLevel >= 17 ? 4 : warlockLevel >= 11 ? 3 : warlockLevel >= 2 ? 2 : 1;
  return { count, level: Math.min(5, Math.ceil(warlockLevel / 2)) };
}

/**
 * Hit points with the fixed average per level: the first class's die in full,
 * then die/2 + 1 for every other level, plus Con each level, plus the bonuses
 * we know about (Tough; dwarves, and hill dwarves in 2014; draconic sorcerers).
 */
export function expectedHp(c: Character, ruleset: Ruleset): number {
  const m = c.mech;
  const level = totalLevel(c);
  const con = abilityMod(m.abilities.con ?? 10);
  let hp = 0;
  m.classes.forEach((k, i) => {
    const die = hitDieFor(k);
    const levels = i === 0 ? k.level - 1 : k.level;
    hp += (i === 0 ? die : 0) + levels * (die / 2 + 1);
  });
  hp += con * level;
  const feats = [m.originFeat ?? "", ...m.feats].join("|");
  if (/\bTough\b/.test(feats)) hp += 2 * level;
  const dwarf = /dwarf/i.test(m.species);
  if (dwarf && (ruleset === "2024" || /hill/i.test(m.lineage ?? ""))) hp += level;
  const draconic = m.classes.find((k) => k.name.toLowerCase() === "sorcerer" && /draconic/i.test(k.subclass ?? ""));
  if (draconic) hp += draconic.level;
  return hp;
}

/** Problems with slots and HP, as crossCheck messages. */
export function rulesCheck(c: Character, ruleset: Ruleset): string[] {
  const errs: string[] = [];
  const at = `${c.id}:`;
  const hp = expectedHp(c, ruleset);
  if (c.mech.hp !== hp) errs.push(`${at} HP ${c.mech.hp}, but hit dice and Con give ${hp}`);

  const sc = c.mech.spellcasting;
  const slots = expectedSlots(c, ruleset);
  const have = sc?.slots ?? [];
  if (slots.length || have.length) {
    if (have.join(",") !== slots.join(","))
      errs.push(`${at} spell slots [${have.join(", ")}], but the class table gives [${slots.join(", ")}]`);
  }
  const warlock = c.mech.classes.find((k) => k.name.toLowerCase() === "warlock");
  const pact = warlock ? pactSlots(warlock.level) : null;
  if (pact && (sc?.pact?.count !== pact.count || sc?.pact?.level !== pact.level))
    errs.push(`${at} pact magic should be ${pact.count} slots of level ${pact.level}`);
  if (!pact && sc?.pact) errs.push(`${at} pact slots without warlock levels`);

  if (sc) {
    // Feats like Magic Initiate grant a 1st-level spell to anyone.
    const top = Math.max(slots.length, pact?.level ?? 0, 1);
    for (const sp of sc.spells)
      if (sp.level > top) errs.push(`${at} ${sp.name} is level ${sp.level}, above their highest slot (${top})`);
  }
  return errs;
}
