import { z } from "zod";
import { coreCharacterFields, coreOneShotFields, id, tieSchema } from "@/lib/coreSchema";

/**
 * Ten Candles (Cavalry Games): a play aid for tables that own the game. A
 * one-shot is a module, the GM's seed for the night. Players make their
 * characters at the table (traits, moment, brink); the cast here is optional
 * pre-made concepts they can tear down instead of starting blank.
 *
 * Everything in `module` and `suggestedTruths` is GM-only: toPublic strips it,
 * and only the GM page and the game API read it.
 */

/** A place the characters can reach. Published modules list these as "areas of note". */
export const areaSchema = z.object({
  id,
  name: z.string().describe("Area name"),
  /** What's there, for the GM: what it looks like, what's wrong with it, what can be found. */
  text: z.string().describe("What's here (GM only)"),
  /** Things a character might pick up or use here. */
  finds: z.array(z.string()).default([]).describe("Things to find here"),
});

/**
 * Our own pacing aid (not a part of published modules): what tends to happen
 * while a given number of candles is still lit.
 */
export const stageSchema = z.object({
  title: z.string().describe("Stage title"),
  /** Stage applies while this many candles (or fewer, down to the next stage) are lit. */
  candles: z.number().int().min(1).max(10).describe("Starts at this many lit candles"),
  text: z.string().describe("What tends to happen"),
  /** Pressure the GM can bring to bear in this stage. */
  beats: z.array(z.string()).default([]).describe("Beats the GM can use"),
});

export const moduleSchema = z.object({
  /** What the GM reads aloud once the first traits are written. Paraphrase, our own words. */
  intro: z.string().describe("Read aloud (paragraphs split by blank lines)"),
  /** What the characters are trying to do tonight. */
  goal: z.string().describe("Goal"),
  /** Who They are, as far as the GM knows going in. The table will make Them stranger. */
  them: z.string().describe("Them (GM notes)"),
  areas: z.array(areaSchema).min(2).describe("Areas of note"),
  stages: z.array(stageSchema).default([]).describe("Pacing by candlelight (our aid, optional)"),
  /** Ideas for when one candle is left. */
  lastStand: z.string().optional().describe("The Last Stand"),
});

/** A pre-made concept a player can take instead of starting blank. Traits are still written at the table. */
export const storySchema = z.object({
  pronouns: z.string().optional().describe("Pronouns"),
  /** Who they were before the dark, in a sentence or two. */
  concept: z.string().describe("Concept: who they were before the dark"),
  /** What they look like tonight. */
  look: z.string().describe("Look tonight"),
  /** Other names the player can choose from. */
  namePrompts: z.array(z.string()).default([]).describe("Other names to choose from"),
  /** What's in their pockets (the game's only inventory). */
  carrying: z.array(z.string()).default([]).describe("In their pockets"),
  /** Why they're out here tonight. */
  stake: z.string().optional().describe("Why they're out here tonight"),
  ties: z.array(tieSchema).default([]).describe("Ties to other pre-mades"),
});

export const characterSchema = z.object({
  ...coreCharacterFields,
  story: storySchema,
});

export const oneShotSchema = z.object({
  ...coreOneShotFields,
  system: z.literal("tencandles"),
  module: moduleSchema.describe("The module (GM only)"),
  /** Truths the GM can offer when the table is stuck. GM-only. */
  suggestedTruths: z.array(z.string().max(160)).default([]).describe("Truths to offer (GM only)"),
});

export type Area = z.infer<typeof areaSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Character = z.infer<typeof characterSchema>;
export type OneShot = z.infer<typeof oneShotSchema>;
export type OneShotWithCast = OneShot & { cast: Character[] };
