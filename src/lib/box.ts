import type { OneShotWithCast } from "./schema";

/** Rumor slips per printed page, and act cards per page, in the box. */
export const RUMORS_PER_PAGE = 10;
export const ACTS_PER_PAGE = 2;

/** Pages the box's own printables take (envelopes, act cards, rumor slips, gazette), for the page check. */
export function extraPages(os: Pick<OneShotWithCast, "letters" | "acts" | "rumors">) {
  return {
    letters: os.letters.length,
    acts: Math.ceil(os.acts.length / ACTS_PER_PAGE),
    rumors: Math.ceil(os.rumors.length / RUMORS_PER_PAGE),
    gazette: 1,
  };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
/** Act numbers on the cards: I, II, III… */
export const roman = (i: number) => ROMAN[i] ?? String(i + 1);
