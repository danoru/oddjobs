import { describe, expect, it } from "vitest";
import { applyEdits, buildTapestry, stripNoteText } from "./tapestry";
import { viewEvents, type LiveRow, type Person } from "./live";

const people: Person[] = [
  { playerId: "aaaaaaaaaaaaaaaa1", handle: "handlea001", name: "Ann", characterId: "rook", character: "Rook", since: null },
  { playerId: "bbbbbbbbbbbbbbbb2", handle: "handleb002", name: "Bo", characterId: "marrow", character: "Marrow", since: null },
];
const at = (m: number) => new Date(Date.parse("2026-10-19T20:00:00Z") + m * 60000).toISOString();
const d20 = (label: string, value: number, who = "Rook", characterId = "rook") => ({
  system: "d20",
  who,
  characterId,
  label,
  formula: "1d20",
  dice: [{ sides: 20, value, kept: true }],
  mod: 0,
  total: value,
  mode: "normal",
  nat: value === 20 ? 20 : value === 1 ? 1 : null,
});
const rows: LiveRow[] = [
  { id: 1, kind: "act", byPlayer: null, toPlayer: null, hidden: false, data: { id: "beach", title: "The Beach", index: 0, total: 2 }, createdAt: at(5) },
  { id: 2, kind: "roll", byPlayer: "aaaaaaaaaaaaaaaa1", toPlayer: null, hidden: false, data: d20("Stealth", 20), createdAt: at(6) },
  { id: 3, kind: "roll", byPlayer: null, toPlayer: null, hidden: true, data: d20("SECRET-AMBUSH", 20, "The GM", ""), createdAt: at(7) },
  { id: 4, kind: "roll", byPlayer: "bbbbbbbbbbbbbbbb2", toPlayer: null, hidden: false, data: d20("Athletics", 1, "Marrow", "marrow"), createdAt: at(8) },
  { id: 5, kind: "note", byPlayer: "aaaaaaaaaaaaaaaa1", toPlayer: "bbbbbbbbbbbbbbbb2", hidden: false, data: { fromName: "Rook", toGm: false, toName: "Marrow", text: "NOTE-TEXT", replyTo: null }, createdAt: at(9) },
  { id: 6, kind: "roll", byPlayer: "bbbbbbbbbbbbbbbb2", toPlayer: null, hidden: false, data: d20("Perception", 12, "Marrow", "marrow"), createdAt: at(10) },
  { id: 7, kind: "act", byPlayer: null, toPlayer: null, hidden: false, data: { id: "beach", title: "The Beach", index: 0, total: 2 }, createdAt: at(11) },
  { id: 8, kind: "coin", byPlayer: "aaaaaaaaaaaaaaaa1", toPlayer: "bbbbbbbbbbbbbbbb2", hidden: false, data: { fromName: "Rook", toName: "Marrow", act: 0 }, createdAt: at(12) },
];

function panels() {
  // Built from the TV's view, as the server does.
  const events = stripNoteText(viewEvents(rows, { role: "table" }, { people, rumors: [] }));
  return buildTapestry({
    cast: [
      { id: "rook", name: "Rook" },
      { id: "marrow", name: "Marrow" },
    ],
    claims: [
      { characterId: "rook", name: "Ann", claimedAt: at(0) },
      { characterId: "marrow", name: "Bo", claimedAt: at(1) },
    ],
    letters: [
      { id: "receipt", to: "rook", openedAt: at(20) },
      { id: "sealed", to: "marrow", openedAt: null },
    ],
    events,
    epilogue: { headline: "", subhead: "", lead: "", date: "2026-10-19", entries: { rook: { fate: "survived", line: "I carried it back." } } },
  });
}

describe("the night's tapestry", () => {
  it("weaves claims, letters opened, natural 20s and 1s, acts, notes and fates, in order", () => {
    const p = panels();
    expect(p.map((x) => x.kind)).toEqual(["claim", "claim", "act", "nat20", "nat1", "letter", "notes", "coins", "fate"]);
    expect(p.find((x) => x.kind === "nat20")?.caption).toBe("Stealth");
    expect(p.find((x) => x.kind === "fate")?.caption).toContain("I carried it back.");
    expect(p.find((x) => x.id === "notes")?.title).toBe("1 note passed under the table");
  });

  it("never shows a hidden roll or a note's text", () => {
    const json = JSON.stringify(panels());
    expect(json).not.toContain("SECRET-AMBUSH");
    expect(json).not.toContain("NOTE-TEXT");
  });

  it("keeps an act raised twice to one panel, and skips letters still sealed", () => {
    const p = panels();
    expect(p.filter((x) => x.kind === "act")).toHaveLength(1);
    expect(p.filter((x) => x.kind === "letter")).toHaveLength(1);
  });

  it("applies the GM's renames and drops", () => {
    const p = panels();
    const edited = applyEdits(p, { dropped: ["claim:marrow"], titles: { "act:beach": "WHERE IT BEGAN" } });
    expect(edited.some((x) => x.id === "claim:marrow")).toBe(false);
    expect(edited.find((x) => x.id === "act:beach")?.title).toBe("WHERE IT BEGAN");
    const forGm = applyEdits(p, { dropped: ["claim:marrow"], titles: {} }, true);
    expect(forGm.find((x) => x.id === "claim:marrow")?.dropped).toBe(true);
  });

  it("weaves a Ten Candles night from candles going dark and the dead", () => {
    const pool = (darkened: boolean, died: boolean) => ({ system: "pool", who: "Ida", characterId: null, label: "Scene 1", dice: [1, 2], gmDice: [6], hope: null, success: false, narrator: "gm", darkened, died });
    const tc: LiveRow[] = [
      { id: 1, kind: "roll", byPlayer: null, toPlayer: null, hidden: false, data: pool(true, false), createdAt: at(1) },
      { id: 2, kind: "candle", byPlayer: null, toPlayer: null, hidden: false, data: { lit: 8 }, createdAt: at(2) },
      { id: 3, kind: "roll", byPlayer: null, toPlayer: null, hidden: false, data: pool(false, true), createdAt: at(3) },
      { id: 4, kind: "death", byPlayer: null, toPlayer: null, hidden: false, data: { who: "Owen" }, createdAt: at(4) },
    ];
    const p = buildTapestry({ cast: [], claims: [], letters: [], events: viewEvents(tc, { role: "table" }, { people: [], rumors: [] }), epilogue: null });
    expect(p.map((x) => x.kind)).toEqual(["darkened", "darkened", "death", "death"]);
    expect(p[3].title).toBe("Owen chooses the dark");
  });
});
