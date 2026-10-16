import { SKINS, type Skin } from "./schema";

/**
 * The words each skin uses on its job page and posters. The look itself is
 * in src/components/board/Skins.module.css, keyed on data-skin / data-part.
 */
export interface SkinWords {
  /** What the cast section is called, for screen readers and the heading. */
  cast: string;
  tear: string;
  claimed: string;
  /** "torn down by Ana" */
  heldBy: string;
  pinBack: string;
  needed: string;
  ties: string;
  party: string;
  /** Ruleset badge, e.g. "2024 rules". */
  rules: (ruleset: string) => string;
}

export const SKIN_WORDS: Record<Skin, SkinWords> = {
  noticeboard: {
    cast: "Posters on the board",
    tear: "TEAR TO CLAIM",
    claimed: "CLAIMED",
    heldBy: "torn down by",
    pinBack: "pin it back up",
    needed: "NEEDED",
    ties: "Who knows whom",
    party: "The party so far",
    rules: (r) => `${r} rules`,
  },
  dossier: {
    cast: "Persons of interest",
    tear: "SIGN OUT THIS FILE",
    claimed: "ASSIGNED",
    heldBy: "signed out by",
    pinBack: "return the file",
    needed: "PRIORITY",
    ties: "Known associates",
    party: "Agents in the field",
    rules: (r) => `${r} protocol`,
  },
  playbill: {
    cast: "Dramatis personae",
    tear: "TAKE THE PART",
    claimed: "CAST",
    heldBy: "played by",
    pinBack: "give the part back",
    needed: "LEAD ROLE",
    ties: "Who knows whom",
    party: "The company so far",
    rules: (r) => `${r} rules`,
  },
  tarot: {
    cast: "The spread",
    tear: "DRAW THIS CARD",
    claimed: "DRAWN",
    heldBy: "drawn by",
    pinBack: "return it to the deck",
    needed: "ARCANA",
    ties: "How the cards fall",
    party: "The reading so far",
    rules: (r) => `${r} rules`,
  },
};

/** A skin from a `?skin=` preview parameter, or the one-shot's own. */
export function skinFrom(own: Skin, preview: unknown): Skin {
  return typeof preview === "string" && (SKINS as readonly string[]).includes(preview) ? (preview as Skin) : own;
}

const NUMERALS: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Roman numerals for tarot cards (0 is "0", like The Fool). */
export function roman(n: number): string {
  if (n <= 0) return "0";
  let out = "";
  for (const [v, s] of NUMERALS)
    while (n >= v) {
      out += s;
      n -= v;
    }
  return out;
}
