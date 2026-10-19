import { describe, expect, it } from "vitest";
import { load5e } from "@/lib/content";
import { foundryActor } from "./foundry";
import { ddbRecipe, recipeText } from "./ddb";

const bell = load5e("the-drowned-bell");
const get = (id: string) => bell.cast.find((c) => c.id === id)!;

describe("Foundry actor (lite)", () => {
  it("carries stats, proficiencies and overrides", () => {
    const a = foundryActor(get("rook"), bell);
    expect(a.type).toBe("character");
    expect(a.system.abilities.dex).toEqual({ value: 18, proficient: 1 });
    expect(a.system.abilities.str).toEqual({ value: 8, proficient: 0 });
    expect(a.system.skills.ste.value).toBe(2);
    expect(a.system.skills.acr.value).toBe(1);
    expect(a.system.skills.ath.value).toBe(0);
    expect(a.system.attributes.hp).toEqual({ value: 43, max: 43, temp: 0 });
    expect(a.system.attributes.ac).toEqual({ calc: "flat", flat: 16 });
    expect(a.system.attributes.senses.darkvision).toBe(120);
  });

  it("embeds class, weapons and features", () => {
    const a = foundryActor(get("rook"), bell);
    const cls = a.items.find((i) => i.type === "class")!;
    expect(cls.name).toBe("Rogue");
    expect((cls.system as { levels: number }).levels).toBe(5);
    const sword = a.items.find((i) => i.type === "weapon" && i.name === "Shortsword")!;
    expect((sword.system as { damage: unknown }).damage).toEqual({
      base: { number: 1, denomination: 6, types: ["piercing"] },
    });
    expect(a.items.some((i) => i.type === "feat" && i.name === "Sneak Attack (3d6)")).toBe(true);
    // Weapons aren't duplicated as loot.
    expect(a.items.filter((i) => i.name === "Shortsword")).toHaveLength(1);
  });

  it("writes slot overrides and spells", () => {
    const a = foundryActor(get("sister-vell"), bell);
    expect(a.system.spells).toMatchObject({ spell1: { override: 4 }, spell2: { override: 3 }, spell3: { override: 2 } });
    const spells = a.items.filter((i) => i.type === "spell");
    expect(spells.length).toBe(get("sister-vell").mech.spellcasting!.spells.length);
  });

  it("gives every embedded item a unique 16-char id", () => {
    for (const c of bell.cast) {
      const ids = foundryActor(c, bell).items.map((i) => i._id as string);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{16}$/);
    }
  });

  it("is stable across runs", () => {
    expect(JSON.stringify(foundryActor(get("marrow"), bell))).toBe(JSON.stringify(foundryActor(get("marrow"), bell)));
  });
});

describe("D&D Beyond recipe", () => {
  it("lists the builder steps in order", () => {
    const titles = ddbRecipe(get("sister-vell"), "2024").map((s) => s.title);
    expect(titles).toEqual([
      "Start a character",
      "Class",
      "Background",
      "Species",
      "Abilities",
      "Equipment",
      "Spells",
      "Description",
      "Check it matches",
    ]);
  });

  it("spells out overrides and the check line", () => {
    const text = recipeText(get("rook"), "2024");
    expect(text).toContain("Dexterity 18 (+4)");
    expect(text).toContain("HP 43 · AC 16 · Initiative +7 · Passive Perception 17");
    expect(text).toContain("Origin feat: Alert.");
  });
});
