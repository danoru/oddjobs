import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cameoHook, cameosFor, type Survivor } from "./legacy";
import { loadSurvivors } from "./legacy.server";

const rec = (over: Partial<Survivor>): Survivor => ({
  id: "the-drowned-bell/rook/2026-10-15",
  oneshot: "the-drowned-bell",
  oneshotTitle: "The Drowned Bell",
  characterId: "rook",
  name: "Rook",
  epithet: "the Knife",
  fate: "survived",
  date: "2026-10-15",
  ...over,
});

describe("cameos", () => {
  const all = [
    rec({}),
    rec({ id: "the-drowned-bell/marrow/2026-10-15", characterId: "marrow", name: "Marrow", fate: "fell" }),
    rec({ id: "lot-thirteen/dagny-brask/2026-11-01", oneshot: "lot-thirteen", characterId: "dagny-brask", name: "Dagny", date: "2026-11-01" }),
  ];
  it("only suggests living characters from other one-shots, newest first", () => {
    expect(cameosFor("the-cooling-concord", all).map((s) => s.name)).toEqual(["Dagny", "Rook"]);
    expect(cameosFor("the-drowned-bell", all).map((s) => s.name)).toEqual(["Dagny"]);
  });
  it("writes a hook using the earned title when there is one", () => {
    expect(cameoHook(rec({ title: "Bell-thief" }))).toBe("Rook, the Bell-thief. Last seen after The Drowned Bell.");
    expect(cameoHook(rec({}))).toBe("Rook, the Knife. Last seen after The Drowned Bell.");
  });
});

describe("loadSurvivors", () => {
  it("merges files, later record ids winning, and rejects bad files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-"));
    fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify([rec({ line: "first" })]));
    fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify([rec({ line: "second" })]));
    expect(loadSurvivors(dir).map((s) => s.line)).toEqual(["second"]);
    fs.writeFileSync(path.join(dir, "c.json"), JSON.stringify([{ id: "nope" }]));
    expect(() => loadSurvivors(dir)).toThrow(/c\.json is invalid/);
  });
  it("is empty when there's no legacy folder", () => {
    expect(loadSurvivors(path.join(os.tmpdir(), "definitely-not-here-tearoff"))).toEqual([]);
  });
});
