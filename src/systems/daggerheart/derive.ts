import { TRAITS, type Character, type Mech, type Trait, type Weapon } from "./schema";
import { CLASS_INFO, MAX_HOPE, STARTING_STRESS, cardInfo, type DomainCardInfo } from "./srd";
import type { SheetLimits } from "./live";

/**
 * Numbers a Daggerheart sheet shows that follow from the rules: what Evasion,
 * Hit Points, Stress, Armor and the damage thresholds should be (the authored
 * values are checked against these), the Spellcast trait, and each weapon's
 * attack and damage line.
 */

export const TRAIT_NAMES: Record<Trait, string> = {
  agility: "Agility",
  strength: "Strength",
  finesse: "Finesse",
  instinct: "Instinct",
  presence: "Presence",
  knowledge: "Knowledge",
};

/** What each trait is for, in a few words, for the sheet. */
export const TRAIT_USES: Record<Trait, string> = {
  agility: "sprint, leap, maneuver",
  strength: "lift, smash, grapple",
  finesse: "control, hide, tinker",
  instinct: "perceive, sense, navigate",
  presence: "charm, perform, deceive",
  knowledge: "recall, analyze, comprehend",
};

/** "+2", "−1", "+0". */
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

export interface Expected {
  evasion: number;
  hp: number;
  stress: number;
  armorScore: number;
  thresholds: { major: number; severe: number };
}

/**
 * What the rules make of a character's class, armor, level and bonuses.
 * Thresholds are the armor's base plus level; with no armor, Major is the
 * level and Severe twice it.
 */
export function expected(m: Pick<Mech, "class" | "level" | "armor" | "bonuses">): Expected {
  const k = CLASS_INFO[m.class];
  const b = m.bonuses ?? {};
  const t = b.thresholds ?? 0;
  return {
    evasion: k.evasion + (m.armor?.evasionMod ?? 0) + (b.evasion ?? 0),
    hp: k.hp + (b.hp ?? 0),
    stress: STARTING_STRESS + (b.stress ?? 0),
    armorScore: (m.armor?.score ?? 0) + (b.armor ?? 0),
    thresholds: m.armor
      ? { major: m.armor.major + m.level + t, severe: m.armor.severe + m.level + t }
      : { major: m.level + t, severe: 2 * m.level + t },
  };
}

/** The trait a subclass casts with, or null. */
export function spellcastTrait(m: Pick<Mech, "class" | "subclass">): Trait | null {
  return CLASS_INFO[m.class]?.subclasses[m.subclass] ?? null;
}

export interface WeaponLine {
  name: string;
  slot: Weapon["slot"];
  trait: Trait;
  /** The attack roll's modifier: the trait. */
  attack: number;
  /** "2d8+1": Proficiency dice. */
  damage: string;
  dice: { count: number; sides: number; mod: number };
  range: Weapon["range"];
  damageType: Weapon["damageType"];
  burden: Weapon["burden"];
  feature?: string;
}

export function weaponLine(m: Pick<Mech, "traits" | "proficiency">, w: Weapon): WeaponLine {
  const count = Math.max(1, m.proficiency);
  const sides = Number(w.die.slice(1));
  return {
    name: w.name,
    slot: w.slot,
    trait: w.trait,
    attack: m.traits[w.trait],
    damage: `${count}${w.die}${w.mod ? (w.mod > 0 ? `+${w.mod}` : `${w.mod}`) : ""}`,
    dice: { count, sides, mod: w.mod },
    range: w.range,
    damageType: w.damageType,
    burden: w.burden,
    ...(w.feature ? { feature: w.feature } : {}),
  };
}

export interface Derived {
  spellcast: Trait | null;
  weapons: WeaponLine[];
  loadout: (DomainCardInfo & { note?: string })[];
  vault: (DomainCardInfo & { note?: string })[];
  /** Cards the SRD table doesn't know (the checks stop these reaching a build). */
  unknownCards: string[];
  maxHope: number;
  hopeFeature: { name: string; gist: string } | null;
  domains: string[];
}

export function derive(c: Pick<Character, "mech">): Derived {
  const m = c.mech;
  const known = m.domainCards.flatMap((r) => {
    const info = cardInfo(r.name);
    return info ? [{ ...info, ...(r.note ? { note: r.note } : {}), where: r.where }] : [];
  });
  return {
    spellcast: spellcastTrait(m),
    weapons: m.weapons.map((w) => weaponLine(m, w)),
    loadout: known.filter((x) => x.where === "loadout"),
    vault: known.filter((x) => x.where === "vault"),
    unknownCards: m.domainCards.filter((r) => !cardInfo(r.name)).map((r) => r.name),
    maxHope: MAX_HOPE,
    hopeFeature: CLASS_INFO[m.class]?.hopeFeature ?? null,
    domains: CLASS_INFO[m.class]?.domains ?? [],
  };
}

/** "Rogue · Syndicate · level 1". */
export const classLine = (c: Pick<Character, "mech">) => `${c.mech.class} · ${c.mech.subclass}`;

/** "1 handful", "2 bags and 3 handfuls". */
export function goldWords(g: Mech["gold"]): string {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  const parts = [part(g.chests, "chest", "chests"), part(g.bags, "bag", "bags"), part(g.handfuls, "handful", "handfuls")].filter(Boolean);
  return parts.length ? parts.join(", ") : "none";
}

/** Each character's slots and Experiences, for the table's tallies (src/systems/daggerheart/live.ts). */
export function sheetLimits(cast: readonly Pick<Character, "id" | "mech">[]): Record<string, SheetLimits> {
  return Object.fromEntries(
    cast.map((c) => [c.id, { hp: c.mech.hp, stress: c.mech.stress, armor: c.mech.armorScore, experiences: c.mech.experiences.map((x) => ({ name: x.name, bonus: x.bonus })) }]),
  );
}

/** Which threshold some damage reaches: 1, 2 or 3 Hit Points (0 for none). */
export function hpFor(damage: number, th: { major: number; severe: number }): number {
  if (damage <= 0) return 0;
  return damage >= th.severe ? 3 : damage >= th.major ? 2 : 1;
}

export { TRAITS };
