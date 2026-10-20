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
  header: z.enum(POSTER_HEADERS).describe("Poster word"),
  /** Shown instead of the name on the poster, e.g. "????" for a mystery role. */
  alias: z.string().optional().describe("Alias on the board (e.g. ????)"),
  epithet: z.string().describe("Epithet (e.g. the Undertaker)"),
  hook: z.string().max(90, "keep the poster hook short").describe("Hook"),
  reward: z.string().optional().describe("Reward line"),
  icon: z.enum(POSTER_ICONS).describe("Icon"),
});

export const tieSchema = z.object({
  to: id.describe("Tied to"),
  /** The full tie, as the player reads it on their own sheet. May hold secrets. */
  text: z.string().describe("The tie, as the player reads it (private)"),
  /** Board-safe version everyone can see, e.g. "old friends from the docks". */
  public: z.string().max(80).optional().describe("Board-safe line everyone sees"),
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
  beds: z
    .array(z.object({ id, label: z.string().describe("Label"), preset: z.enum(SOUND_BEDS).describe("Sound") }))
    .default([])
    .describe("Ambience beds (loop and crossfade)"),
  /** One-shot cues played over the bed. */
  stingers: z
    .array(z.object({ id, label: z.string().describe("Label"), preset: z.enum(SOUND_STINGERS).describe("Sound") }))
    .default([])
    .describe("Stingers (one-shot cues)"),
});

/** A sealed handout the GM delivers to one player mid-session. GM-only until delivered. */
export const letterSchema = z.object({
  id,
  /** Character id who receives it. */
  to: id.describe("To"),
  /** Short GM-facing label, e.g. "Who bought the bell". */
  title: z.string().describe("Title (GM only)"),
  /** When to send it, e.g. "Act 3: the wreck". */
  when: z.string().describe("Act / when to send it"),
  /** What the player reads after breaking the seal. */
  text: z.string().describe("What the player reads under the seal"),
  /** The act card it belongs to; printed on the envelope in the box ("open at Act II"). */
  act: id.optional().describe("Open at act (optional)"),
});

/** A theatrical title card the GM puts on the TV between scenes. GM-only until shown. */
export const actSchema = z.object({
  id,
  title: z.string().max(60).describe("Title (e.g. The Beach at Midnight)"),
  subtitle: z.string().max(120).optional().describe("Subtitle"),
  /** Wiped in on the TV after the title. A URL, or leave it out for an engraved panel. */
  image: z.string().optional().describe("Image URL (optional)"),
});

export const RUMOR_TRUTHS = ["true", "false", "half"] as const;

/** Talk in the tavern. Each player draws two after claiming; only the GM knows which are true. */
export const rumorSchema = z.object({
  id,
  text: z.string().min(10).max(200, "keep a rumor to a sentence or two").describe("What they heard"),
  truth: z.enum(RUMOR_TRUTHS).describe("Truth (GM only)"),
});

export const NOTICE_KINDS = ["poster", "reward", "sighted", "settled"] as const;

/** A notice the GM can pin to the shared town board mid-session. GM-only until pinned. */
export const noticeSchema = z.object({
  id,
  kind: z.enum(NOTICE_KINDS).describe("Kind"),
  title: z.string().max(60).describe("Headline"),
  text: z.string().max(240).optional().describe("Notice text"),
});

/** What the GM does with a character nobody claims tonight. GM-only. */
export const ifUnclaimedSchema = z.object({
  /** How the GM plays them as an NPC (or "absent"). */
  npc: z.string().describe("Play them as an NPC (or say they're absent)"),
  /** Story beats handed to someone else if they're at the table, first match wins per beat. */
  reassign: z
    .array(
      z.object({
        beat: z.string().describe("Story beat"),
        to: z.array(id).min(1).describe("Heirs, in order (the first one at the table gets it)"),
        text: z.string().describe("What the heir gets"),
      }),
    )
    .default([])
    .describe("Beats that move to someone else"),
  /** Scenes or threads that drop out without them. */
  cuts: z.array(z.string()).default([]).describe("What gets cut"),
});

/** Dress for a one-shot's job page and posters. */
export const SKINS = ["noticeboard", "dossier", "playbill", "tarot"] as const;

// ---- Building blocks for each system's documents -------------------------------

/** Every character, in any system, has these. Systems add `story` and their own mechanics. */
export const coreCharacterFields = {
  id: id.describe("Id (the sheet's address)"),
  name: z.string().describe("Name"),
  /** Display order on the board. */
  order: z.number().int(),
  poster: posterSchema,
  portrait: z.string().optional().describe("Portrait image URL"),
  /** Session-zero question the player answers in a sentence before play. */
  flashback: z.string().optional().describe("Session-zero flashback question"),
  ifUnclaimed: ifUnclaimedSchema.optional().describe("If nobody claims them"),
};

/** Every one-shot, in any system, has these. Systems add `system` and their own fields. */
export const coreOneShotFields = {
  slug: id.describe("Slug (the page address)"),
  title: z.string().describe("Title"),
  /** One or two sentences for the job posting. */
  pitch: z.string().describe("Pitch (one or two sentences for the board)"),
  /** Why these people are together tonight. */
  premise: z.string().describe("Premise: why these people are together tonight"),
  players: z
    .object({
      min: z.number().int().min(1).describe("Fewest players"),
      max: z.number().int().min(1).describe("Most players"),
    })
    .describe("Players"),
  durationHrs: z.number().positive().describe("Length (hours)"),
  tone: z.array(z.string()).min(1).describe("Tone"),
  setting: z.string().describe("Setting"),
  posting: z
    .object({
      header: z.string().describe("Posting headline"),
      reward: z.string().describe("Reward"),
    })
    .describe("The posting"),
  /** Character ids needed at minimum headcount. */
  coreRoles: z.array(id).default([]).describe("Core roles (needed at the smallest table)"),
  gmNotes: z.string().optional().describe("GM notes"),
  /** Masthead for the morning-after broadsheet. */
  gazette: z
    .object({
      name: z.string().describe("Paper's name"),
      town: z.string().describe("Town"),
      price: z.string().default("One penny").describe("Price"),
    })
    .optional()
    .describe("Morning-after broadsheet"),
  sounds: soundsSchema.optional().describe("Soundboard"),
  letters: z.array(letterSchema).default([]).describe("Sealed letters"),
  /** Title cards for the TV between scenes, in order. GM-only until shown. */
  acts: z.array(actSchema).default([]).describe("Act cards"),
  /** Rumors players draw after claiming. GM-only: players only ever get the two they drew, without the truth. */
  rumors: z.array(rumorSchema).default([]).describe("Rumor mill"),
  /** Notices the GM can pin to the town board mid-session. GM-only until pinned. */
  notices: z.array(noticeSchema).default([]).describe("Town board notices"),
  content: z
    .object({
      sources: z.array(z.string()).default([]).describe("Sources and credits"),
      warnings: z.array(z.string()).default([]).describe("Content warnings"),
    })
    .default({ sources: [], warnings: [] })
    .describe("Content notes"),
  /** How the job page and its posters are dressed. The home board is always the notice board. */
  skin: z.enum(SKINS).default("noticeboard").describe("Skin"),
};

export type Poster = z.infer<typeof posterSchema>;
export type Tie = z.infer<typeof tieSchema>;
export type Letter = z.infer<typeof letterSchema>;
export type Act = z.infer<typeof actSchema>;
export type Rumor = z.infer<typeof rumorSchema>;
export type RumorTruth = (typeof RUMOR_TRUTHS)[number];
export type Notice = z.infer<typeof noticeSchema>;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
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
