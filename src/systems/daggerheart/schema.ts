import { z } from "zod";
import { coreCharacterFields, coreOneShotFields, id, tieSchema } from "@/lib/coreSchema";

/**
 * Daggerheart (Darrington Press): ready-made level-1 casts with the SRD's
 * classes, domains and duality dice. The rules tables these are checked
 * against are in ./srd.ts; the shared parts of the schema are in
 * src/lib/coreSchema.ts.
 *
 * GM-only: `adversaries` (toPublic strips it).
 */

// ---- Daggerheart vocab --------------------------------------------------------------

export const TRAITS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"] as const;
export type Trait = (typeof TRAITS)[number];

export const CLASSES = ["Bard", "Druid", "Guardian", "Ranger", "Rogue", "Seraph", "Sorcerer", "Warrior", "Wizard"] as const;
export type ClassName = (typeof CLASSES)[number];

export const DOMAINS = ["Arcana", "Blade", "Bone", "Codex", "Grace", "Midnight", "Sage", "Splendor", "Valor"] as const;
export type Domain = (typeof DOMAINS)[number];

export const RANGES = ["Melee", "Very Close", "Close", "Far", "Very Far"] as const;
export const DAMAGE_DIE = ["d4", "d6", "d8", "d10", "d12", "d20"] as const;

const trait = z.enum(TRAITS);
const traitValue = z.number().int().min(-3).max(6);

// ---- Mechanics ------------------------------------------------------------------------

export const armorSchema = z.object({
  name: z.string().describe("Armor"),
  /** Base Armor Score: how many Armor Slots it gives. */
  score: z.number().int().min(0).max(12).describe("Base Armor Score"),
  /** Base thresholds before level is added. */
  major: z.number().int().min(1).describe("Base Major threshold"),
  severe: z.number().int().min(1).describe("Base Severe threshold"),
  evasionMod: z.number().int().min(-3).max(3).default(0).describe("Evasion modifier"),
  feature: z.string().optional().describe("Armor feature (your own words)"),
});

export const weaponSchema = z.object({
  name: z.string().describe("Weapon"),
  slot: z.enum(["primary", "secondary"]).default("primary").describe("Slot"),
  trait: trait.describe("Attack trait"),
  range: z.enum(RANGES).describe("Range"),
  /** Damage is Proficiency × this die, plus `mod`. */
  die: z.enum(DAMAGE_DIE).describe("Damage die"),
  mod: z.number().int().min(-5).max(20).default(0).describe("Damage bonus"),
  damageType: z.enum(["physical", "magic"]).describe("Damage type"),
  burden: z.enum(["one-handed", "two-handed"]).describe("Burden"),
  feature: z.string().optional().describe("Weapon feature (your own words)"),
});

export const featureSchema = z.object({
  name: z.string().describe("Name"),
  source: z.enum(["class", "subclass", "ancestry", "community", "item", "other"]).describe("From"),
  /** The class's Hope feature (spend 3 Hope). */
  hope: z.boolean().optional().describe("Hope feature"),
  text: z.string().describe("What it does (your own words)"),
  uses: z
    .object({
      max: z.number().int().positive().describe("Uses"),
      per: z.enum(["rest", "long rest", "session"]).describe("Per"),
    })
    .optional()
    .describe("Limited uses"),
});

export const domainCardRefSchema = z.object({
  /** A card in the SRD table (./srd.ts), by name. */
  name: z.string().describe("Domain card"),
  /** In the loadout (in play, at most five) or the vault (kept, swapped in by paying its Recall cost). */
  where: z.enum(["loadout", "vault"]).default("loadout").describe("Loadout or vault"),
  note: z.string().optional().describe("Note"),
});

export const experienceSchema = z.object({
  name: z.string().max(40, "keep an Experience to a few words").describe("Experience"),
  bonus: z.number().int().min(1).max(6).default(2).describe("Bonus"),
});

