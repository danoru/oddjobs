import { z } from "zod";

/**
 * The system-neutral parts of a one-shot: posters, ties with board-safe
 * lines, letters, sounds, the gazette, NPC fallbacks and skins. Each game
 * system (src/systems/<id>/schema.ts) builds its one-shot and character
 * schemas from these, and src/lib/schema.ts joins them into one union on
 * `system`.
 */

export const id = z.string().regex(/^[a-z0-9-]+$/, "ids are lowercase-kebab");

export const POSTER_HEADERS = [
  "WANTED",
  "SEEKING",
  "LOST",
  "MISSING",
  "LAST SEEN",
  "NOTICE",
  "REWARD",
  "HIRING",
] as const;

/** Icon keys the poster can show; drawn by src/components/PosterIcon.tsx. */
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
  "candle",
] as const;

export const posterSchema = z.object({
  header: z.enum(POSTER_HEADERS),
  /** Shown instead of the name on the poster, e.g. "????" for a mystery role. */
  alias: z.string().optional(),
  epithet: z.string(),
  hook: z.string().max(90, "keep the poster hook short"),
  reward: z.string().optional(),
  icon: z.enum(POSTER_ICONS),
});

export const tieSchema = z.object({
  to: id,
  /** The full tie, as the player reads it on their own sheet. May hold secrets. */
  text: z.string(),
  /** Board-safe version everyone can see, e.g. "old friends from the docks". */
  public: z.string().max(80).optional(),
});

// ---- Table-play extras -------------------------------------------------------

/** Synthesised sound presets (src/lib/sound/synth.ts), so no audio files need licensing. */
export const SOUND_BEDS = ["storm", "rain", "sea", "wind", "fire", "tavern", "drone", "crowd", "dark", "gale"] as const;
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
  "scream",
  "snuff",
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

/** Dress for a one-shot's job page and posters. */
export const SKINS = ["noticeboard", "dossier", "playbill", "tarot"] as const;

// ---- Building blocks for each system's documents -------------------------------

/** Every character, in any system, has these. Systems add `story` and their own mechanics. */
export const coreCharacterFields = {
  id,
  name: z.string(),
  /** Display order on the board. */
  order: z.number().int(),
  poster: posterSchema,
  portrait: z.string().optional(),
  /** Session-zero question the player answers in a sentence before play. */
  flashback: z.string().optional(),
  ifUnclaimed: ifUnclaimedSchema.optional(),
};

/** Every one-shot, in any system, has these. Systems add `system` and their own fields. */
export const coreOneShotFields = {
  slug: id,
  title: z.string(),
  /** One or two sentences for the job posting. */
  pitch: z.string(),
  /** Why these people are together tonight. */
  premise: z.string(),
  players: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  durationHrs: z.number().positive(),
  tone: z.array(z.string()).min(1),
  setting: z.string(),
  posting: z.object({
    header: z.string(),
    reward: z.string(),
  }),
  /** Character ids needed at minimum headcount. */
  coreRoles: z.array(id).default([]),
  gmNotes: z.string().optional(),
  /** Masthead for the morning-after broadsheet. */
  gazette: z.object({ name: z.string(), town: z.string(), price: z.string().default("One penny") }).optional(),
  sounds: soundsSchema.optional(),
  letters: z.array(letterSchema).default([]),
  content: z
    .object({ sources: z.array(z.string()).default([]), warnings: z.array(z.string()).default([]) })
    .default({ sources: [], warnings: [] }),
  /** How the job page and its posters are dressed. The home board is always the notice board. */
  skin: z.enum(SKINS).default("noticeboard"),
};

export type Poster = z.infer<typeof posterSchema>;
export type Tie = z.infer<typeof tieSchema>;
export type Letter = z.infer<typeof letterSchema>;
export type IfUnclaimed = z.infer<typeof ifUnclaimedSchema>;
export type Sounds = z.infer<typeof soundsSchema>;
export type Skin = (typeof SKINS)[number];

/** The parts of a character that shared code (posters, yarn, letters, tonight) may read. */
export type CoreCharacter = {
  id: string;
  name: string;
  order: number;
  poster: Poster;
  portrait?: string;
  flashback?: string;
  ifUnclaimed?: IfUnclaimed;
  story: { ties: Tie[] };
};
