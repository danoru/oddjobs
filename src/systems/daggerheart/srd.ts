import type { ClassName, Domain, Trait } from "./schema";

/**
 * The rules tables Daggerheart characters are checked against, from the
 * Daggerheart System Reference Document 1.0 (Darrington Press, under the
 * Darrington Press Community Gaming License; see docs/SYSTEMS.md). Names and
 * numbers are the SRD's; every line of rules text here is our own short
 * paraphrase, not the SRD's wording. A correction is one edit in this file.
 */

/**
 * The notice the DPCGL asks a product to carry (DPCGL §4.1, the SRD 1.0 wording),
 * plus the link to the licence and whether we changed anything. Shown on every
 * Daggerheart sheet, printable and job page.
 */
export const SRD_NOTICE =
  "This product includes materials from the Daggerheart System Reference Document 1.0, © Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others.";
export const LICENSE_URL = "https://darringtonpress.com/license";
export const MODIFIED_NOTE =
  "We modified it: rules text here is paraphrased in our own words; the names and numbers are the SRD's. Daggerheart™ Compatible. Not affiliated with or endorsed by Darrington Press or Critical Role.";

// ---- Classes -------------------------------------------------------------------------
// Source: SRD 1.0, "Classes" (each class's domains, starting Evasion and Hit Points,
// subclasses and their Spellcast traits, Hope feature).

export interface ClassInfo {
  domains: [Domain, Domain];
  evasion: number;
  hp: number;
  /** Subclass → its Spellcast trait (null when the subclass doesn't cast). */
  subclasses: Record<string, Trait | null>;
  hopeFeature: { name: string; gist: string };
}

export const CLASS_INFO: Record<ClassName, ClassInfo> = {
  Bard: {
    domains: ["Grace", "Codex"],
    evasion: 10,
    hp: 5,
    subclasses: { Troubadour: "presence", Wordsmith: "presence" },
    hopeFeature: { name: "Make a Scene", gist: "Spend 3 Hope to throw a target within Close range off balance: their Difficulty drops by 2 for the next attack against them." },
  },
  Druid: {
    domains: ["Sage", "Arcana"],
    evasion: 10,
    hp: 6,
    subclasses: { "Warden of the Elements": "instinct", "Warden of Renewal": "instinct" },
    hopeFeature: { name: "Evolution", gist: "Spend 3 Hope to take a beast form without marking Stress, and raise one trait by 1 while you hold it." },
  },
  Guardian: {
    domains: ["Valor", "Blade"],
    evasion: 9,
    hp: 7,
    subclasses: { Stalwart: null, Vengeance: null },
    hopeFeature: { name: "Frontline Tank", gist: "Spend 3 Hope to clear 2 Armor Slots." },
  },
  Ranger: {
    domains: ["Bone", "Sage"],
    evasion: 12,
    hp: 6,
    subclasses: { Beastbound: "agility", Wayfinder: "agility" },
    hopeFeature: { name: "Hold Them Off", gist: "Spend 3 Hope when a weapon attack hits to use the same roll against two more adversaries in range." },
  },
  Rogue: {
    domains: ["Midnight", "Grace"],
    evasion: 12,
    hp: 6,
    subclasses: { Nightwalker: "finesse", Syndicate: "finesse" },
    hopeFeature: { name: "Rogue's Dodge", gist: "Spend 3 Hope for +2 Evasion until an attack next hits you or you rest." },
  },
  Seraph: {
    domains: ["Splendor", "Valor"],
    evasion: 9,
    hp: 7,
    subclasses: { "Divine Wielder": "strength", "Winged Sentinel": "strength" },
    hopeFeature: { name: "Life Support", gist: "Spend 3 Hope to clear a Hit Point on an ally within Close range." },
  },
  Sorcerer: {
    domains: ["Arcana", "Midnight"],
    evasion: 10,
    hp: 6,
    subclasses: { "Elemental Origin": "instinct", "Primal Origin": "instinct" },
    hopeFeature: { name: "Volatile Magic", gist: "Spend 3 Hope to reroll any of the damage dice of a magic attack." },
  },
  Warrior: {
    domains: ["Blade", "Bone"],
    evasion: 11,
    hp: 6,
    subclasses: { "Call of the Brave": null, "Call of the Slayer": null },
    hopeFeature: { name: "No Mercy", gist: "Spend 3 Hope for +1 to attack rolls until your next rest." },
  },
  Wizard: {
    domains: ["Codex", "Splendor"],
    evasion: 11,
    hp: 5,
    subclasses: { "School of Knowledge": "knowledge", "School of War": "knowledge" },
    hopeFeature: { name: "Not This Time", gist: "Spend 3 Hope to make an adversary within Far range reroll an attack or damage roll." },
  },
};

