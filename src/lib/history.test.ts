import { describe, expect, it } from "vitest";
import { deriveHistory, summarizeHistory, type HistoryCast, type HistoryGame } from "./history";
import { parsePrefs, defaultPrefs } from "./prefs";

const ME = "u1";
const YOU = "u2";

const cast = (withSecrets: boolean): HistoryCast => ({
  title: "The Drowned Bell",
  system: "dnd5e",
  cast: {
    rook: { name: "Rook", boardName: "Rook", epithet: "the Lamplighter", ...(withSecrets ? { secret: "He kept the drowned woman's coin." } : {}) },
    merryn: { name: "Merryn Vane", boardName: "????", epithet: "the Ghost", ...(withSecrets ? { secret: "She has already drowned." } : {}) },
  },
});

const paper = (entries: Record<string, object>, date = "2026-10-18") => ({ data: { headline: "BELL RINGS", subhead: "", lead: "", date, entries } });

const game = (over: Partial<HistoryGame> = {}): HistoryGame => ({
  code: "ABCDE",
  oneshot: "the-drowned-bell",
  status: "epilogued",
  gmId: "gm",
  coGms: [],
  claims: [],
  epilogue: null,
  finishedAt: new Date("2026-10-19T02:00:00Z"),
  createdAt: new Date("2026-10-18T18:00:00Z"),
  ...over,
});

