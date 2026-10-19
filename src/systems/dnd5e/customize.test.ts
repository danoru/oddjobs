import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { characterSchema } from "@/systems/dnd5e/schema";
import {
  PORTRAIT_DATA_MAX,
  applyTweaks,
  decodeTweaks,
  defaultChoiceId,
  emptyTweaks,
  encodeTweaks,
  hasTweaks,
  tweaksSchema,
} from "./customize";

const load = (id: string) =>
  characterSchema.parse(
    JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "content", "oneshots", "the-drowned-bell", "characters", `${id}.json`),
        "utf8",
      ),
    ),
  );

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

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

  it("uses an uploaded portrait, and it beats a linked one", () => {
    expect(applyTweaks(rook, { portrait: "https://example.com/a.png", choices: {} }).portrait).toBe(
      "https://example.com/a.png",
    );
    const c = applyTweaks(rook, { portrait: "https://example.com/a.png", portraitData: PNG, choices: {} });
    expect(c.portrait).toBe(PNG);
    expect(applyTweaks(rook, { portraitData: PNG, choices: {} }).portrait).toBe(PNG);
    expect(rook.portrait).not.toBe(PNG);
  });

  it("counts an uploaded portrait as a tweak", () => {
    expect(hasTweaks(emptyTweaks())).toBe(false);
    expect(hasTweaks({ portraitData: PNG, choices: {} })).toBe(true);
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

describe("portraitData", () => {
  const parse = (portraitData: unknown) => tweaksSchema.safeParse({ choices: {}, portraitData }).success;

  it("accepts png, webp and jpeg data URLs", () => {
    expect(parse(PNG)).toBe(true);
    expect(parse("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(parse("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(parse("https://example.com/a.png")).toBe(false);
    expect(parse("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(false);
    expect(parse("data:image/gif;base64,R0lGODlh")).toBe(false);
    expect(parse("data:text/html;base64,PGgxPg==")).toBe(false);
    expect(parse("data:image/png;base64,")).toBe(false);
    expect(parse("data:image/png;base64,abc def")).toBe(false);
    expect(parse("data:image/png,<svg/onload=alert(1)>")).toBe(false);
  });

  it("caps the size", () => {
    const body = "A".repeat(PORTRAIT_DATA_MAX - "data:image/png;base64,".length);
    expect(parse("data:image/png;base64," + body)).toBe(true);
    expect(parse("data:image/png;base64," + body + "AAAA")).toBe(false);
  });
});

describe("share links", () => {
  it("omits portraitData but keeps everything else", () => {
    const t = { name: "Odo", portrait: "https://example.com/a.png", portraitData: PNG, choices: { a: "b" } };
    const encoded = encodeTweaks(t);
    expect(encoded).not.toContain(PNG.slice(30, 60));
    expect(encoded.length).toBeLessThan(200);
    expect(decodeTweaks(encoded)).toEqual({ name: "Odo", portrait: "https://example.com/a.png", choices: { a: "b" } });
    expect(t.portraitData).toBe(PNG); // input is not mutated
  });

  it("round-trips unicode", () => {
    const t = { name: "Odo Brambletoe ♪", choices: { a: "b" } };
    expect(decodeTweaks(encodeTweaks(t))).toEqual(t);
  });
  it("rejects garbage", () => {
    expect(decodeTweaks("!!!not-base64")).toBeNull();
    expect(decodeTweaks(encodeTweaks({ portrait: "javascript:alert(1)" } as never))).toBeNull();
  });
});