// ---- Character creation ------------------------------------------------------------------
// Source: SRD 1.0, "Character Creation" and "Core Mechanics".

/** The six trait modifiers a new character spreads across their traits, in any order. */
export const TRAIT_SPREAD = [2, 1, 1, 0, 0, -1] as const;
export const STARTING_STRESS = 6;
export const STARTING_HOPE = 2;
export const MAX_HOPE = 6;
export const MAX_FEAR = 12;
export const MAX_LOADOUT = 5;
export const STARTING_EXPERIENCES = { count: 2, bonus: 2 } as const;
/** Hope it costs to add an Experience to a roll. */
export const EXPERIENCE_COST = 1;

export const ANCESTRIES = [
  "Clank",
  "Drakona",
  "Dwarf",
  "Elf",
  "Faerie",
  "Faun",
  "Firbolg",
  "Fungril",
  "Galapa",
  "Giant",
  "Goblin",
  "Halfling",
  "Human",
  "Infernis",
  "Katari",
  "Orc",
  "Ribbet",
  "Simiah",
] as const;

export const COMMUNITIES = [
  "Highborne",
  "Loreborne",
  "Orderborne",
  "Ridgeborne",
  "Seaborne",
  "Slyborne",
  "Underborne",
  "Wanderborne",
  "Wildborne",
] as const;

// ---- Armor ---------------------------------------------------------------------------------
// Source: SRD 1.0, "Armor Tables", Tier 1. Thresholds are the base before level is added.

export interface ArmorInfo {
  name: string;
  major: number;
  severe: number;
  score: number;
  evasionMod: number;
  feature?: string;
}

export const ARMOR: ArmorInfo[] = [
  { name: "Gambeson Armor", major: 5, severe: 11, score: 3, evasionMod: 1, feature: "Flexible: +1 to Evasion." },
  { name: "Leather Armor", major: 6, severe: 13, score: 3, evasionMod: 0 },
  { name: "Chainmail Armor", major: 7, severe: 15, score: 4, evasionMod: -1, feature: "Heavy: −1 to Evasion." },
  { name: "Full Plate Armor", major: 8, severe: 17, score: 4, evasionMod: -2, feature: "Very heavy: −2 to Evasion and −1 to Agility." },
];

// ---- Weapons -------------------------------------------------------------------------------
// Source: SRD 1.0, "Weapon Tables", Tier 1 primary and secondary weapons (p45, p51), with the
// 2025 errata from daggerheart.com/srd: Longsword d10+3, Spear d8+3 with no feature, Glowing Rings d10+2.

export interface WeaponInfo {
  name: string;
  slot: "primary" | "secondary";
  trait: Trait;
  range: "Melee" | "Very Close" | "Close" | "Far" | "Very Far";
  die: "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
  mod: number;
  damageType: "physical" | "magic";
  burden: "one-handed" | "two-handed";
  feature?: string;
}

const w = (
  name: string,
  slot: WeaponInfo["slot"],
  trait: Trait,
  range: WeaponInfo["range"],
  dmg: string,
  damageType: WeaponInfo["damageType"],
  burden: WeaponInfo["burden"],
  feature?: string,
): WeaponInfo => {
  const [, die, mod] = dmg.match(/^(d\d+)(?:\+(\d+))?$/)!;
  return { name, slot, trait, range, die: die as WeaponInfo["die"], mod: Number(mod ?? 0), damageType, burden, ...(feature ? { feature } : {}) };
};