describe("history", () => {
  it("lists every game seen to the end by role: GM, co-GM and an account's seat, one entry per role", () => {
    const games = [
      game({ code: "GMGMG", gmId: ME, finishedAt: new Date("2026-10-01T00:00:00Z"), status: "finished" }),
      game({ code: "COGMS", coGms: [{ userId: ME }], status: "finished", finishedAt: new Date("2026-10-05T00:00:00Z") }),
      game({ code: "PLAYS", claims: [{ characterId: "rook", userId: ME }], epilogue: paper({ rook: { fate: "survived", title: "Bell-thief" } }) }),
      // Ran it and held a seat too: two entries.
      game({ code: "BOTHS", gmId: ME, claims: [{ characterId: "merryn", userId: ME }], status: "finished", finishedAt: new Date("2026-09-01T00:00:00Z") }),
      // Not over yet: not history.
      game({ code: "LIVEE", gmId: ME, status: "live" }),
      game({ code: "OPENN", claims: [{ characterId: "rook", userId: ME }], status: "open" }),
      // Somebody else's night entirely.
      game({ code: "OTHER", claims: [{ characterId: "rook", userId: YOU }] }),
    ];
    const h = deriveHistory(ME, games, () => cast(false), true);
    expect(h.map((e) => [e.code, e.role])).toEqual([
      ["PLAYS", "player"],
      ["COGMS", "cogm"],
      ["GMGMG", "gm"],
      ["BOTHS", "gm"],
      ["BOTHS", "player"],
    ]);
    expect(h.find((e) => e.role === "gm")!.character).toBeUndefined();
    // The paper's date when it made the paper, else the day it finished.
    expect(h.find((e) => e.code === "PLAYS")).toMatchObject({ date: "2026-10-18", inPaper: true, title: "The Drowned Bell", oneshot: "the-drowned-bell" });
    expect(h.find((e) => e.code === "GMGMG")).toMatchObject({ date: "2026-10-01", inPaper: false });
  });

  it("counts a guest's seat only once an account holds it, never by the paper's free-text 'played by'", () => {
    const g = game({ claims: [{ characterId: "rook", userId: null }], epilogue: paper({ rook: { fate: "survived", playedBy: "Rook" } }) });
    expect(deriveHistory(ME, [g], () => cast(false), true)).toEqual([]);
    // The invite hands the seat over (adoptGuest sets the userId): now it's theirs, history and all.
    const claimed = { ...g, claims: [{ characterId: "rook", userId: ME }] };
    expect(deriveHistory(ME, [claimed], () => cast(false), true)).toMatchObject([{ role: "player", character: { id: "rook", fate: "survived" } }]);
  });

  it("carries each character's fate, title, scar and line from the paper, and none for a game without one", () => {
    const fates = ["survived", "fell", "vanished", "changed"] as const;
    const games = fates.map((fate, i) =>
      game({
        code: `G${i}AAA`,
        finishedAt: new Date(Date.UTC(2026, 9, 10 + i)),
        claims: [{ characterId: "rook", userId: ME }],
        epilogue: paper({ rook: { fate, title: i === 0 ? "Bell-thief" : undefined, scar: i === 1 ? " rope-burned palms " : "", line: i === 2 ? "I heard it ring." : undefined } }, `2026-10-1${i}`),
      }),
    );
    games.push(game({ code: "NOPAP", status: "finished", finishedAt: new Date("2026-10-01T00:00:00Z"), claims: [{ characterId: "merryn", userId: ME }] }));
    const h = deriveHistory(ME, games, () => cast(false), true);
    expect(h.map((e) => e.character!.fate)).toEqual(["changed", "vanished", "fell", "survived", null]);
    expect(h.find((e) => e.code === "G0AAA")!.character).toMatchObject({ title: "Bell-thief", scar: null, line: null });
    expect(h.find((e) => e.code === "G1AAA")!.character).toMatchObject({ scar: "rope-burned palms" });
    expect(h.find((e) => e.code === "G2AAA")!.character).toMatchObject({ line: "I heard it ring." });

    const sum = summarizeHistory(h);
    // The bounty: jobs survived, counting "changed forever" (they lived), not the fallen or the vanished.
    expect(sum).toMatchObject({ bounty: 2, played: 5, ran: 0 });
    expect(sum.aliases).toEqual([{ title: "Bell-thief", character: "Rook", oneshot: "The Drowned Bell" }]);
    expect(sum.scars.map((s) => s.scar)).toEqual(["rope-burned palms"]);
  });

  it("names a mystery role by its board alias on someone else's poster, and by name on your own", () => {
    const g = game({ claims: [{ characterId: "merryn", userId: ME }] });
    expect(deriveHistory(ME, [g], () => cast(false), true)[0].character!.name).toBe("Merryn Vane");
    expect(deriveHistory(ME, [g], () => cast(false), false)[0].character!.name).toBe("????");
  });

  it("shows a secret only in its player's own history, and only once it came out at the table", () => {
    const g = game({
      claims: [
        { characterId: "rook", userId: ME },
        { characterId: "merryn", userId: ME },
      ],
      epilogue: paper({ rook: { fate: "survived", revealed: true }, merryn: { fate: "fell" } }),
    });
    const own = deriveHistory(ME, [g], () => cast(true), true);
    expect(own.find((e) => e.character!.id === "rook")!.character!.secret).toBe("He kept the drowned woman's coin.");
    // Never revealed: not on the record, not even as an empty key.
    const merryn = own.find((e) => e.character!.id === "merryn")!.character!;
    expect("secret" in merryn).toBe(false);
    expect(JSON.stringify(own)).not.toContain("already drowned");
    // Someone else reading it never gets one, revealed or not (and the loader doesn't even read them).
    expect(JSON.stringify(deriveHistory(ME, [g], () => cast(true), false))).not.toMatch(/drowned woman|already drowned/);
  });

  it("still lists a game whose one-shot is gone, under its slug", () => {
    expect(deriveHistory(ME, [game({ gmId: ME })], () => null, true)).toMatchObject([{ title: "the-drowned-bell", role: "gm" }]);
  });

  it("ignores a front page that doesn't parse rather than guessing", () => {
    const g = game({ claims: [{ characterId: "rook", userId: ME }], epilogue: { data: { nonsense: true } } });
    expect(deriveHistory(ME, [g], () => cast(false), true)[0]).toMatchObject({ date: "2026-10-19", character: { fate: null } });
  });
});

describe("prefs", () => {
  it("fill in what's missing and keep each part that parses", () => {
    expect(parsePrefs(null)).toEqual(defaultPrefs());
    expect(defaultPrefs()).toEqual({ reading: { large: false, contrast: false, dyslexia: false }, dice: { shake: false }, sound: { volume: 0.8, buzz: true } });
    expect(parsePrefs({ reading: { large: true }, dice: "nonsense", sound: { volume: 7 } })).toEqual({
      reading: { large: true, contrast: false, dyslexia: false },
      dice: { shake: false },
      sound: { volume: 0.8, buzz: true },
    });
  });
});
