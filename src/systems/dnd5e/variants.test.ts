import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONTENT_ROOT, load5e } from "@/lib/content";
import { derive, totalLevel } from "./derive";
import { applyTweaks } from "./customize";
import { toPublic } from "@/lib/public";
import { levelsOf, pickLevel, withVariant } from "./variants";

const bell = load5e("the-drowned-bell");

describe("level variants", () => {
  it("lists every playable level, lowest first, marking the one as written", () => {
    expect(levelsOf(bell)).toEqual([
      { level: 3, note: expect.any(String), base: false },
      { level: 5, base: true },
    ]);
  });

  it("only picks offered levels", () => {
    expect(pickLevel(bell, 3)).toBe(3);
    expect(pickLevel(bell, "3")).toBe(3);
    expect(pickLevel(bell, 4)).toBe(5);
    expect(pickLevel(bell, null)).toBe(5);
    expect(pickLevel(bell, "abc")).toBe(5);
  });

  it("swaps mechanics but keeps the story", () => {
    const at3 = withVariant(bell, 3);
    expect(at3.level).toBe(3);
    for (const c of at3.cast) {
      expect(totalLevel(c)).toBe(3);
      const stock = bell.cast.find((x) => x.id === c.id)!;
      expect(c.story).toBe(stock.story);
      expect(c.poster).toBe(stock.poster);
    }
    expect(withVariant(bell, 5)).toBe(bell);
    expect(withVariant(bell, 9)).toBe(bell);
  });

  it("gets the level-3 numbers right (hand-checked against the 2024 rules)", () => {
    const rook = withVariant(bell, 3).cast.find((c) => c.id === "rook")!;
    const d = derive(rook);
    expect(d.prof).toBe(2);
    expect(rook.mech.hp).toBe(24); // 8 + 5 + 5, Con +2 × 3
    expect(rook.mech.features.some((f) => f.name === "Sneak Attack (2d6)")).toBe(true);
    expect(rook.mech.features.some((f) => /Uncanny Dodge|Cunning Strike/.test(f.name))).toBe(false);
    const merryn = withVariant(bell, 3).cast.find((c) => c.id === "merryn-vane")!;
    expect(merryn.mech.spellcasting?.pact).toEqual({ count: 2, level: 2 });
    const vell = withVariant(bell, 3).cast.find((c) => c.id === "sister-vell")!;
    expect(vell.mech.spellcasting?.slots).toEqual([4, 2]);
    expect(Math.max(...vell.mech.spellcasting!.spells.map((s) => s.level))).toBe(2);
  });

  it("keeps option ids, so tweaks saved at one level still apply at the other", () => {
    for (const c of withVariant(bell, 3).cast) {
      const stock = bell.cast.find((x) => x.id === c.id)!;
      expect(c.options.map((o) => o.id)).toEqual(stock.options.map((o) => o.id));
      const choices = Object.fromEntries(c.options.map((o) => [o.id, o.choices.at(-1)!.id]));
      expect(() => applyTweaks(c, { choices })).not.toThrow();
    }
  });

  it("carries no GM-only fields to player pages", () => {
    const pub = toPublic(bell);
    for (const v of pub.variants) for (const c of v.cast) expect(Object.keys(c).sort()).toEqual(expect.arrayContaining(["id", "mech"]));
    const json = JSON.stringify(pub.variants);
    for (const c of bell.cast) if (c.ifUnclaimed) expect(json).not.toContain(c.ifUnclaimed.npc);
    expect(json).not.toContain('"secret"');
  });
});

describe("variant loading", () => {
  /** A copy of the-drowned-bell in a temp dir, to break on purpose. */
  function copyBell(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "variants-"));
    fs.cpSync(path.join(CONTENT_ROOT, "the-drowned-bell"), path.join(root, "the-drowned-bell"), { recursive: true });
    return root;
  }
  const v3 = (root: string, id: string) => path.join(root, "the-drowned-bell", "variants", "3", `${id}.json`);

  it("needs every character at every declared level", () => {
    const root = copyBell();
    fs.rmSync(v3(root, "rook"));
    expect(() => load5e("the-drowned-bell", root)).toThrow(/level 3: no variants\/3\/rook\.json/);
  });

  it("holds each level to the same rules checks", () => {
    const root = copyBell();
    const file = v3(root, "rook");
    const rook = JSON.parse(fs.readFileSync(file, "utf8"));
    rook.mech.hp = 43;
    rook.mech.classes[0].level = 3;
    fs.writeFileSync(file, JSON.stringify(rook));
    expect(() => load5e("the-drowned-bell", root)).toThrow(/level 3: rook: HP 43, but hit dice and Con give 24/);
  });

  it("rejects undeclared variant folders", () => {
    const root = copyBell();
    fs.mkdirSync(path.join(root, "the-drowned-bell", "variants", "8"));
    expect(() => load5e("the-drowned-bell", root)).toThrow(/variants\/8 isn't declared/);
  });
});