export const WEAPONS: WeaponInfo[] = [
  w("Broadsword", "primary", "agility", "Melee", "d8", "physical", "one-handed", "Reliable: +1 to attack rolls."),
  w("Longsword", "primary", "agility", "Melee", "d10+3", "physical", "two-handed"),
  w("Battleaxe", "primary", "strength", "Melee", "d10+3", "physical", "two-handed"),
  w("Greatsword", "primary", "strength", "Melee", "d10+3", "physical", "two-handed", "Massive: −1 to Evasion; roll an extra damage die and drop the lowest."),
  w("Mace", "primary", "strength", "Melee", "d8+1", "physical", "one-handed"),
  w("Warhammer", "primary", "strength", "Melee", "d12+3", "physical", "two-handed", "Heavy: −1 to Evasion."),
  w("Dagger", "primary", "finesse", "Melee", "d8+1", "physical", "one-handed"),
  w("Quarterstaff", "primary", "instinct", "Melee", "d10+3", "physical", "two-handed"),
  w("Cutlass", "primary", "presence", "Melee", "d8+1", "physical", "one-handed"),
  w("Rapier", "primary", "presence", "Melee", "d8", "physical", "one-handed", "Quick: mark a Stress to hit one more target in range."),
  w("Halberd", "primary", "strength", "Very Close", "d10+2", "physical", "two-handed", "Cumbersome: −1 to Finesse."),
  w("Spear", "primary", "finesse", "Very Close", "d8+3", "physical", "two-handed"),
  w("Shortbow", "primary", "agility", "Far", "d6+3", "physical", "two-handed"),
  w("Crossbow", "primary", "finesse", "Far", "d6+1", "physical", "one-handed"),
  w("Longbow", "primary", "agility", "Very Far", "d8+3", "physical", "two-handed", "Cumbersome: −1 to Finesse."),
  w("Arcane Gauntlets", "primary", "strength", "Melee", "d10+3", "magic", "two-handed"),
  w("Hallowed Axe", "primary", "strength", "Melee", "d8+1", "magic", "one-handed"),
  w("Glowing Rings", "primary", "agility", "Very Close", "d10+2", "magic", "two-handed"),
  w("Hand Runes", "primary", "instinct", "Very Close", "d10", "magic", "one-handed"),
  w("Returning Blade", "primary", "finesse", "Close", "d8", "magic", "one-handed", "Returning: comes back to your hand after a throw."),
  w("Shortstaff", "primary", "instinct", "Close", "d8+1", "magic", "one-handed"),
  w("Dualstaff", "primary", "instinct", "Far", "d6+3", "magic", "two-handed"),
  w("Scepter", "primary", "presence", "Far", "d6", "magic", "two-handed", "Versatile: also a Melee weapon (Presence, d8)."),
  w("Wand", "primary", "knowledge", "Far", "d6+1", "magic", "one-handed"),
  w("Greatstaff", "primary", "knowledge", "Very Far", "d6", "magic", "two-handed", "Powerful: roll an extra damage die and drop the lowest."),
  w("Shortsword", "secondary", "agility", "Melee", "d8", "physical", "one-handed", "Paired: +2 to your primary weapon's damage against a target in Melee range."),
  w("Round Shield", "secondary", "strength", "Melee", "d4", "physical", "one-handed", "Protective: +1 to Armor Score."),
  w("Tower Shield", "secondary", "strength", "Melee", "d6", "physical", "one-handed", "Barrier: +2 to Armor Score, −1 to Evasion."),
  w("Small Dagger", "secondary", "finesse", "Melee", "d8", "physical", "one-handed", "Paired: +2 to your primary weapon's damage against a target in Melee range."),
  w("Whip", "secondary", "presence", "Very Close", "d6", "physical", "one-handed", "Startling: mark a Stress to drive adversaries in Melee back to Close range."),
  w("Grappler", "secondary", "finesse", "Close", "d6", "physical", "one-handed", "Hooked: on a hit, you may pull the target into Melee range."),
  w("Hand Crossbow", "secondary", "finesse", "Far", "d6+1", "physical", "one-handed"),
];

// ---- Domain cards ------------------------------------------------------------------------
// Source: SRD 1.0, "Domains" (card names, levels, types and Recall costs). The gists are
// ours: a reminder of what the card does at the table, not its text.

export type CardType = "ability" | "spell" | "grimoire";

export interface DomainCardInfo {
  name: string;
  domain: Domain;
  level: number;
  type: CardType;
  recall: number;
  gist: string;
}

const card = (domain: Domain, name: string, type: CardType, recall: number, gist: string, level = 1): DomainCardInfo => ({ name, domain, level, type, recall, gist });

