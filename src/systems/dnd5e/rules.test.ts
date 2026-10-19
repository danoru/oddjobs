import { describe, expect, it } from "vitest";
import { loadAll5e } from "@/lib/content";
import { casterLevel, expectedHp, expectedSlots, pactSlots, rulesCheck } from "./rules";
import type { Character } from "@/systems/dnd5e/schema";
import { withVariant } from "./variants";

const all = loadAll5e();
const find = (id: string) => all.flatMap((os) => os.cast).find((c) => c.id === id)!;
const withClasses = (c: Character, classes: Character["mech"]["classes"]): Character => ({
  ...c,
  mech: { ...c.mech, classes },
});

describe("rules arithmetic", () => {
  it("every character at every level passes", () => {
    for (const os of all)
      for (const v of [os.level, ...os.variants.map((x) => x.level)])
        for (const c of withVariant(os, v).cast) expect(rulesCheck(c, os.ruleset), `${c.id} at ${v}`).toEqual([]);
  });

  it("works out HP with the fixed average", () => {
    const rook = find("rook"); // Rogue 5, Con 16
    expect(expectedHp(rook, "2024")).toBe(8 + 4 * 5 + 5 * 3);
    // Mountain dwarves get no extra HP in 2014; 2024 dwarves do.
    const dagny = find("dagny-brask");
    expect(expectedHp(dagny, "2014")).toBe(31);
    expect(expectedHp(dagny, "2024")).toBe(34);
  });

  it("knows caster levels and slots, including half casters by edition", () => {
    const vell = find("sister-vell");
    expect(expectedSlots(vell, "2024")).toEqual([4, 3, 2]);
    const paladin1 = withClasses(vell, [{ name: "Paladin", level: 1 }]);
    expect(casterLevel(paladin1, "2014")).toBe(0);
    expect(casterLevel(paladin1, "2024")).toBe(1);
    const multi = withClasses(vell, [
      { name: "Cleric", level: 3 },
      { name: "Ranger", level: 3 },
    ]);
    expect(expectedSlots(multi, "2014")).toEqual([4, 3]); // caster level 4
    expect(expectedSlots(multi, "2024")).toEqual([4, 3, 2]); // caster level 5
  });

  it("knows pact magic", () => {
    expect(pactSlots(1)).toEqual({ count: 1, level: 1 });
    expect(pactSlots(3)).toEqual({ count: 2, level: 2 });
    expect(pactSlots(5)).toEqual({ count: 2, level: 3 });
    expect(pactSlots(11)).toEqual({ count: 3, level: 5 });
    expect(pactSlots(20)).toEqual({ count: 4, level: 5 });
  });

  it("flags slots above the class table and spells above the slots", () => {
    const vell = find("sister-vell");
    const greener = withClasses(vell, [{ name: "Cleric", subclass: "Life Domain", level: 3 }]);
    const errs = rulesCheck(greener, "2024");
    expect(errs.some((e) => e.includes("spell slots [4, 3, 2], but the class table gives [4, 2]"))).toBe(true);
    expect(errs.some((e) => /Spirit Guardians is level 3, above their highest slot \(2\)/.test(e))).toBe(true);
  });
});
