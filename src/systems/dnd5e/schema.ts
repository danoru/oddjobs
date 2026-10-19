import { z } from "zod";
import { coreCharacterFields, coreOneShotFields, id, tieSchema } from "@/lib/coreSchema";

/**
 * D&D 5e (2014 and 2024): the one-shot, its characters' mechanics, sanctioned
 * swaps and the spell book for the cards. The shared parts are in
 * src/lib/coreSchema.ts.
 */

// ---- 5e vocab ---------------------------------------------------------

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
} as const satisfies Record<string, Ability>;
export type Skill = keyof typeof SKILLS;
const skillKeys = Object.keys(SKILLS) as [Skill, ...Skill[]];

const ability = z.enum(ABILITIES);
const skill = z.enum(skillKeys);

// ---- Mechanics ------------------------------------------------------------

export const spellSchema = z.object({
  name: z.string(),
  level: z.number().int().min(0).max(9),
  /** Always prepared / granted by a feature (doesn't count against prep). */
  always: z.boolean().optional(),
  note: z.string().optional(),
  /** Customization slot this entry belongs to (see `options`). */
  option: id.optional(),
});

export const attackSchema = z.object({
  name: z.string(),
  kind: z.enum(["weapon", "spell"]),
  ability: ability,
  /** Saving-throw spells/effects: target saves against the spell DC instead of an attack roll. */
  save: ability.optional(),
  proficient: z.boolean().default(true),
  /** Damage dice, e.g. "1d8" or "2d6". */
  dice: z.string().regex(/^\d+d\d+(\s*\+\s*\d+d\d+)*$/),
  damageType: z.string(),
  /** Add the ability modifier to damage (false for most cantrips, off-hand). */
  addMod: z.boolean().default(true),
  magicBonus: z.number().int().default(0),
  range: z.string().optional(),
  properties: z.array(z.string()).default([]),
  /** 2024 weapon mastery property, if the character has it. */
  mastery: z.string().optional(),
  note: z.string().optional(),
  option: id.optional(),
});

export const featureSchema = z.object({
  name: z.string(),
  source: z.enum(["class", "subclass", "species", "background", "feat", "item", "other"]),
  text: z.string(),
  uses: z
    .object({ max: z.number().int().positive(), per: z.enum(["short", "long", "day", "turn"]) })
    .optional(),
  option: id.optional(),
});

export const equipmentSchema = z.object({
  name: z.string(),
  qty: z.number().int().positive().default(1),
  equipped: z.boolean().optional(),
  note: z.string().optional(),
  option: id.optional(),
});

export const classEntrySchema = z.object({
  name: z.string(),
  subclass: z.string().optional(),
  level: z.number().int().min(1).max(20),
  /** Override when the class isn't in the built-in hit-die table. */
  hitDie: z.number().int().optional(),
});

export const mechSchema = z.object({
  species: z.string(),
  /** e.g. "Variant Human", "Hill Dwarf", "Wood Elf" — shown after species. */
  lineage: z.string().optional(),
  size: z.enum(["Small", "Medium"]).default("Medium"),
  background: z.string(),
  classes: z.array(classEntrySchema).min(1),
  abilities: z.record(ability, z.number().int().min(1).max(30)),
  saves: z.array(ability),
  skills: z.array(skill),
  expertise: z.array(skill).default([]),
  jackOfAllTrades: z.boolean().default(false),
  hp: z.number().int().positive(),
  ac: z.object({ value: z.number().int(), note: z.string() }),
  speed: z.number().int().default(30),
  initiativeBonus: z.number().int().default(0),
  senses: z.array(z.string()).default([]),
  languages: z.array(z.string()),
  tools: z.array(z.string()).default([]),
  armorTraining: z.array(z.string()).default([]),
  weaponTraining: z.array(z.string()).default([]),
  /** 2024 only: the background's origin feat. */
  originFeat: z.string().optional(),
  feats: z.array(z.string()).default([]),
  weaponMasteries: z.array(z.string()).default([]),
  features: z.array(featureSchema),
  attacks: z.array(attackSchema).default([]),
  spellcasting: z
    .object({
      ability: ability,
      /** Slots per spell level, index 0 = 1st level. Pact slots go in `pact`. */
      slots: z.array(z.number().int().min(0)).max(9).default([]),
      pact: z.object({ count: z.number().int(), level: z.number().int() }).optional(),
      spells: z.array(spellSchema),
      note: z.string().optional(),
    })
    .optional(),
  equipment: z.array(equipmentSchema),
  gold: z.number().min(0).default(0),
});

// ---- Story ----------------------------------------------------------------

export const storySchema = z.object({
  pronouns: z.string(),
  age: z.string().optional(),
  appearance: z.string(),
  /** Who they are, in a paragraph. */
  concept: z.string(),
  /** Why *this* adventure matters to them. */
  stake: z.string(),
  goal: z.string(),
  /** Private to the player who claims them. */
  secret: z.string(),
  voice: z.string(),
  mannerisms: z.array(z.string()).min(1),
  trinket: z.string().optional(),
  ties: z
    .array(tieSchema)
    .min(1),
  /** A line the player can read aloud to introduce themselves. */
  intro: z.string().optional(),
});

