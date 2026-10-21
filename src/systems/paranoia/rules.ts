import type { Clearance, HouseRules } from "./schema";

/**
 * Paranoia as this play aid runs it, for tables that own the 2023 Core Book
 * (Mongoose Publishing). There is no licence or SRD for Paranoia, so every
 * rule and description here is our own paraphrase, built from Mongoose's
 * free official character and GM sheets and from reviews (docs/paranoia-
 * research.md has every source). Each rule carries a grade, as the Ten
 * Candles aid does:
 *   - confirmed: Mongoose's own free material says so;
 *   - corroborated: several independent reviews agree;
 *   - inferred: one source, or the 2017 edition's rule assumed to carry over.
 * Where they disagree the GM picks a house reading (`houseRules` in the
 * one-shot), and the lists of names are suggestions, not checks, so the
 * book in the GM's hands wins.
 */

export type Grade = "confirmed" | "corroborated" | "inferred";

export interface Rule {
  id: string;
  text: string;
  grade: Grade;
  /** The house rule that settles it, if the GM picks. */
  setting?: keyof HouseRules;
}

export const RULES: Rule[] = [
  { id: "skills", text: "Sixteen skills, four under each of Violence, Brains, Chutzpah and Mechanics, each from −5 to +5.", grade: "confirmed" },
  { id: "draft", text: "A new Troubleshooter has +1, +2, +3, +4 and +5 in five skills and −1 to −5 in five others, each value once; the other six are 0.", grade: "corroborated" },
  { id: "stats", text: "Each stat is the number of positive skills under it, so the four add up to 5.", grade: "inferred" },
  { id: "node", text: "Roll stat + skill + gear dice, less the wound penalty, plus one Computer die. Every 5 or 6 is a success; the GM says how many are needed (2 is typical).", grade: "corroborated", setting: "difficulty" },
  { id: "anti", text: "If the pool is negative, roll that many dice anyway: each one that isn't a 5 or 6 takes away a success.", grade: "inferred" },
  { id: "computer", text: "If the Computer die comes up 6, Friend Computer notices and the GM has it interfere. Each treason level widens that by one (5–6, then 4–6…).", grade: "corroborated" },
  { id: "computerMoxie", text: "What the Computer noticing does to Moxie: the sources disagree (nothing, lose one, or gain one).", grade: "inferred", setting: "computerMoxie" },
  { id: "players", text: "Only players roll; the GM never rolls for the Computer's side.", grade: "corroborated" },
  { id: "wounds", text: "Wounds go Fine, Hurt (−1 die), Injured (−2), Maimed (−3), Dead. Dead costs a clone.", grade: "corroborated" },
  { id: "moxie", text: "Moxie starts at 8. Spend it to turn a failure into a success (or someone's success into a failure), or to fuel a mutation. At 0 the Troubleshooter Loses It.", grade: "corroborated" },
  { id: "buttons", text: "Each Troubleshooter has a Treason Button and a Violence Button; acting on one wins Moxie back.", grade: "corroborated" },
  { id: "flags", text: "Treason is five Flags: Loyal, Greylisted, Restricted, Citizen-of-interest, Wanted.", grade: "confirmed", setting: "treasonLevels" },
  { id: "clones", text: "Six clones. A dead clone's replacement keeps nearly everything but its last few minutes; after the sixth, they're gone for good.", grade: "corroborated" },
  { id: "cloneMoxie", text: "What Moxie a replacement clone arrives with: one 2023 source says 4.", grade: "inferred", setting: "cloneMoxie" },
  { id: "secrets", text: "Every Troubleshooter is secretly a mutant and in a secret society, with secret objectives (the sheet has three lines) and favours from their service group and society.", grade: "confirmed" },
];

export const CLEARANCE_NAMES: Record<Clearance, string> = {
  IR: "Infrared",
  R: "Red",
  O: "Orange",
  Y: "Yellow",
  G: "Green",
  B: "Blue",
  I: "Indigo",
  V: "Violet",
  U: "Ultraviolet",
};

/** Each clearance's colour, for badges and the clone ID card. Infrared is black. */
export const CLEARANCE_INK: Record<Clearance, { bg: string; fg: string }> = {
  IR: { bg: "#1b1b1b", fg: "#f4f4f4" },
  R: { bg: "#b3261e", fg: "#fff6f0" },
  O: { bg: "#c4561a", fg: "#fff6f0" },
  Y: { bg: "#e0b51a", fg: "#1b1209" },
  G: { bg: "#2f7a3a", fg: "#f4fff4" },
  B: { bg: "#245c9e", fg: "#f2f7ff" },
  I: { bg: "#3b2f86", fg: "#f2f0ff" },
  V: { bg: "#6c2f86", fg: "#fbf2ff" },
  U: { bg: "#e8e4ff", fg: "#1b1209" },
};

export const FLAG_NAMES = ["Loyal", "Greylisted", "Restricted", "Citizen-of-interest", "Wanted"] as const;
/** The 2017-style six-level reading of the treason track. */
export const STAR_NAMES = ["Loyal", "One star", "Two stars", "Three stars", "Four stars", "Five stars"] as const;
export const WOUND_NAMES = ["Fine", "Hurt", "Injured", "Maimed", "Dead"] as const;
export const DEAD = 4;
export const CLONES = 6;
export const STARTING_MOXIE = 8;

/** Treason levels on a track, and their names. */
export const treasonNames = (h: Pick<HouseRules, "treasonLevels">) => (h.treasonLevels === 6 ? STAR_NAMES : FLAG_NAMES);

/** The Computer die notices you on this or higher: 6 when Loyal, one lower per treason level. */
export const computerThreshold = (treason: number) => Math.max(1, 6 - treason);

/** NODE dice lost to wounds. */
export const woundPenalty = (wounds: number) => Math.min(3, Math.max(0, wounds));

/** Moxie a replacement clone arrives with. */
export const cloneMoxie = (h: Pick<HouseRules, "cloneMoxie">) => (h.cloneMoxie === "full" ? STARTING_MOXIE : 4);

// ---- Names, as suggestions (the GM's book wins) ------------------------------------------

/** The eight service groups (the long-standing list; the 2023 book has eight). */
export const SERVICE_GROUPS = [
  "Internal Security",
  "Technical Services",
  "HPD & Mind Control",
  "Armed Forces",
  "Production, Logistics & Commissary",
  "Power Services",
  "Research & Design",
  "Central Processing Unit",
];

/** Long-running secret societies; the 2023 book has thirteen. */
export const SOCIETIES = [
  "Anti-Mutant",
  "Communists",
  "Computer Phreaks",
  "Corpore Metal",
  "Death Leopard",
  "First Church of Christ Computer-Programmer",
  "Frankenstein Destroyers",
  "Free Enterprise",
  "Humanists",
  "Illuminati",
  "Mystics",
  "Psion",
  "PURGE",
  "Romantics",
  "Sierra Club",
];

/** Mutant powers seen across the editions. */
export const MUTANT_POWERS = [
  "Adhesive",
  "Anomaly",
  "Charm",
  "Corrode",
  "Cryokinesis",
  "Electroshock",
  "Invisibility",
  "Levitation",
  "Machine Empathy",
  "Mental Blast",
  "Puppeteer",
  "Pyrokinesis",
  "Strength",
  "Telekinesis",
  "Telepathy",
  "Teleport",
];

/** Mandatory Bonus Duties: the team roles the Computer hands out. */
export const BONUS_DUTIES = ["Team Leader", "Loyalty Officer", "Happiness Officer", "Equipment Guy", "Science Officer", "Combat Officer", "Media Officer"];
