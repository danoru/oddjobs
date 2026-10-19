import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { characterSchema } from "@/systems/dnd5e/schema";
import { abilityMod, derive, proficiencyBonus, hitDice } from "./derive";

const load = (slug: string, id: string) =>
  characterSchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "content", "oneshots", slug, "characters", `${id}.json`), "utf8"),
    ),
  );

describe("basic math", () => {
  it("ability modifiers", () => {
    expect([1, 8, 9, 10, 11, 12, 18, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 4, 5, 10]);
  });
  it("proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
});

describe("Sister Vell (hand-checked)", () => {
  const vell = load("the-drowned-bell", "sister-vell");
  const d = derive(vell);
  it("saves, skills and passive", () => {
    expect(d.prof).toBe(3);
    expect(d.saves.wis.total).toBe(7);
    expect(d.saves.cha.total).toBe(4);
    expect(d.saves.dex.total).toBe(0);
    expect(d.skills.medicine.total).toBe(7);
    expect(d.skills.arcana.total).toBe(-1);
    expect(d.passive.perception).toBe(17);
  });
  it("spellcasting", () => {
    expect(d.spell).toEqual({ ability: "wis", dc: 15, attack: 7 });
  });
  it("attacks", () => {
    const hammer = d.attacks.find((a) => a.name.startsWith("Warhammer"))!;
    expect(hammer.toHit).toBe("+4");
    expect(hammer.damage).toBe("1d8 + 1");
    const toll = d.attacks.find((a) => a.name === "Toll the Dead")!;
    expect(toll.toHit).toBe("DC 15 WIS");
    expect(toll.damage).toBe("2d8");
  });
  it("hit dice", () => {
    expect(hitDice(vell)).toEqual([{ die: 8, count: 5 }]);
  });
});

describe("Rook (hand-checked)", () => {
  const d = derive(load("the-drowned-bell", "rook"));
  it("expertise doubles proficiency", () => {
    expect(d.skills.stealth.total).toBe(10);
    expect(d.skills.perception.total).toBe(7);
    expect(d.passive.perception).toBe(17);
  });
  it("Alert adds to initiative", () => {
    expect(d.initiative).toBe(7);
  });
  it("finesse attacks", () => {
    const sword = d.attacks.find((a) => a.name === "Shortsword")!;
    expect(sword.toHit).toBe("+7");
    expect(sword.damage).toBe("1d6 + 4");
  });
});