export const mechSchema = z.object({
  class: z.enum(CLASSES).describe("Class"),
  subclass: z.string().describe("Subclass"),
  level: z.number().int().min(1).max(10).default(1).describe("Level"),
  ancestry: z.string().describe("Ancestry"),
  community: z.string().describe("Community"),
  traits: z
    .object({
      agility: traitValue.describe("Agility"),
      strength: traitValue.describe("Strength"),
      finesse: traitValue.describe("Finesse"),
      instinct: traitValue.describe("Instinct"),
      presence: traitValue.describe("Presence"),
      knowledge: traitValue.describe("Knowledge"),
    })
    .describe("Traits"),
  evasion: z.number().int().min(0).max(30).describe("Evasion"),
  /** Leave out for no armor. */
  armor: armorSchema.optional().describe("Armor"),
  /** Armor Slots: the armor's base score plus any bonus. */
  armorScore: z.number().int().min(0).max(12).describe("Armor Score (slots)"),
  hp: z.number().int().min(1).max(12).describe("Hit Point slots"),
  stress: z.number().int().min(1).max(12).describe("Stress slots"),
  thresholds: z
    .object({
      major: z.number().int().min(1).describe("Major threshold"),
      severe: z.number().int().min(1).describe("Severe threshold"),
    })
    .describe("Damage thresholds"),
  proficiency: z.number().int().min(1).max(6).default(1).describe("Proficiency"),
  /** Extra numbers from an ancestry, a feature or an item, so the checks know where they come from. */
  bonuses: z
    .object({
      evasion: z.number().int().optional().describe("Evasion bonus"),
      hp: z.number().int().optional().describe("Hit Point bonus"),
      stress: z.number().int().optional().describe("Stress bonus"),
      armor: z.number().int().optional().describe("Armor Score bonus"),
      thresholds: z.number().int().optional().describe("Threshold bonus"),
      cards: z.number().int().optional().describe("Extra domain cards"),
      note: z.string().optional().describe("Where they come from"),
    })
    .default({})
    .describe("Bonuses"),
  experiences: z.array(experienceSchema).describe("Experiences"),
  domainCards: z.array(domainCardRefSchema).describe("Domain cards"),
  weapons: z.array(weaponSchema).default([]).describe("Weapons"),
  features: z.array(featureSchema).default([]).describe("Features"),
  equipment: z
    .array(
      z.object({
        name: z.string().describe("Item"),
        qty: z.number().int().positive().default(1).describe("Qty"),
        note: z.string().optional().describe("Note"),
      }),
    )
    .default([])
    .describe("Inventory"),
  /** Ten handfuls make a bag; ten bags make a chest. */
  gold: z
    .object({
      handfuls: z.number().int().min(0).max(9).default(0).describe("Handfuls"),
      bags: z.number().int().min(0).max(9).default(0).describe("Bags"),
      chests: z.number().int().min(0).default(0).describe("Chests"),
    })
    .default({ handfuls: 1, bags: 0, chests: 0 })
    .describe("Gold"),
});

// ---- Story ------------------------------------------------------------------------------

export const storySchema = z.object({
  pronouns: z.string().describe("Pronouns"),
  appearance: z.string().describe("Appearance"),
  /** Who they are, in a paragraph. */
  concept: z.string().describe("Concept: who they are"),
  /** Why *this* adventure matters to them. */
  stake: z.string().describe("Stake in this adventure"),
  goal: z.string().describe("Goal"),
  /** Private to the player who claims them. */
  secret: z.string().describe("Secret (only the player who claims them sees it)"),
  voice: z.string().describe("Voice"),
  mannerisms: z.array(z.string()).min(1).describe("Mannerisms"),
  /** Background questions, already answered (Daggerheart's way into a character). */
  background: z
    .array(z.object({ question: z.string().describe("Question"), answer: z.string().describe("Answer") }))
    .default([])
    .describe("Background questions"),
  ties: z.array(tieSchema).min(1).describe("Ties"),
  /** A line the player can read aloud to introduce themselves. */
  intro: z.string().optional().describe("Read-aloud introduction"),
});

// ---- GM-only ----------------------------------------------------------------------------

export const ADVERSARY_TYPES = ["Bruiser", "Horde", "Leader", "Minion", "Ranged", "Skulk", "Social", "Solo", "Standard", "Support"] as const;

/** An original adversary for this one-shot. GM-only: toPublic strips the list. */
export const adversarySchema = z.object({
  id,
  name: z.string().describe("Name"),
  type: z.enum(ADVERSARY_TYPES).describe("Type"),
  tier: z.number().int().min(1).max(4).default(1).describe("Tier"),
  description: z.string().max(200).optional().describe("What it is, in a line"),
  motives: z.string().max(160).optional().describe("Motives and tactics"),
  difficulty: z.number().int().min(1).max(30).describe("Difficulty"),
  thresholds: z
    .object({ major: z.number().int().min(1).describe("Major"), severe: z.number().int().min(1).describe("Severe") })
    .optional()
    .describe("Thresholds (none for a minion)"),
  hp: z.number().int().min(1).max(20).describe("HP"),
  stress: z.number().int().min(0).max(12).describe("Stress"),
  attack: z
    .object({
      name: z.string().describe("Attack"),
      mod: z.number().int().min(-5).max(15).describe("Attack modifier (d20)"),
      range: z.enum(RANGES).describe("Range"),
      damage: z.string().regex(/^\d*d\d+(\s*[+-]\s*\d+)?$|^\d+$/, "damage looks like 1d8+2 or 3").describe("Damage"),
      damageType: z.enum(["physical", "magic"]).default("physical").describe("Damage type"),
    })
    .describe("Standard attack"),
  features: z.array(z.object({ name: z.string().describe("Name"), text: z.string().describe("What it does") })).default([]).describe("Features"),
});

// ---- Top-level documents -------------------------------------------------------------

export const characterSchema = z.object({
  ...coreCharacterFields,
  story: storySchema,
  mech: mechSchema,
});

export const oneShotSchema = z.object({
  ...coreOneShotFields,
  system: z.literal("daggerheart"),
  level: z.number().int().min(1).max(10).describe("Level"),
  adversaries: z.array(adversarySchema).default([]).describe("Adversaries (GM only)"),
});

export type Armor = z.infer<typeof armorSchema>;
export type Weapon = z.infer<typeof weaponSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type DomainCardRef = z.infer<typeof domainCardRefSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Mech = z.infer<typeof mechSchema>;
export type Story = z.infer<typeof storySchema>;
export type Adversary = z.infer<typeof adversarySchema>;
export type Character = z.infer<typeof characterSchema>;
export type OneShot = z.infer<typeof oneShotSchema>;
export type OneShotWithCast = OneShot & { cast: Character[] };
