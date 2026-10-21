import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadSpellBook } from "@/lib/content";
import { checkDoc, type OneShotDoc } from "@/lib/oneShotCheck";
import {
  coerceDoc,
  docFromFiles,
  docToFiles,
  getAt,
  moveItem,
  normalizeDoc,
  removeCharacter,
  renameCharacterId,
  setAt,
  slugify,
  slugProblem,
} from "@/lib/store/doc";
import { formatJson, jsonEqual } from "@/lib/store/json";
import { hintFor, maxLength, schemaAt, unlistedKeys } from "./schemaAt";
import { sharedWithSecret, publicTieWarning } from "./warnings";
import { SYSTEMS } from "@/systems/registry";
import {
  deriveLoose,
  hpBreakdown,
  isStandardArray,
  looseMech,
  pointBuyCost,
  rankAbilities,
  standardArray,
  CLASS_PRIORITY,
  suggestedSlots,
} from "@/systems/dnd5e/editorMath";

/** A real one-shot as the builder sees it, read from its files. */
function realDoc(slug: string): OneShotDoc {
  const dir = path.join(process.cwd(), "content", "oneshots", slug);
  const files = new Map<string, unknown>();
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`);
      else files.set(`${rel}${e.name}`, JSON.parse(fs.readFileSync(path.join(d, e.name), "utf8")));
    }
  };
  walk(dir, "");
  return docFromFiles(files);
}
const spells = loadSpellBook();

describe("doc ↔ files", () => {
  it("splits a doc into the files the build reads, and joins them back", () => {
    const doc = realDoc("the-drowned-bell");
    const files = docToFiles(doc, "the-drowned-bell");
    expect([...files.keys()].sort()).toEqual(
      [
        "oneshot.json",
        ...doc.cast.map((c) => `characters/${c.id}.json`),
        ...doc.cast.map((c) => `variants/3/${c.id}.json`),
      ].sort(),
    );
    expect(jsonEqual(docFromFiles(files), doc)).toBe(true);
  });

  it("keeps board order in `order` and the slug in step with the folder", () => {
    const doc = realDoc("lot-thirteen");
    const moved = { ...doc, cast: moveItem(doc.cast, 4, 0) };
    const files = docToFiles(moved, "renamed-heist");
    expect((files.get("oneshot.json") as { slug: string }).slug).toBe("renamed-heist");
    expect((files.get(`characters/${doc.cast[4].id}.json`) as { order: number }).order).toBe(1);
    expect(normalizeDoc(moved, "x").cast.map((c) => c.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses ids that can't be file names", () => {
    const doc = realDoc("lights-out-at-marrowby");
    for (const bad of ["../x", "a/b", "A", "", "x\\y"])
      expect(() => docToFiles({ ...doc, cast: [{ ...doc.cast[0], id: bad }] }, "ok")).toThrow();
    expect(() => docToFiles(doc, "../up")).toThrow();
    expect(() => docToFiles({ ...doc, cast: [doc.cast[0], doc.cast[0]] }, "ok")).toThrow(/two characters/);
  });

  it("turns anything imported into a well-formed doc, keeping unknown keys", () => {
    expect(coerceDoc(null)).toEqual({ oneshot: {}, cast: [], variants: [] });
    const doc = coerceDoc({ oneshot: { title: "x", acts: [1] }, cast: [{ id: "a" }, 3], variants: [{ level: "3", cast: [] }] });
    expect(doc.oneshot).toEqual({ title: "x", acts: [1] });
    expect(doc.cast).toEqual([{ id: "a" }]);
    expect(doc.variants).toEqual([{ level: 3, cast: [] }]);
  });

  it("writes JSON the way the hand-written files look", () => {
    const text = formatJson({ id: "x", tags: ["a", "b"], ties: [{ to: "y", text: "long ".repeat(30) }], nested: { a: { b: [{ c: 1 }] } } });
    expect(text).toContain('"tags": ["a", "b"]');
    expect(text).toMatch(/\n {4}\{ "to": "y", "text": "long /);
    expect(JSON.parse(text)).toBeTruthy();
    expect(text.endsWith("}\n")).toBe(true);
  });
});

describe("form edits", () => {
  it("sets values at a path, and an emptied field leaves the JSON", () => {
    const doc = { oneshot: { posting: { header: "X" } }, cast: [], variants: [] } as OneShotDoc;
    const a = setAt(doc, ["oneshot", "posting", "reward"], "Gold");
    expect(getAt(a, ["oneshot", "posting"])).toEqual({ header: "X", reward: "Gold" });
    expect(doc.oneshot.posting).toEqual({ header: "X" }); // not mutated
    const b = setAt(a, ["oneshot", "posting", "header"], undefined);
    expect(JSON.stringify(b.oneshot)).toBe('{"posting":{"reward":"Gold"}}');
    const c = setAt(b, ["oneshot", "letters", 0, "to"], "ada");
    expect(c.oneshot.letters).toEqual([{ to: "ada" }]);
    expect(setAt(c, ["oneshot", "letters", 0], undefined).oneshot.letters).toEqual([]);
  });

  it("renames a character everywhere they're pointed at", () => {
    const doc = renameCharacterId(realDoc("the-drowned-bell"), "rook", "the-rook");
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/"rook"/);
    expect(doc.cast.some((c) => c.id === "the-rook")).toBe(true);
    expect(doc.variants[0].cast.some((c) => c.id === "the-rook")).toBe(true);
    expect(checkDoc(doc, spells).issues).toEqual([]);
  });

  it("removes a character and whatever would dangle", () => {
    const doc = removeCharacter(realDoc("the-drowned-bell"), "rook");
    expect(JSON.stringify(doc)).not.toMatch(/"rook"/);
    expect(doc.variants[0].cast).toHaveLength(4);
  });

  it("makes slugs from titles and keeps site pages free", () => {
    expect(slugify("The Drowned Bell")).toBe("the-drowned-bell");
    expect(slugify("Ça n’est pas — l'été!")).toBe("ca-nest-pas-lete");
    expect(slugProblem("admin")).toMatch(/already a page/);
    expect(slugProblem("Bad Slug")).toMatch(/lowercase/);
    expect(slugProblem("fine-one")).toBeNull();
  });
});

describe("schema lookup for the form", () => {
  it("finds the Zod type, label and limit behind a path", () => {
    const hook = schemaAt("dnd5e", ["cast", 0, "poster", "hook"])!;
    expect(hook.description).toBe("Hook");
    expect(maxLength(hook.schema)).toBe(90);
    const pub = schemaAt("tencandles", ["cast", 2, "story", "ties", 0, "public"])!;
    expect(pub.optional).toBe(true);
    expect(maxLength(pub.schema)).toBe(80);
    const stage = schemaAt("tencandles", ["oneshot", "module", "stages", 1, "candles"])!;
    expect(stage.schema).toBeInstanceOf(z.ZodNumber);
    const variantHp = schemaAt("dnd5e", ["variants", 0, "cast", 3, "mech", "hp"])!;
    expect(variantHp.description).toBe("Hit points");
    expect(schemaAt("dnd5e", ["oneshot", "nope"])).toBeNull();
  });

  it("follows a discriminated union by the item's kind", () => {
    const doc = { oneshot: {}, cast: [{ options: [{ kind: "trinket" }, { kind: "spell" }] }], variants: [] } as unknown as OneShotDoc;
    const trinketChoice = schemaAt("dnd5e", ["cast", 0, "options", 0, "choices", 0, "value"], doc)!;
    expect(trinketChoice.schema).toBeInstanceOf(z.ZodString);
    const spellChoice = schemaAt("dnd5e", ["cast", 0, "options", 1, "choices", 0, "value"], doc)!;
    expect(spellChoice.schema).toBeInstanceOf(z.ZodObject);
  });

  it("picks hints by pattern, per scope", () => {
    const ed = SYSTEMS.dnd5e.editor;
    expect(hintFor(ed, ["cast", 3, "story", "ties", 1, "to"]).widget).toBe("castRef");
    expect(hintFor(ed, ["oneshot", "letters", 0, "to"]).widget).toBe("castRef");
    expect(hintFor(ed, ["variants", 0, "cast", 1, "mech", "spellcasting", "spells", 2, "name"]).widget).toBe("spell");
  });

  it("lists every schema field in some section, so nothing is unreachable", () => {
    for (const [id, sys] of Object.entries(SYSTEMS)) {
      const skip = ["system", "order", "mech", "variants"];
      const o = unlistedKeys(id as "dnd5e", "oneshot", sys.editor.oneshotSections.flatMap((x) => x.fields ?? []), skip);
      const c = unlistedKeys(id as "dnd5e", "character", sys.editor.characterSections.flatMap((x) => x.fields ?? []), skip);
      expect([id, o, c]).toEqual([id, [], []]);
    }
  });

  it("puts a field nobody listed under Other fields", () => {
    expect(unlistedKeys("dnd5e", "character", ["story.concept"], ["system", "order", "mech", "variants"])).toEqual(
      expect.arrayContaining(["id", "poster", "story.secret", "options"]),
    );
  });

  it("every section field path exists in the schema", () => {
    for (const [id, sys] of Object.entries(SYSTEMS)) {
      for (const sec of sys.editor.oneshotSections)
        for (const f of sec.fields ?? []) expect(schemaAt(id as "dnd5e", ["oneshot", ...f.split(".")]), `${id} ${f}`).not.toBeNull();
      for (const sec of sys.editor.characterSections)
        for (const f of sec.fields ?? []) expect(schemaAt(id as "dnd5e", ["cast", 0, ...f.split(".")]), `${id} ${f}`).not.toBeNull();
    }
  });
});

describe("live checks on a draft", () => {
  it("passes every real one-shot", () => {
    for (const slug of ["the-drowned-bell", "lot-thirteen", "the-cooling-concord", "lights-out-at-marrowby", "a-vow-before-dawn", "open-in-case-of-future"]) {
      const { issues, parsed } = checkDoc(realDoc(slug), spells);
      expect([slug, issues]).toEqual([slug, []]);
      expect(parsed?.slug).toBe(slug);
    }
  });

  it("starts each system's new one-shot and character as drafts that say what's missing", () => {
    for (const sys of Object.values(SYSTEMS)) {
      const doc: OneShotDoc = { oneshot: sys.editor.newOneShot("new-one", "New One"), cast: [], variants: [] };
      doc.cast.push({ ...sys.editor.newCharacter(doc, "someone", "Someone"), order: 1 });
      const { issues } = checkDoc(doc, spells);
      const keys = issues.map((i) => i.path.join("."));
      expect(keys).toContain("oneshot.pitch");
      expect(keys).toContain("cast.0.poster.hook");
    }
  });

  it("points schema problems and check messages at their fields", () => {
    const doc = realDoc("the-drowned-bell");
    const keyOf = (d: OneShotDoc) => checkDoc(d, spells).issues.map((i) => i.path.join("."));

    const longHook = setAt(doc, ["cast", 1, "poster", "hook"], "x".repeat(91));
    expect(keyOf(longHook)).toEqual(["cast.1.poster.hook"]);

    const hp = setAt(doc, ["cast", 2, "mech", "hp"], 999);
    expect(keyOf(hp)).toEqual(["cast.2.mech.hp"]);

    const variantHp = setAt(doc, ["variants", 0, "cast", 0, "mech", "hp"], 999);
    expect(keyOf(variantHp)).toEqual(["variants.0.cast.0.mech.hp"]);

    const badTie = setAt(doc, ["cast", 0, "story", "ties", 0, "to"], "nobody");
    expect(keyOf(badTie)).toEqual(["cast.0.story.ties.0.to"]);

    const spell = setAt(doc, ["cast", 0, "mech", "spellcasting", "spells", 0, "name"], "Not A Spell");
    expect(keyOf(spell)).toEqual(["cast.0.mech.spellcasting.spells.0.name"]);

    const letter = setAt(doc, ["oneshot", "letters", 0, "to"], "nobody");
    expect(keyOf(letter)).toEqual(["oneshot.letters.0.to"]);
  });

  it("checks each character's rules while another character is still half-written", () => {
    let doc = realDoc("the-drowned-bell");
    doc = setAt(doc, ["cast", 2, "mech", "hp"], 999);
    doc = setAt(doc, ["cast", 4, "poster"], undefined);
    const keys = checkDoc(doc, spells).issues.map((i) => i.path.join("."));
    expect(keys).toContain("cast.2.mech.hp");
    expect(keys.some((k) => k.startsWith("cast.4.poster"))).toBe(true);
  });
});

describe("Daggerheart checks in the builder", () => {
  it("points each rules problem at its field", () => {
    const doc = realDoc("a-vow-before-dawn");
    const keyOf = (d: OneShotDoc) => checkDoc(d, spells).issues.map((i) => i.path.join("."));
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "evasion"], 3))).toEqual(["cast.1.mech.evasion"]);
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "hp"], 11))).toEqual(["cast.1.mech.hp"]);
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "thresholds", "major"], 2))).toEqual(["cast.1.mech.thresholds"]);
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "traits", "agility"], 2))).toEqual(["cast.1.mech.traits"]);
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "domainCards", 0, "name"], "Rune Ward"))).toEqual(["cast.1.mech.domainCards.0.name"]);
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "subclass"], "Troubadour"))).toEqual(["cast.1.mech.subclass"]);
  });

  it("checks a half-written Daggerheart character as it's typed", () => {
    const doc = realDoc("a-vow-before-dawn");
    const broken = setAt(setAt(doc, ["cast", 0, "poster", "hook"], undefined), ["cast", 1, "mech", "stress"], 9);
    const keys = checkDoc(broken, spells).issues.map((i) => i.path.join("."));
    expect(keys).toContain("cast.0.poster.hook");
    expect(keys).toContain("cast.1.mech.stress");
  });
});

describe("Paranoia checks in the builder", () => {
  it("points each problem at its field", () => {
    const doc = realDoc("open-in-case-of-future");
    const keyOf = (d: OneShotDoc) => checkDoc(d, spells).issues.map((i) => i.path.join("."));
    const skills = doc.cast[1].mech as { skills: Record<string, number> };
    const first = Object.keys(skills.skills).find((k) => skills.skills[k] === 5)!;
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "skills", first], 4))).toEqual(["cast.1.mech.skills"]);
    const first0 = (doc.cast[0].mech as { clone: Record<string, unknown> }).clone;
    expect(keyOf(setAt(doc, ["cast", 1, "mech", "clone"], { ...first0 }))).toEqual(["cast.1.mech.clone.name"]);
    expect(keyOf(setAt(doc, ["cast", 1, "naughty", "society"], " "))).toEqual(["cast.1.naughty.society"]);
  });
});

describe("rules help", () => {
  it("lays out the standard array and counts point buy", () => {
    const wiz = standardArray(CLASS_PRIORITY.wizard);
    expect(wiz).toEqual({ int: 15, con: 14, dex: 13, wis: 12, cha: 10, str: 8 });
    expect(isStandardArray(wiz)).toBe(true);
    expect(rankAbilities({ str: 8, dex: 16, con: 12, int: 10, wis: 14, cha: 9 })).toEqual(["dex", "wis", "con", "int", "cha", "str"]);
    expect(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(pointBuyCost({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNull();
  });

  it("works out HP with the extras the rules check counts, and the slot table", () => {
    const fighter = looseMech({ species: "Dwarf", classes: [{ name: "Fighter", level: 3 }], abilities: { con: 14 }, feats: ["Tough"] });
    const hp = hpBreakdown(fighter, "2024")!;
    expect(hp.total).toBe(10 + 2 * 6 + 3 * 2 + 3 + 6);
    expect(hp.extras).toEqual(["Tough +6", "dwarf +3"]);
    expect(suggestedSlots(looseMech({ classes: [{ name: "Paladin", level: 2 }] }), "2014").slots).toEqual([2]);
    expect(suggestedSlots(looseMech({ classes: [{ name: "Warlock", level: 3 }] }), "2024").pact).toEqual({ count: 2, level: 2 });
  });

  it("derives numbers from a half-typed character without throwing", () => {
    expect(deriveLoose({})).toBeNull();
    const d = deriveLoose({ classes: [{ name: "Rogue", level: 5 }], abilities: { dex: 17 }, skills: ["stealth"], expertise: ["stealth"] })!;
    expect(d.prof).toBe(3);
    expect(d.skills.stealth.total).toBe(3 + 6);
  });
});

describe("soft warnings", () => {
  it("notices a board-safe line that echoes the secret", () => {
    expect(sharedWithSecret("Old friends from the docks", "He sold her to the smugglers at the docks")).toEqual(["docks"]);
    expect(sharedWithSecret("Share a desk", "She forged the letters")).toEqual([]);
    const doc = { oneshot: {}, cast: [{ story: { secret: "She forged the letters herself" } }], variants: [] } as unknown as OneShotDoc;
    expect(publicTieWarning("She forged letters for Cora", doc, ["cast", 0, "story", "ties", 0, "public"])).toMatch(/forged/);
    expect(publicTieWarning("Old debts", doc, ["cast", 0, "story", "ties", 0, "public"])).toBeNull();
  });
});
