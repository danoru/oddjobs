import { z } from "zod";
import { coreCharacterFields, coreOneShotFields, id, tieSchema } from "@/lib/coreSchema";

/**
 * Paranoia (Mongoose Publishing, the 2023 Core Book): a play aid for tables
 * that own the game. A one-shot is a mission for a team of Troubleshooters,
 * each with a public side (clone name, clearance, service group, skills,
 * gear) and a naughty side (secret society, mutant power, secret objectives,
 * treasonous gear, favours).
 *
 * GM-only: every character's `naughty` side (toPublic strips it; at a table
 * /api/tables/<code>/secrets hands each player only their own), the
 * Computer's preset announcements, and the house rules' notes. The rules
 * they're checked against, and how sure we are of each, are in ./rules.ts.
 */

// ---- Paranoia vocab -----------------------------------------------------------------

export const STATS = ["violence", "brains", "chutzpah", "mechanics"] as const;
export type Stat = (typeof STATS)[number];

/** The sixteen skills and the stat each sits under (the official 2023 sheet). */
export const SKILLS = {
  athletics: "violence",
  guns: "violence",
  melee: "violence",
  throw: "violence",
  alphaComplex: "brains",
  bureaucracy: "brains",
  psychology: "brains",
  science: "brains",
  bluff: "chutzpah",
  charm: "chutzpah",
  intimidate: "chutzpah",
  stealth: "chutzpah",
  demolitions: "mechanics",
  engineer: "mechanics",
  operate: "mechanics",
  program: "mechanics",
} as const satisfies Record<string, Stat>;
export type Skill = keyof typeof SKILLS;
export const SKILL_KEYS = Object.keys(SKILLS) as [Skill, ...Skill[]];

/** Security clearances, lowest first. Troubleshooters start at Red. */
export const CLEARANCES = ["IR", "R", "O", "Y", "G", "B", "I", "V", "U"] as const;
export type Clearance = (typeof CLEARANCES)[number];

const skillValue = z.number().int().min(-5).max(5);

// ---- Mechanics (the public side) -----------------------------------------------------

export const cloneSchema = z.object({
  /** The given name: "Bob" in Bob-R-XYZ-1. */
  name: z.string().regex(/^[A-Z][a-zA-Z]{1,15}$/, "a name like Bob: a capital, then letters").describe("Name"),
  clearance: z.enum(CLEARANCES).default("R").describe("Security clearance"),
  /** The home sector, three capitals. */
  sector: z.string().regex(/^[A-Z]{3}$/, "three capital letters, like XYZ").describe("Sector"),
  /** Which clone of the six-pack starts the mission. */
  number: z.number().int().min(1).max(6).default(1).describe("Clone number"),
});

export const gearSchema = z.object({
  name: z.string().describe("Item"),
  /** Extra NODE dice it gives when it's the tool for the job. */
  level: z.number().int().min(0).max(3).default(0).describe("Gear level (extra dice)"),
  note: z.string().optional().describe("Note"),
});

export const mechSchema = z.object({
  clone: cloneSchema.describe("Clone name"),
  serviceGroup: z.string().describe("Service group"),
  /** Mandatory Bonus Duty: the team role the Computer assigned. */
  bonusDuty: z.string().describe("Mandatory Bonus Duty"),
  /** −5 to +5; a new Troubleshooter has +1…+5 and −1…−5 once each, the other six at 0. Stats follow from them. */
  skills: z.object(Object.fromEntries(SKILL_KEYS.map((k) => [k, skillValue.default(0)])) as Record<Skill, z.ZodDefault<typeof skillValue>>).describe("Skills"),
  moxie: z.number().int().min(0).max(12).default(8).describe("Moxie"),
  xp: z.number().int().min(0).default(0).describe("XP Points"),
  gear: z.array(gearSchema).default([]).describe("Assigned gear"),
});

// ---- The naughty side (GM and the claimant only) ----------------------------------------

