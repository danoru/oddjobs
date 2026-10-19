import { describe, expect, it } from "vitest";
import { load5e } from "./content";
import { availableLetters, beatId, letterIdSchema, letterText, resolveLetter } from "./letters";

const bell = load5e("the-drowned-bell");
const everyone = bell.cast.map((c) => c.id);

describe("letters", () => {
  it("offers content letters only to characters at the table", () => {
    const all = availableLetters(bell, everyone).filter((l) => l.kind === "letter");
    expect(all.length).toBe(bell.letters.length);
    const some = availableLetters(bell, ["rook", "sister-vell", "marrow"]).filter((l) => l.kind === "letter");
    expect(some.every((l) => ["rook", "sister-vell", "marrow"].includes(l.to))).toBe(true);
  });

  it("offers no inherited beats when everyone is playing", () => {
    expect(availableLetters(bell, everyone).filter((l) => l.kind === "beat")).toEqual([]);
  });

  it("turns an absent character's beats into letters for whoever inherits them", () => {
    const present = ["rook", "sister-vell", "odo-brambletoe"];
    const beats = availableLetters(bell, present).filter((l) => l.kind === "beat");
    expect(beats.length).toBeGreaterThan(0);
    for (const b of beats) {
      expect(present).toContain(b.to);
      expect(b.id).toMatch(/^beat:(marrow|merryn-vane):\d+$/);
      expect(letterText(bell, b.id)?.text).toBe(b.text);
      expect(resolveLetter(bell, b.id, present)?.to).toBe(b.to);
    }
  });

  it("won't resolve a letter for someone who isn't here", () => {
    const l = bell.letters[0];
    const without = everyone.filter((id) => id !== l.to);
    expect(resolveLetter(bell, l.id, without)).toBeNull();
    expect(resolveLetter(bell, "no-such-letter", everyone)).toBeNull();
  });

  it("only accepts well-formed ids", () => {
    expect(letterIdSchema.safeParse(beatId("rook", 0)).success).toBe(true);
    expect(letterIdSchema.safeParse("the-last-verse").success).toBe(true);
    expect(letterIdSchema.safeParse("../etc").success).toBe(false);
    expect(letterIdSchema.safeParse("beat:Rook:x").success).toBe(false);
  });
});
