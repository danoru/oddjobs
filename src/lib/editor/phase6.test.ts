import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpellBook } from "@/lib/content";
import { checkDoc, type OneShotDoc } from "@/lib/oneShotCheck";
import { docFromFiles } from "@/lib/store/doc";
import { hintFor, schemaAt } from "./schemaAt";
import { SYSTEMS } from "@/systems/registry";

/** A real one-shot as the builder sees it. */
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
const at = (doc: OneShotDoc, p: (string | number)[]) => checkDoc(doc, spells).issues.filter((i) => i.path.join(".") === p.join("."));

describe("the builder: acts, rumors, notices and coins", () => {
  it("lists them in every system's table-play section, with labels from the schema", () => {
    for (const sys of Object.values(SYSTEMS)) {
      const table = sys.editor.oneshotSections.find((s) => s.id === "table")!;
      for (const f of ["acts", "rumors", "notices"]) expect(table.fields).toContain(f);
      for (const f of ["acts", "rumors", "notices", "letters.0.act"])
        expect(schemaAt(sys.id, ["oneshot", ...f.split(".").map((x) => (/^\d+$/.test(x) ? Number(x) : x))], realDocFor(sys.id))).not.toBeNull();
    }
    const fiveE = SYSTEMS.dnd5e.editor.oneshotSections.find((s) => s.id === "table")!;
    expect(fiveE.fields).toContain("coins");
    expect(SYSTEMS.tencandles.editor.oneshotSections.find((s) => s.id === "table")!.fields).not.toContain("coins");
    expect(hintFor(SYSTEMS.dnd5e.editor, ["oneshot", "letters", 0, "act"]).widget).toBe("actRef");
  });

  it("flags a rumor without a truth, an over-long act title and a letter opening at an act that isn't there", () => {
    const doc = realDoc("the-drowned-bell");
    const o = doc.oneshot as { rumors: { truth?: string }[]; acts: { title: string }[]; letters: { act?: string }[] };
    o.rumors[0].truth = "maybe";
    o.acts[0].title = "x".repeat(61);
    expect(at(doc, ["oneshot", "rumors", 0, "truth"]).length).toBeGreaterThan(0);
    expect(at(doc, ["oneshot", "acts", 0, "title"]).length).toBeGreaterThan(0);
    // Cross-checks run once the shapes parse.
    const linked = realDoc("the-drowned-bell");
    (linked.oneshot as { letters: { act?: string }[] }).letters[0].act = "no-such-act";
    expect(checkDoc(linked, spells).issues.some((i) => /opens at unknown act "no-such-act"/.test(i.message))).toBe(true);
  });

  it("flags coin settings out of range, and a notice of an unknown kind", () => {
    const doc = realDoc("the-drowned-bell");
    (doc.oneshot as Record<string, unknown>).coins = { tossesPerAct: 9 };
    (doc.oneshot as { notices: { kind: string }[] }).notices[0].kind = "rumour";
    expect(at(doc, ["oneshot", "coins", "tossesPerAct"]).length).toBeGreaterThan(0);
    expect(at(doc, ["oneshot", "notices", 0, "kind"]).length).toBeGreaterThan(0);
  });

  it("passes the real one-shots as written", () => {
    for (const slug of ["the-drowned-bell", "lights-out-at-marrowby", "lot-thirteen", "the-cooling-concord"])
      expect(checkDoc(realDoc(slug), spells).issues).toEqual([]);
  });
});

function realDocFor(system: string) {
  return realDoc(system === "dnd5e" ? "the-drowned-bell" : "lights-out-at-marrowby");
}

describe("the builder: homebrew one-shots", () => {
  it("skips the 5e rules checks when a one-shot is homebrew, and keeps them otherwise", () => {
    const strict = realDoc("the-drowned-bell");
    const c = strict.cast[0] as { mech: { hp: number; saves: string[] } };
    c.mech.hp = 999;
    c.mech.saves = ["str", "dex", "con"];
    const issues = checkDoc(strict, spells).issues.map((i) => i.message);
    expect(issues.some((m) => /HP 999/.test(m))).toBe(true);
    expect(issues.some((m) => /2 saving throw/.test(m))).toBe(true);

    (strict.oneshot as Record<string, unknown>).homebrew = true;
    expect(checkDoc(strict, spells).issues).toEqual([]);
  });

  it("still checks what the pages need in a homebrew one-shot", () => {
    const doc = realDoc("the-drowned-bell");
    (doc.oneshot as Record<string, unknown>).homebrew = true;
    (doc.cast[0] as { story: { ties: { to: string }[] } }).story.ties[0].to = "nobody-here";
    expect(checkDoc(doc, spells).issues.some((i) => /unknown character "nobody-here"/.test(i.message))).toBe(true);
  });
});
