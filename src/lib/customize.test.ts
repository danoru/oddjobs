import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { characterSchema } from "./schema";
import { applyTweaks, decodeTweaks, defaultChoiceId, encodeTweaks } from "./customize";

const load = (id: string) =>
  characterSchema.parse(
    JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "content", "oneshots", "the-drowned-bell", "characters", `${id}.json`),
        "utf8",
      ),
    ),
  );

describe("applyTweaks", () => {
  const vell = load("sister-vell");
  const rook = load("rook");

  it("leaves the stock character alone", () => {
    const before = JSON.stringify(vell);
    applyTweaks(vell, { name: "Mother Vell", choices: { "bell-cantrip": "word" } });
    expect(JSON.stringify(vell)).toBe(before);
  });

  it("swaps a cantrip and its attack line in place", () => {
    const c = applyTweaks(vell, { choices: { "bell-cantrip": "word" } });
    const names = c.mech.spellcasting!.spells.map((s) => s.name);
    expect(names).toContain("Word of Radiance");
    expect(names).not.toContain("Toll the Dead");
    expect(c.mech.attacks.map((a) => a.name)).toEqual(["Warhammer (Matins)", "Word of Radiance", "Sacred Flame"]);
  });

  it("swaps a weapon and renames it in the pack", () => {
    const c = applyTweaks(rook, { choices: { ranged: "hand-crossbow" } });
    expect(c.mech.attacks.find((a) => a.option === "ranged")!.name).toBe("Hand Crossbow");
    expect(c.mech.equipment.find((e) => e.option === "ranged")!.name).toBe("Hand Crossbow");
  });

  it("applies identity tweaks and trinkets", () => {
    const c = applyTweaks(rook, { name: "Rooke", pronouns: "they/them", choices: { trinket: "ledger" } });
    expect(c.name).toBe("Rooke");
    expect(c.story.pronouns).toBe("they/them");
    expect(c.story.trinket).toMatch(/ledger/);
  });

  it("ignores unknown choices", () => {
    const c = applyTweaks(rook, { choices: { ranged: "trebuchet", nope: "x" } });
    expect(c.mech.attacks.find((a) => a.option === "ranged")!.name).toBe("Shortbow");
  });

  it("finds the stock choice", () => {
    expect(defaultChoiceId(vell, vell.options[0])).toBe("toll");
    expect(defaultChoiceId(rook, rook.options[1])).toBe("coin");
  });
});

describe("share links", () => {
  it("round-trips unicode", () => {
    const t = { name: "Odo Brambletoe ♪", choices: { a: "b" } };
    expect(decodeTweaks(encodeTweaks(t))).toEqual(t);
  });
  it("rejects garbage", () => {
    expect(decodeTweaks("!!!not-base64")).toBeNull();
    expect(decodeTweaks(encodeTweaks({ portrait: "javascript:alert(1)" } as never))).toBeNull();
  });
});
