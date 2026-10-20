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

describe("toPublic: Ten Candles", () => {
  it("keeps the module and suggested truths off player pages", () => {
    const tc = loadAll().filter((os) => os.system === "tencandles");
    expect(tc.length).toBeGreaterThan(0);
    for (const os of tc) {
      if (os.system !== "tencandles") continue;
      const pub = toPublic(os);
      expect("module" in pub).toBe(false);
      expect("suggestedTruths" in pub).toBe(false);
      const json = JSON.stringify(pub);
      expect(json).not.toContain(os.module.intro.slice(0, 60));
      expect(json).not.toContain(os.module.them.slice(0, 60));
      expect(json).not.toContain(os.module.goal);
      for (const a of os.module.areas) expect(json).not.toContain(a.text.slice(0, 60));
      for (const t of os.suggestedTruths) expect(json).not.toContain(t);
      for (const c of os.cast) if (c.ifUnclaimed) expect(json).not.toContain(c.ifUnclaimed.npc);
    }
  });
});

describe("toPublic: phase 6's GM-only extras", () => {
  it("keeps act cards, rumors (and their truths) and town-board presets off player pages", () => {
    const all = loadAll();
    expect(all.every((os) => os.acts.length > 0 && os.rumors.length >= 6 && os.notices.length > 0)).toBe(true);
    for (const os of all) {
      const pub = toPublic(os);
      for (const key of ["acts", "rumors", "notices"]) expect(key in pub).toBe(false);
      const json = JSON.stringify(pub);
      expect(json).not.toContain('"truth"');
      for (const r of os.rumors) expect(json).not.toContain(r.text);
      for (const n of os.notices) expect(json).not.toContain(n.title);
      // Titles can echo the one-shot's own ("Lot Thirteen"); the subtitles are the acts' own words.
      for (const a of os.acts) if (a.subtitle) expect(json).not.toContain(a.subtitle);
      // Players only learn that there are rumors to draw.
      expect(pub.hasRumors).toBe(true);
    }
  });
});
