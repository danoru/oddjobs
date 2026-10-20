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
  name: z.string().describe("Spell"),
  level: z.number().int().min(0).max(9).describe("Level (0 = cantrip)"),
  /** Always prepared / granted by a feature (doesn't count against prep). */
  always: z.boolean().optional().describe("Always prepared"),
  note: z.string().optional().describe("Note"),
  /** Customization slot this entry belongs to (see `options`). */
  option: id.optional().describe("Customization option id"),
});

export const attackSchema = z.object({
  name: z.string().describe("Name"),
  kind: z.enum(["weapon", "spell"]).describe("Kind"),
  ability: ability.describe("Ability"),
  /** Saving-throw spells/effects: target saves against the spell DC instead of an attack roll. */
  save: ability.optional().describe("Target saves with (instead of an attack roll)"),
  proficient: z.boolean().default(true).describe("Proficient"),
  /** Damage dice, e.g. "1d8" or "2d6". */
  dice: z.string().regex(/^\d+d\d+(\s*\+\s*\d+d\d+)*$/, "damage dice look like 1d8 or 2d6 + 1d4").describe("Damage dice"),
  damageType: z.string().describe("Damage type"),
  /** Add the ability modifier to damage (false for most cantrips, off-hand). */
  addMod: z.boolean().default(true).describe("Add ability modifier to damage"),
  magicBonus: z.number().int().default(0).describe("Magic bonus"),
  range: z.string().optional().describe("Range"),
  properties: z.array(z.string()).default([]).describe("Properties"),
  /** 2024 weapon mastery property, if the character has it. */
  mastery: z.string().optional().describe("Mastery (2024)"),
  note: z.string().optional().describe("Note"),
  option: id.optional().describe("Customization option id"),
});

export const featureSchema = z.object({
  name: z.string().describe("Name"),
  source: z.enum(["class", "subclass", "species", "background", "feat", "item", "other"]).describe("From"),
  text: z.string().describe("What it does (your own words)"),
  uses: z
    .object({
      max: z.number().int().positive().describe("Uses"),
      per: z.enum(["short", "long", "day", "turn"]).describe("Per"),
    })
    .optional()
    .describe("Limited uses"),
  option: id.optional().describe("Customization option id"),
});

export const equipmentSchema = z.object({
  name: z.string().describe("Item"),
  qty: z.number().int().positive().default(1).describe("Qty"),
  equipped: z.boolean().optional().describe("Equipped"),
  note: z.string().optional().describe("Note"),
  option: id.optional().describe("Customization option id"),
});

export const classEntrySchema = z.object({
  name: z.string().describe("Class"),
  subclass: z.string().optional().describe("Subclass"),
  level: z.number().int().min(1).max(20).describe("Level"),
  /** Override when the class isn't in the built-in hit-die table. */
  hitDie: z.number().int().optional().describe("Hit die (only for classes the table doesn't know)"),
});