export const DOMAIN_CARDS: DomainCardInfo[] = [
  card("Arcana", "Rune Ward", "spell", 0, "Turn a keepsake into a ward. Whoever holds it can spend a Hope to cut incoming damage by a d8; on an 8 it goes quiet until your next rest."),
  card("Arcana", "Unleash Chaos", "spell", 1, "Keep a pool of tokens on this card. Spend them on a Spellcast roll against a target in Far range: on a hit, a d10 of magic damage per token spent. Mark Stress to refill the pool."),
  card("Arcana", "Wall Walk", "spell", 1, "Spend a Hope to let a creature you touch walk up walls and across ceilings for the rest of the scene."),
  card("Blade", "Get Back Up", "ability", 1, "When Severe damage hits you, mark a Stress to take it down a step."),
  card("Blade", "Not Good Enough", "ability", 1, "When you roll damage dice, reroll any 1s and 2s."),
  card("Blade", "Whirlwind", "ability", 0, "After a hit on a target in Very Close range, spend a Hope to sweep everyone else in Very Close range for half damage."),
  card("Bone", "Deft Maneuvers", "ability", 0, "Once a rest, mark a Stress to dash anywhere within Far range without rolling; +1 to an attack right after."),
  card("Bone", "I See It Coming", "ability", 1, "When a ranged attack targets you, mark a Stress to add a d4 to your Evasion against it."),
  card("Bone", "Untouchable", "ability", 1, "Add half your Agility to your Evasion, always."),
  card("Codex", "Book of Ava", "grimoire", 2, "A grimoire of three small workings: a blast of force that throws a foe back, a touch that hardens an ally's armor, and a conjured spike of ice."),
  card("Codex", "Book of Illiat", "grimoire", 2, "A grimoire of three: magical sleep, a Hope-fuelled barrage of bolts, and a voice in another's head."),
  card("Codex", "Book of Tyfar", "grimoire", 2, "A grimoire of three: a burst of flame up close, a spectral hand that fetches and carries, and a cloud of concealing fog."),
  card("Grace", "Deft Deceiver", "ability", 0, "Spend a Hope for advantage when you lie to someone or trick them."),
  card("Grace", "Enrapture", "spell", 0, "Make a Spellcast roll against a target in Close range: on a hit, their attention is fixed on you; once a rest you can make them mark a Stress too."),
  card("Grace", "Inspirational Words", "ability", 1, "After a long rest, put tokens equal to your Presence here. While you talk to an ally, spend one so they clear a Hit Point, clear a Stress or gain a Hope."),
  card("Midnight", "Pick and Pull", "ability", 0, "Advantage on rolls to pick a lock, disarm a trap or lift something from a pocket."),
  card("Midnight", "Rain of Blades", "spell", 1, "Spend a Hope and make a Spellcast roll: conjured knives hit everything you choose in Very Close range, harder against the Vulnerable."),
  card("Midnight", "Uncanny Disguise", "spell", 0, "Mark a Stress to take the look of any humanoid you can picture, for a few actions, with advantage against anyone looking closely."),
  card("Sage", "Gifted Tracker", "ability", 0, "When you follow a trail, spend Hope to ask the GM that many questions about it; +1 Evasion against whoever you tracked."),
  card("Sage", "Nature's Tongue", "ability", 0, "Talk with plants and animals. In the wild, spend a Hope for +2 on a Spellcast roll."),
  card("Sage", "Vicious Entangle", "spell", 1, "Make a Spellcast roll against a target in Far range: on a hit, roots deal damage and hold them Restrained; spend a Hope to catch a second foe nearby."),
  card("Splendor", "Bolt Beacon", "spell", 1, "Make a Spellcast roll against a target in Far range and spend a Hope on a hit: a bolt of light hurts them and leaves them glowing and Vulnerable."),
  card("Splendor", "Mending Touch", "spell", 1, "Spend a few minutes and 2 Hope with someone to clear a Hit Point or a Stress; once a long rest, share a personal moment to mend more."),
  card("Splendor", "Reassurance", "ability", 0, "Once a rest, after an ally rolls, let them reroll."),
  card("Valor", "Bare Bones", "ability", 0, "While you wear no armor, your base Armor Score is 3 plus your Strength, and your thresholds are fixed by tier (9/19 at tier 1)."),
  card("Valor", "Forceful Push", "ability", 0, "Attack a target in Melee range: on a hit they take damage and fly back to Close range (more damage with Hope); spend a Hope to make them Vulnerable."),
  card("Valor", "I Am Your Shield", "ability", 1, "When an ally in Very Close range would be hit, mark a Stress to take it in their place, and mark any number of Armor Slots against it."),
];

export const cardInfo = (name: string): DomainCardInfo | undefined => DOMAIN_CARDS.find((c) => c.name === name);
