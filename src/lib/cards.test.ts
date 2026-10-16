import { describe, expect, it } from "vitest";
import { loadAll, loadOneShot, loadSpellBook } from "./content";
import { cardsFor, fitFor, paginate, resolveSpell, spellKicker, spellNames, weaponNotes } from "./cards";
import { withVariant } from "./variants";

const book = loadSpellBook();
const bell = loadOneShot("the-drowned-bell");
const lot = loadOneShot("lot-thirteen");
const byId = (os: typeof bell, id: string) => os.cast.find((c) => c.id === id)!;

describe("spell book", () => {
  it("has every spell the content uses, at the level the content says", () => {
    for (const os of loadAll()) {
      const casts = [os.cast, ...os.variants.map((v) => v.cast.map((x) => ({ ...x, options: x.options ?? [] })))];
      for (const name of spellNames(casts)) expect(book[name], name).toBeDefined();
      for (const cast of casts)
        for (const c of cast)
          for (const sp of c.mech.spellcasting?.spells ?? []) expect(book[sp.name].level, sp.name).toBe(sp.level);
    }
  });

  it("folds in the edition that applies", () => {
    expect(resolveSpell(book["Healing Word"], "2024").text).toContain("2d4");
    expect(resolveSpell(book["Healing Word"], "2014").text).toContain("1d4");
    expect(resolveSpell(book["Healing Word"], "2014").school).toBe("evocation");
    expect(resolveSpell(book["Sleep"], "2014").text).not.toBe(resolveSpell(book["Sleep"], "2024").text);
  });

  it("names the spell's level and school like a card would", () => {
    expect(spellKicker({ level: 0, school: "evocation", ritual: false, concentration: false })).toBe("Evocation cantrip");
    expect(spellKicker({ level: 3, school: "conjuration", ritual: false, concentration: true })).toBe(
      "3rd-level conjuration · concentration",
    );
  });
});

describe("cards for a character", () => {
  it("makes a card per spell, weapon, kept item and feature", () => {
    const vell = byId(bell, "sister-vell");
    const cards = cardsFor(vell, "2024", book);
    const spells = cards.filter((c) => c.kind === "spell");
    expect(spells).toHaveLength(vell.mech.spellcasting!.spells.length);
    expect(cards.filter((c) => c.kind === "feature")).toHaveLength(vell.mech.features.length);
    // Spells come first, lowest level first.
    expect(cards[0].kind).toBe("spell");
    expect(spells[0].kicker).toMatch(/cantrip/);
    // Every card says whose it is, and spell cards carry the DC.
    expect(spells.every((c) => c.owner.startsWith("Sister Vell · DC 15"))).toBe(true);
  });

  it("puts the character's own attack line on attack spells", () => {
    const vell = byId(withVariant(bell, 3), "sister-vell");
    const toll = cardsFor(vell, "2024", book).find((c) => c.title === "Toll the Dead")!;
    expect(toll.more).toMatch(/Yours: DC 13 WIS · 1d8 necrotic/);
  });

  it("explains weapon properties and masteries", () => {
    const rook = byId(bell, "rook");
    const sword = cardsFor(rook, "2024", book, ["item"]).find((c) => c.title === "Shortsword")!;
    expect(sword.stats).toEqual([
      { label: "To hit", value: "+7" },
      { label: "Damage", value: "1d6 + 4 piercing" },
    ]);
    expect(sword.text).toMatch(/^Finesse: .*Light: .*Mastery, Vex: /);
    expect(weaponNotes({ properties: ["Versatile (1d10)"], mastery: undefined })[0]).toMatch(/\(1d10\)$/);
  });

  it("doesn't card a weapon twice, or plain packs, and gives ammunition tick-boxes", () => {
    const rook = byId(bell, "rook");
    const items = cardsFor(rook, "2024", book, ["item"]);
    expect(items.filter((c) => c.title.includes("Shortsword"))).toHaveLength(1);
    expect(items.some((c) => /Burglar's Pack/.test(c.title))).toBe(false);
    expect(items.find((c) => c.title === "Arrows")?.boxes).toEqual({ n: 20, label: "left" });
    expect(items.find((c) => c.title === "Dagger")?.boxes).toEqual({ n: 2, label: "carried" });
  });

  it("gives uses boxes to limited features", () => {
    const rook = byId(bell, "rook");
    const rush = cardsFor(rook, "2024", book, ["feature"]).find((c) => c.title === "Adrenaline Rush")!;
    expect(rush.boxes).toEqual({ n: 3, label: "per short rest" });
  });

  it("uses 2014 spell text for 2014 one-shots", () => {
    const tobias = byId(lot, "tobias-larke");
    const cards = cardsFor(tobias, "2014", book, ["spell"]);
    expect(cards.length).toBe(tobias.mech.spellcasting!.spells.length);
    const word = cards.find((c) => c.title === "Healing Word");
    if (word) expect(word.text).toContain("1d4");
  });

  it("steps text size down as it grows", () => {
    expect(fitFor(120)).toBe("roomy");
    expect(fitFor(400)).toBe("snug");
    expect(fitFor(600)).toBe("tight");
  });
});

describe("paginate", () => {
  it("cuts into pages of nine, or of four", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(paginate(xs).map((p) => p.length)).toEqual([9, 9, 2]);
    expect(paginate(xs, 4)).toHaveLength(5);
    expect(paginate([])).toEqual([]);
  });
});
