import { describe, expect, it } from "vitest";
import { loadAll } from "./content";
import { toPublic } from "./public";

describe("toPublic", () => {
  it("never passes gmNotes to player pages", () => {
    const all = loadAll();
    expect(all.some((os) => os.gmNotes)).toBe(true);
    for (const os of all) {
      const pub = toPublic(os);
      expect("gmNotes" in pub).toBe(false);
      expect(JSON.stringify(pub)).not.toContain('"gmNotes"');
    }
  });
});

describe("toPublic: other GM-only fields", () => {
  it("drops letters and NPC fallbacks", () => {
    const all = loadAll();
    expect(all.some((os) => os.letters.length)).toBe(true);
    for (const os of all) {
      const pub = toPublic(os);
      expect("letters" in pub).toBe(false);
      for (const c of pub.cast) expect("ifUnclaimed" in c).toBe(false);
      // And none of their text leaks by another route.
      const json = JSON.stringify(pub);
      for (const l of os.letters) expect(json).not.toContain(l.text);
      for (const c of os.cast) if (c.ifUnclaimed) expect(json).not.toContain(c.ifUnclaimed.npc);
    }
  });
});
