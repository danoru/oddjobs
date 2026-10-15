import { z } from "zod";

// ---- Shared vocab ---------------------------------------------------------

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

export const POSTER_HEADERS = [
  "WANTED",
  "SEEKING",
  "LOST",
  "MISSING",
  "NOTICE",
  "REWARD",
  "HIRING",
] as const;

/** Icon keys the poster can show; mapped to MUI icons in the UI. */
export const POSTER_ICONS = [
  "sword",
  "bow",
  "dagger",
  "shield",
  "flame",
  "music",
  "book",
  "leaf",
  "moon",
  "skull",
  "fist",
  "eye",
  "anchor",
  "crown",
  "potion",
  "paw",
  "ghost",
  "star",
] as const;

const ability = z.enum(ABILITIES);
const skill = z.enum(skillKeys);
const id = z.string().regex(/^[a-z0-9-]+$/, "ids are lowercase-kebab");

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
    .array(
      z.object({
        to: id,
        /** The full tie, as the player reads it on their own sheet. May hold secrets. */
        text: z.string(),
        /** Board-safe version everyone can see, e.g. "old friends from the docks". */
        public: z.string().max(80).optional(),
      }),
    )
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

// ---- Table-play extras -------------------------------------------------------

/** Synthesised sound presets (src/lib/sound/synth.ts), so no audio files need licensing. */
export const SOUND_BEDS = ["storm", "rain", "sea", "wind", "fire", "tavern", "drone", "crowd"] as const;
export const SOUND_STINGERS = [
  "bell",
  "thunder",
  "tide",
  "drowned",
  "door",
  "heartbeat",
  "gong",
  "glass",
  "cheer",
  "whoosh",
] as const;

export const soundsSchema = z.object({
  /** Looping ambience; one plays at a time and they crossfade. */
  beds: z.array(z.object({ id, label: z.string(), preset: z.enum(SOUND_BEDS) })).default([]),
  /** One-shot cues played over the bed. */
  stingers: z.array(z.object({ id, label: z.string(), preset: z.enum(SOUND_STINGERS) })).default([]),
});

/** A sealed handout the GM delivers to one player mid-session. GM-only until delivered. */
export const letterSchema = z.object({
  id,
  /** Character id who receives it. */
  to: id,
  /** Short GM-facing label, e.g. "Who bought the bell". */
  title: z.string(),
  /** When to send it, e.g. "Act 3: the wreck". */
  when: z.string(),
  /** What the player reads after breaking the seal. */
  text: z.string(),
});

/** What the GM does with a character nobody claims tonight. GM-only. */
export const ifUnclaimedSchema = z.object({
  /** How the GM plays them as an NPC (or "absent"). */
  npc: z.string(),
  /** Story beats handed to someone else if they're at the table, first match wins per beat. */
  reassign: z
    .array(z.object({ beat: z.string(), to: z.array(id).min(1), text: z.string() }))
    .default([]),
  /** Scenes or threads that drop out without them. */
  cuts: z.array(z.string()).default([]),
});

// ---- Top-level documents ----------------------------------------------------

export const characterSchema = z.object({
  id,
  name: z.string(),
  /** Display order on the board. */
  order: z.number().int(),
  poster: z.object({
    header: z.enum(POSTER_HEADERS),
    /** Shown instead of the name on the poster, e.g. "????" for a mystery role. */
    alias: z.string().optional(),
    epithet: z.string(),
    hook: z.string().max(90, "keep the poster hook short"),
    reward: z.string().optional(),
    icon: z.enum(POSTER_ICONS),
  }),
  portrait: z.string().optional(),
  /** Party role tags for balance hints. */
  roles: z.array(z.enum(["face", "healer", "scout", "striker", "tank", "control", "support", "utility"])).min(1),
  story: storySchema,
  mech: mechSchema,
  options: z.array(optionSchema).default([]),
  /** Session-zero question the player answers in a sentence before play. */
  flashback: z.string().optional(),
  ifUnclaimed: ifUnclaimedSchema.optional(),
});

export const oneShotSchema = z.object({
  slug: id,
  title: z.string(),
  /** One or two sentences for the job posting. */
  pitch: z.string(),
  /** Why these people are together tonight. */
  premise: z.string(),
  ruleset: z.enum(["2014", "2024"]),
  system: z.literal("dnd5e").default("dnd5e"),
  level: z.number().int().min(1).max(20),
  players: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  durationHrs: z.number().positive(),
  tone: z.array(z.string()).min(1),
  setting: z.string(),
  posting: z.object({
    header: z.string(),
    reward: z.string(),
  }),
  /** Character ids needed at minimum headcount. */
  coreRoles: z.array(id),
  gmNotes: z.string().optional(),
  /** Masthead for the morning-after broadsheet. */
  gazette: z.object({ name: z.string(), town: z.string(), price: z.string().default("One penny") }).optional(),
  sounds: soundsSchema.optional(),
  letters: z.array(letterSchema).default([]),
  content: z
    .object({ sources: z.array(z.string()).default([]), warnings: z.array(z.string()).default([]) })
    .default({ sources: [], warnings: [] }),
});

export type Spell = z.infer<typeof spellSchema>;
export type Attack = z.infer<typeof attackSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type Mech = z.infer<typeof mechSchema>;
export type Story = z.infer<typeof storySchema>;
export type CustomOption = z.infer<typeof optionSchema>;
export type Character = z.infer<typeof characterSchema>;
export type OneShot = z.infer<typeof oneShotSchema>;
export type Letter = z.infer<typeof letterSchema>;
export type IfUnclaimed = z.infer<typeof ifUnclaimedSchema>;
export type Sounds = z.infer<typeof soundsSchema>;
export type Ruleset = OneShot["ruleset"];

/** A one-shot with its cast loaded and cross-checked. */
export type OneShotWithCast = OneShot & { cast: Character[] };