export const naughtySchema = z.object({
  society: z.string().describe("Secret society"),
  /** What the society wants from them tonight. */
  societyObjective: z.string().optional().describe("Society's objective (also a secret objective)"),
  mutantPower: z
    .object({
      name: z.string().describe("Mutant power"),
      text: z.string().max(240).describe("What it does (your own words)"),
    })
    .describe("Mutant power"),
  /** Up to three: the sheet has three Secret Objective lines. */
  objectives: z.array(z.string().max(200)).max(3, "the sheet has room for three secret objectives").default([]).describe("Secret objectives"),
  treasonousGear: z.array(gearSchema).default([]).describe("Treasonous gear (do not use openly)"),
  favours: z
    .object({
      serviceGroup: z.array(z.string().max(120)).default([]).describe("Service group favours"),
      society: z.array(z.string().max(120)).default([]).describe("Secret society favours"),
    })
    .default({ serviceGroup: [], society: [] })
    .describe("Favours"),
  /** Anything else only they know. */
  secret: z.string().optional().describe("A personal secret"),
});

// ---- Story --------------------------------------------------------------------------------

export const storySchema = z.object({
  pronouns: z.string().describe("Pronouns"),
  appearance: z.string().describe("Appearance"),
  concept: z.string().describe("Concept: who they are"),
  /** Why this mission matters to them (publicly). */
  stake: z.string().describe("Stake in this mission"),
  goal: z.string().describe("Goal"),
  voice: z.string().describe("Voice"),
  mannerisms: z.array(z.string()).min(1).describe("Mannerisms"),
  /** What makes them commit treason, in a phrase. */
  treasonButton: z.string().max(120).describe("Treason Button"),
  /** What makes them lash out, in a phrase. */
  violenceButton: z.string().max(120).describe("Violence Button"),
  ties: z.array(tieSchema).min(1).describe("Ties"),
  intro: z.string().optional().describe("Read-aloud introduction"),
});

// ---- House rules: where the free sources disagree, the GM picks (./rules.ts) -------------

export const houseRulesSchema = z.object({
  /** Five Flags (0–4, the 2023 sheet) or six treason levels (0–5, as in 2017). */
  treasonLevels: z.union([z.literal(5), z.literal(6)]).default(5).describe("Treason track (5 Flags or 6 levels)"),
  /** What the Computer noticing you does to your Moxie. */
  computerMoxie: z.enum(["none", "lose", "gain"]).default("none").describe("When the Computer notices you"),
  /** Moxie a replacement clone arrives with. */
  cloneMoxie: z.enum(["four", "full"]).default("four").describe("A new clone's Moxie"),
  /** Successes a typical roll needs, as the GM's reminder. */
  difficulty: z.number().int().min(1).max(6).default(2).describe("Typical successes needed"),
});

// ---- Top-level documents -------------------------------------------------------------

export const characterSchema = z.object({
  ...coreCharacterFields,
  story: storySchema,
  mech: mechSchema,
  naughty: naughtySchema.describe("The naughty side (GM and their player only)"),
});

export const oneShotSchema = z.object({
  ...coreOneShotFields,
  system: z.literal("paranoia"),
  /** The team's name on the sheet. */
  team: z.string().describe("Team name"),
  /** The public mission objectives every Troubleshooter is handed. */
  objectives: z.array(z.string().max(200)).min(1).describe("Mission objectives (public)"),
  /** What Friend Computer says at the briefing, read aloud (GM-only until said). */
  briefing: z.string().max(1500, "keep the briefing under 1,500 characters").describe("The briefing (Friend Computer reads it)"),
  /** Lines the GM can push to every phone and the TV mid-mission. GM-only until said. */
  announcements: z
    .array(z.object({ id, text: z.string().max(280).describe("Friend Computer says") }))
    .default([])
    .describe("Friend Computer's announcements (GM only)"),
  houseRules: houseRulesSchema.default({}).describe("House rules"),
});

export type Gear = z.infer<typeof gearSchema>;
export type Mech = z.infer<typeof mechSchema>;
export type Naughty = z.infer<typeof naughtySchema>;
export type Story = z.infer<typeof storySchema>;
export type HouseRules = z.infer<typeof houseRulesSchema>;
export type Character = z.infer<typeof characterSchema>;
export type OneShot = z.infer<typeof oneShotSchema>;
export type OneShotWithCast = OneShot & { cast: Character[] };
