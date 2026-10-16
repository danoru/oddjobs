import { describe, expect, it } from "vitest";
import { anyReading, parseReading, readingAttrs } from "./reading";
import { roman, skinFrom, SKIN_WORDS } from "./skins";
import { SKINS } from "./schema";

describe("reading modes", () => {
  it("defaults everything off and survives junk", () => {
    const off = { large: false, contrast: false, dyslexia: false };
    expect(parseReading(null)).toEqual(off);
    expect(parseReading("nonsense")).toEqual(off);
    expect(parseReading({ large: "yes" })).toEqual(off);
    expect(parseReading({ contrast: true })).toEqual({ ...off, contrast: true });
  });

  it("turns modes into data attributes, leaving off modes out", () => {
    expect(readingAttrs(parseReading({ large: true, dyslexia: true }))).toEqual({
      "data-large": "",
      "data-contrast": undefined,
      "data-dyslexia": "",
    });
    expect(anyReading(parseReading({}))).toBe(false);
    expect(anyReading(parseReading({ dyslexia: true }))).toBe(true);
  });
});

describe("skins", () => {
  it("has words for every skin", () => {
    for (const s of SKINS) expect(SKIN_WORDS[s].tear.length).toBeGreaterThan(0);
  });
  it("only previews real skins", () => {
    expect(skinFrom("playbill", "tarot")).toBe("tarot");
    expect(skinFrom("playbill", "neon")).toBe("playbill");
    expect(skinFrom("dossier", undefined)).toBe("dossier");
  });
  it("numbers tarot cards in Roman numerals", () => {
    expect([0, 1, 4, 5, 9, 14, 19].map(roman)).toEqual(["0", "I", "IV", "V", "IX", "XIV", "XIX"]);
  });
});