// ---- Customization ---------------------------------------------------------

const choiceBase = { id, label: z.string() };
export const optionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("spell"),
    id,
    label: z.string(),
    choices: z
      .array(
        z.object({
          ...choiceBase,
          value: spellSchema.omit({ option: true }),
          /** The attack line this spell puts on the sheet, if any (replaces any attack tagged with the option). */
          attack: attackSchema.omit({ option: true }).optional(),
        }),
      )
      .min(2),
  }),
  z.object({
    kind: z.literal("attack"),
    id,
    label: z.string(),
    choices: z.array(z.object({ ...choiceBase, value: attackSchema.omit({ option: true }) })).min(2),
  }),
  z.object({
    kind: z.literal("equipment"),
    id,
    label: z.string(),
    choices: z.array(z.object({ ...choiceBase, value: equipmentSchema.omit({ option: true }) })).min(2),
  }),
  z.object({
    kind: z.literal("feature"),
    id,
    label: z.string(),
    choices: z.array(z.object({ ...choiceBase, value: featureSchema.omit({ option: true }) })).min(2),
  }),
  z.object({
    kind: z.literal("trinket"),
    id,
    label: z.string(),
    choices: z.array(z.object({ ...choiceBase, value: z.string() })).min(2),
  }),
]);

// ---- Top-level documents ----------------------------------------------------

export const characterSchema = z.object({
  ...coreCharacterFields,
  /** Party role tags for balance hints. */
  roles: z.array(z.enum(["face", "healer", "scout", "striker", "tank", "control", "support", "utility"])).min(1),
  story: storySchema,
  mech: mechSchema,
  options: z.array(optionSchema).default([]),
});

export const oneShotSchema = z.object({
  ...coreOneShotFields,
  system: z.literal("dnd5e"),
  ruleset: z.enum(["2014", "2024"]),
  level: z.number().int().min(1).max(20),
  /**
   * The same story at other levels. Each level has one file per character in
   * variants/<level>/<id>.json holding that level's mechanics.
   */
  variants: z
    .array(z.object({ level: z.number().int().min(1).max(20), note: z.string().max(140).optional() }))
    .default([]),
});

/** A character's mechanics at another level: content/oneshots/<slug>/variants/<level>/<id>.json. */
export const variantCharacterSchema = z.object({
  id,
  mech: mechSchema,
  /** Replaces the base options at this level; leave out to keep them. Keep ids the same so saved tweaks carry over. */
  options: z.array(optionSchema).optional(),
});

// ---- Rules reference for cards ------------------------------------------------

const spellInfoFields = {
  level: z.number().int().min(0).max(9),
  school: z.enum([
    "abjuration",
    "conjuration",
    "divination",
    "enchantment",
    "evocation",
    "illusion",
    "necromancy",
    "transmutation",
  ]),
  /** "Action", "Bonus Action", "Reaction", "1 minute"… */
  time: z.string().max(40),
  /** "Self", "Touch", "60 ft", "Self (15-ft cone)"… */
  range: z.string().max(40),
  /** "V, S, M (a pinch of salt)". */
  components: z.string().max(90),
  duration: z.string().max(40),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  /** What it does at the table, in our own words. Never book text. */
  text: z.string().min(20).max(300),
  /** Casting it with a higher slot, or how a cantrip grows. */
  higher: z.string().max(130).optional(),
};

/**
 * One spell for the card printables (content/rules/spells.json, keyed by
 * name). The base fields follow the 2024 rules; a "2014" block lists only what
 * differs under 2014, and a "2024" block the reverse when the base is 2014.
 */
export const spellInfoSchema = z.object({
  ...spellInfoFields,
  "2014": z.object(spellInfoFields).partial().optional(),
  "2024": z.object(spellInfoFields).partial().optional(),
});
export const spellBookSchema = z.record(z.string(), spellInfoSchema);

export type Spell = z.infer<typeof spellSchema>;
export type Attack = z.infer<typeof attackSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type Mech = z.infer<typeof mechSchema>;
export type Story = z.infer<typeof storySchema>;
export type CustomOption = z.infer<typeof optionSchema>;
export type Character = z.infer<typeof characterSchema>;
export type OneShot = z.infer<typeof oneShotSchema>;
export type Ruleset = OneShot["ruleset"];
export type VariantCharacter = z.infer<typeof variantCharacterSchema>;
export type SpellInfo = z.infer<typeof spellInfoSchema>;

/** A declared level variant with each character's mechanics at that level. */
export type LevelVariant = OneShot["variants"][number] & { cast: VariantCharacter[] };

/** A 5e one-shot with its cast (at the base level) and level variants loaded and cross-checked. */
export type OneShotWithCast = Omit<OneShot, "variants"> & { cast: Character[]; variants: LevelVariant[] };