export const mechSchema = z.object({
  species: z.string().describe("Species"),
  /** e.g. "Variant Human", "Hill Dwarf", "Wood Elf" — shown after species. */
  lineage: z.string().optional().describe("Lineage (e.g. Hill Dwarf)"),
  size: z.enum(["Small", "Medium"]).default("Medium").describe("Size"),
  background: z.string().describe("Background"),
  classes: z.array(classEntrySchema).min(1).describe("Classes"),
  abilities: z.record(ability, z.number().int().min(1).max(30)).describe("Ability scores"),
  saves: z.array(ability).describe("Saving throw proficiencies"),
  skills: z.array(skill).describe("Skill proficiencies"),
  expertise: z.array(skill).default([]).describe("Expertise"),
  jackOfAllTrades: z.boolean().default(false).describe("Jack of All Trades"),
  hp: z.number().int().positive().describe("Hit points"),
  ac: z.object({ value: z.number().int().describe("Armor Class"), note: z.string().describe("How it adds up") }).describe("Armor Class"),
  speed: z.number().int().default(30).describe("Speed (ft)"),
  initiativeBonus: z.number().int().default(0).describe("Extra initiative bonus"),
  senses: z.array(z.string()).default([]).describe("Senses"),
  languages: z.array(z.string()).describe("Languages"),
  tools: z.array(z.string()).default([]).describe("Tools"),
  armorTraining: z.array(z.string()).default([]).describe("Armor training"),
  weaponTraining: z.array(z.string()).default([]).describe("Weapon training"),
  /** 2024 only: the background's origin feat. */
  originFeat: z.string().optional().describe("Origin feat (2024)"),
  feats: z.array(z.string()).default([]).describe("Feats"),
  weaponMasteries: z.array(z.string()).default([]).describe("Weapon masteries (2024)"),
  features: z.array(featureSchema).describe("Features"),
  attacks: z.array(attackSchema).default([]).describe("Attacks"),
  spellcasting: z
    .object({
      ability: ability.describe("Spellcasting ability"),
      /** Slots per spell level, index 0 = 1st level. Pact slots go in `pact`. */
      slots: z.array(z.number().int().min(0)).max(9).default([]).describe("Spell slots"),
      pact: z
        .object({ count: z.number().int().describe("Pact slots"), level: z.number().int().describe("Slot level") })
        .optional()
        .describe("Pact magic"),
      spells: z.array(spellSchema).describe("Spells"),
      note: z.string().optional().describe("Note"),
    })
    .optional()
    .describe("Spellcasting"),
  equipment: z.array(equipmentSchema).describe("Equipment"),
  gold: z.number().min(0).default(0).describe("Gold (gp)"),
});

// ---- Story ----------------------------------------------------------------

export const storySchema = z.object({
  pronouns: z.string().describe("Pronouns"),
  age: z.string().optional().describe("Age"),
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
  trinket: z.string().optional().describe("Trinket"),
  ties: z
    .array(tieSchema)
    .min(1)
    .describe("Ties"),
  /** A line the player can read aloud to introduce themselves. */
  intro: z.string().optional().describe("Read-aloud introduction"),
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
  roles: z
    .array(z.enum(["face", "healer", "scout", "striker", "tank", "control", "support", "utility"]))
    .min(1)
    .describe("Party roles"),
  story: storySchema,
  mech: mechSchema,
  options: z.array(optionSchema).default([]).describe("Customization options"),
});

export const oneShotSchema = z.object({
  ...coreOneShotFields,
  system: z.literal("dnd5e"),
  ruleset: z.enum(["2014", "2024"]).describe("Ruleset"),
  level: z.number().int().min(1).max(20).describe("Level"),
  /**
   * Homebrew: the cast may break the rules on purpose (a bride with 40 HP, a
   * custom class, three saves). The rules checks (levels, HP, slots, saves,
   * ruleset-only fields) are skipped; the ones that keep pages working stay.
   */
  homebrew: z.boolean().default(false).describe("Homebrew (skip the rules checks)"),
  /**
   * The same story at other levels. Each level has one file per character in
   * variants/<level>/<id>.json holding that level's mechanics.
   */
  variants: z
    .array(
      z.object({
        level: z.number().int().min(1).max(20).describe("Level"),
        note: z.string().max(140).optional().describe("Note on the level stamp"),
      }),
    )
    .default([])
    .describe("Level variants"),
  /**
   * Inspiration coins at the table (src/systems/registry.ts maps them to
   * Heroic Inspiration under 2024 and Inspiration under 2014).
   */
  coins: z
    .object({
      enabled: z.boolean().default(true).describe("Coins at this table"),
      /** What the coin stands for, if not the ruleset's own name. */
      name: z.string().max(40).optional().describe("Coin name (default: the ruleset's)"),
      /** How many coins each player may toss to someone else per act. */
      tossesPerAct: z.number().int().min(0).max(5).default(1).describe("Tosses per player per act"),
    })
    .optional()
    .describe("Inspiration coins"),
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
