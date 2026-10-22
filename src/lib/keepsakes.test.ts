import { describe, expect, it } from "vitest";
import { loadAll } from "./content";
import { deriveHistory, type HistoryCast, type HistoryGame } from "./history";
import { keepsakeFor, shelve, takeHome, TICKET_STUB, type KeepsakeSource } from "./keepsakes";
import { toPublic } from "./public";
import { keepsakeSchema, oneShotSchema } from "./schema";
import { characterSchema } from "@/systems/tencandles/schema";
import { mysteryKeepsakeWarning } from "./editor/warnings";

/**
 * Keepsakes (phase 13): the schema and its fallbacks, the cabinet read from
 * someone's history (roles, a character's own, the fallen, stacks, guest
 * seats, games from before accounts) and what it never shows. Builder
 * authorization is in store/owned.test.ts.
 */

const ME = "u1";
const YOU = "u2";

const PADDLE = { name: "Paddle No. 13", note: "Raised once.", art: "paddle" } as const;
const GAVEL = { name: "The gavel", note: "Gone.", art: "gavel" } as const;
const COIN = { name: "A sea-worn coin", note: "Never spent.", art: "coin" } as const;

const SOURCE: KeepsakeSource = { keepsakes: { player: PADDLE, gm: GAVEL }, cast: [{ id: "rook", keepsake: COIN }, { id: "merryn" }] };
const BARE: KeepsakeSource = { cast: [{ id: "rook" }, { id: "merryn" }] };

const cast = (withSecrets: boolean): HistoryCast => ({
  title: "The Drowned Bell",
  system: "dnd5e",
  cast: {
    rook: { name: "Rook", boardName: "Rook", epithet: "the Knife", ...(withSecrets ? { secret: "He kept the drowned woman's coin." } : {}) },
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

const cabinet = (games: HistoryGame[], userId = ME, own = true, source: KeepsakeSource | null = SOURCE) =>
  shelve(deriveHistory(userId, games, () => cast(own), own), () => source);

describe("the keepsake schema", () => {
  it("wants a short name, a one-line note and a drawing from the set", () => {
    expect(keepsakeSchema.safeParse(PADDLE).success).toBe(true);
    expect(keepsakeSchema.safeParse({ ...PADDLE, art: "trophy" }).success).toBe(false);
    expect(keepsakeSchema.safeParse({ ...PADDLE, name: "" }).success).toBe(false);
    expect(keepsakeSchema.safeParse({ ...PADDLE, name: "x".repeat(61) }).success).toBe(false);
    expect(keepsakeSchema.safeParse({ ...PADDLE, note: "x".repeat(141) }).success).toBe(false);
    expect(keepsakeSchema.safeParse({ name: "Paddle", note: "Raised." }).success).toBe(false);
  });

  it("is optional on a one-shot and a character, but both shared ones come together", () => {
    const os = loadAll()[0];
    const { keepsakes, ...without } = os;
    expect(keepsakes).toBeDefined();
    expect(oneShotSchema.safeParse(without).success).toBe(true);
    expect(oneShotSchema.safeParse({ ...without, keepsakes: { player: PADDLE } }).success).toBe(false);
    const c = { id: "ida", name: "Ida", order: 1, poster: { header: "WANTED", epithet: "the signalwoman", hook: "Hook", icon: "candle" }, story: { concept: "c", look: "l" } };
    expect(characterSchema.safeParse(c).success).toBe(true);
    expect(characterSchema.safeParse({ ...c, keepsake: COIN }).success).toBe(true);
    expect(characterSchema.safeParse({ ...c, keepsake: { ...COIN, art: "nope" } }).success).toBe(false);
  });

  it("is seeded for every one-shot in content/, and players keep them (they're never secret)", () => {
    const all = loadAll();
    expect(new Set(all.map((o) => o.system))).toEqual(new Set(["dnd5e", "tencandles", "daggerheart", "paranoia"]));
    for (const os of all) {
      expect(os.keepsakes, os.slug).toBeDefined();
      expect(os.keepsakes!.player.name, os.slug).not.toBe(os.keepsakes!.gm.name);
      const pub = toPublic(os);
      expect(pub.keepsakes, os.slug).toEqual(os.keepsakes);
      for (const c of os.cast) if (c.keepsake) expect(pub.cast.find((x) => x.id === c.id)!.keepsake).toEqual(c.keepsake);
    }
    expect(all.find((o) => o.slug === "lot-thirteen")!.keepsakes).toMatchObject({ player: { art: "paddle" }, gm: { art: "gavel" } });
    expect(all.find((o) => o.slug === "the-drowned-bell")!.cast.find((c) => c.id === "rook")!.keepsake).toMatchObject({ art: "coin" });
  });

  it("never echoes a character's secret in their own keepsake", () => {
    for (const os of loadAll())
      os.cast.forEach((c, i) => {
        if (!c.keepsake) return;
        const doc = { oneshot: os as unknown as Record<string, unknown>, cast: os.cast as unknown as Record<string, unknown>[], variants: [] };
        expect(mysteryKeepsakeWarning(c.keepsake, doc, ["cast", i, "keepsake"]), `${os.slug}/${c.id}`).toBeNull();
      });
    // And it does look: at a story's secret, a Troubleshooter's naughty side, and an alias on the board.
    const all = loadAll();
    const warn = (slug: string, id: string, name: string) => {
      const os = all.find((o) => o.slug === slug)!;
      const doc = { oneshot: os as unknown as Record<string, unknown>, cast: os.cast as unknown as Record<string, unknown>[], variants: [] };
      return mysteryKeepsakeWarning({ name, note: "A note.", art: "coin" }, doc, ["cast", os.cast.findIndex((c) => c.id === id), "keepsake"]);
    };
    expect(warn("the-drowned-bell", "rook", "The drowned woman's coin")).toMatch(/reveal the secret/);
    expect(warn("open-in-case-of-future", "agnes-fil", "A cookbook of invisibility")).toMatch(/reveal the secret/);
    expect(warn("the-drowned-bell", "merryn-vane", "A lantern")).toMatch(/board calls them/);
    expect(warn("the-drowned-bell", "odo-brambletoe", "A lantern")).toBeNull();
  });
});

describe("which keepsake", () => {
  it("gives the GM and co-GMs the GM's, a player their character's own or else the shared one", () => {
    expect(keepsakeFor(SOURCE, "gm")).toEqual({ keepsake: GAVEL, which: "gm" });
    expect(keepsakeFor(SOURCE, "cogm")).toEqual({ keepsake: GAVEL, which: "gm" });
    expect(keepsakeFor(SOURCE, "player", "rook")).toEqual({ keepsake: COIN, which: "c:rook" });
    expect(keepsakeFor(SOURCE, "player", "merryn")).toEqual({ keepsake: PADDLE, which: "player" });
    expect(keepsakeFor(SOURCE, "player", "someone-gone")).toEqual({ keepsake: PADDLE, which: "player" });
  });

  it("falls back to a ticket stub without keepsakes, or without the one-shot at all", () => {
    expect(keepsakeFor(BARE, "gm").keepsake).toEqual(TICKET_STUB);
    expect(keepsakeFor(BARE, "player", "merryn").keepsake).toEqual(TICKET_STUB);
    expect(keepsakeFor(null, "player", "rook").keepsake).toEqual(TICKET_STUB);
    // A character's own still counts where the one-shot has no shared ones.
    expect(keepsakeFor({ cast: [{ id: "rook", keepsake: COIN }] }, "player", "rook").keepsake).toEqual(COIN);
    expect(keepsakeSchema.safeParse(TICKET_STUB).success).toBe(true);
  });
});

describe("the cabinet", () => {
  it("puts one object per job and role on the shelf, earned by finishing (or the paper)", () => {
    const items = cabinet([
      game({ code: "RANIT", gmId: ME, status: "finished" }),
      game({ code: "COGMD", coGms: [{ userId: ME }], status: "finished", oneshot: "lot-thirteen", finishedAt: new Date("2026-10-10T00:00:00Z") }),
      game({ code: "MERRY", claims: [{ characterId: "merryn", userId: ME }], epilogue: paper({ merryn: { fate: "survived" } }, "2026-10-20") }),
      game({ code: "ROOKS", claims: [{ characterId: "rook", userId: ME }], status: "finished", finishedAt: new Date("2026-09-01T00:00:00Z") }),
      // Not over: nothing yet.
      game({ code: "LIVEE", gmId: ME, status: "live", oneshot: "a-vow-before-dawn" }),
      game({ code: "SEATS", claims: [{ characterId: "rook", userId: ME }], status: "open", oneshot: "a-vow-before-dawn" }),
    ]);
    expect(items.map((i) => [i.id, i.keepsake.name, i.count, i.runs.map((r) => r.role)])).toEqual([
      ["the-drowned-bell:player", PADDLE.name, 1, ["player"]],
      ["the-drowned-bell:gm", GAVEL.name, 1, ["gm"]],
      ["lot-thirteen:gm", GAVEL.name, 1, ["cogm"]],
      ["the-drowned-bell:c:rook", COIN.name, 1, ["player"]],
    ]);
    expect(items[0]).toMatchObject({ title: "The Drowned Bell", fallen: false, runs: [{ code: "MERRY", date: "2026-10-20", character: { name: "Merryn Vane", fate: "survived" } }] });
    expect(items[1].runs[0].character).toBeUndefined();
  });

  it("brings it home cracked or scorched when the character fell, and only then", () => {
    const fates = ["survived", "fell", "vanished", "changed"] as const;
    for (const fate of fates) {
      const [item] = cabinet([game({ claims: [{ characterId: "rook", userId: ME }], epilogue: paper({ rook: { fate } }) })]);
      expect(item.fallen, fate).toBe(fate === "fell");
      expect(item.runs[0].character!.fate).toBe(fate);
    }
    // No paper yet: no fate, whole.
    expect(cabinet([game({ status: "finished", claims: [{ characterId: "rook", userId: ME }] })])[0].fallen).toBe(false);
  });

  it("stacks the same object from the same job (×2), drawn as the latest run left it", () => {
    const items = cabinet([
      game({ code: "FIRST", claims: [{ characterId: "rook", userId: ME }], epilogue: paper({ rook: { fate: "survived" } }, "2026-09-01") }),
      game({ code: "AGAIN", claims: [{ characterId: "rook", userId: ME }], epilogue: paper({ rook: { fate: "fell" } }, "2026-10-01") }),
      // The shared keepsake, from two different characters, stacks too.
      game({ code: "MERRY", claims: [{ characterId: "merryn", userId: ME }], epilogue: paper({}, "2026-08-01") }),
      game({ code: "MERR2", claims: [{ characterId: "merryn", userId: ME }], epilogue: paper({}, "2026-08-02"), oneshot: "the-drowned-bell" }),
      // GM and co-GM of the same job: one gavel, ×2.
      game({ code: "GMONE", gmId: ME, status: "finished" }),
      game({ code: "GMTWO", coGms: [{ userId: ME }], status: "finished", finishedAt: new Date("2026-10-20T00:00:00Z") }),
    ]);
    const rook = items.find((i) => i.id === "the-drowned-bell:c:rook")!;
    expect(rook).toMatchObject({ count: 2, fallen: true });
    expect(rook.runs.map((r) => [r.code, r.character!.fate])).toEqual([
      ["AGAIN", "fell"],
      ["FIRST", "survived"],
    ]);
    expect(items.find((i) => i.id === "the-drowned-bell:player")!.count).toBe(2);
    expect(items.find((i) => i.id === "the-drowned-bell:gm")!.runs.map((r) => r.role)).toEqual(["cogm", "gm"]);
    // The other way round: the latest run survived, so it's whole again.
    const mended = cabinet([
      game({ code: "FIRST", claims: [{ characterId: "rook", userId: ME }], epilogue: paper({ rook: { fate: "fell" } }, "2026-09-01") }),
      game({ code: "AGAIN", claims: [{ characterId: "rook", userId: ME }], epilogue: paper({ rook: { fate: "survived" } }, "2026-10-01") }),
    ]);
    expect(mended[0]).toMatchObject({ count: 2, fallen: false });
  });

  it("gives a guest's seat nothing until an account claims it, then everything", () => {
    const g = game({ claims: [{ characterId: "rook", userId: null }], epilogue: paper({ rook: { fate: "fell", playedBy: "Rook" } }) });
    expect(cabinet([g])).toEqual([]);
    const claimed = { ...g, claims: [{ characterId: "rook", userId: ME }] };
    expect(cabinet([claimed])).toMatchObject([{ keepsake: COIN, fallen: true, count: 1 }]);
    // Never anyone else's.
    expect(cabinet([claimed], YOU)).toEqual([]);
  });

  it("counts games from before accounts, as the migration left them", () => {
    // Migrated: a finished or epilogued game run by the oldest admin, no pinned copy, seats as guest seats.
    const migrated = game({
      code: "ZMMG2",
      gmId: ME,
      status: "epilogued",
      claims: [{ characterId: "rook", userId: null }],
      epilogue: paper({ rook: { fate: "survived" } }, "2025-03-14"),
      finishedAt: new Date("2025-03-15T01:00:00Z"),
      createdAt: new Date("2025-03-14T19:00:00Z"),
    });
    expect(cabinet([migrated])).toMatchObject([{ id: "the-drowned-bell:gm", keepsake: GAVEL, runs: [{ code: "ZMMG2", date: "2025-03-14" }] }]);
    // And without any keepsakes in the one-shot, still a ticket stub.
    expect(cabinet([migrated], ME, true, BARE)).toMatchObject([{ keepsake: TICKET_STUB }]);
  });

  it("never shows a secret, a title, a scar or a line, and others see the board's name", () => {
    const games = [
      game({
        code: "MERRY",
        claims: [{ characterId: "merryn", userId: ME }],
        epilogue: paper({ merryn: { fate: "fell", title: "Bell-ringer", scar: "salt in the lungs", line: "I heard it ring.", revealed: true } }),
      }),
    ];
    // Their own: the real name, no secret even though it came out.
    const mine = cabinet(games, ME, true);
    expect(mine[0].runs[0].character).toEqual({ name: "Merryn Vane", fate: "fell" });
    // Someone else's: the board's name.
    const theirs = cabinet(games, ME, false);
    expect(theirs[0].runs[0].character).toEqual({ name: "????", fate: "fell" });
    for (const items of [mine, theirs]) {
      const text = JSON.stringify(items);
      for (const hidden of ["already drowned", "secret", "Bell-ringer", "salt in the lungs", "I heard it ring", "playedBy", "u1"]) expect(text).not.toContain(hidden);
    }
    expect(JSON.stringify(theirs)).not.toContain("Merryn");
  });
});

describe("what everyone takes home", () => {
  const os = { ...SOURCE, cast: [{ id: "rook", name: "Rook", order: 2, keepsake: COIN }, { id: "merryn", name: "Merryn Vane", order: 1 }, { id: "odo", name: "Odo", order: 3 }] };

  it("lists the GM's, then each character who was played, in board order, the fallen marked", () => {
    expect(takeHome(os, { rook: { fate: "fell" }, merryn: { fate: "survived" }, odo: {} })).toEqual([
      { id: "gm", who: "The GM", keepsake: GAVEL, fallen: false },
      { id: "merryn", who: "Merryn Vane", keepsake: PADDLE, fallen: false },
      { id: "rook", who: "Rook", keepsake: COIN, fallen: true },
    ]);
  });

  it("is just the GM's before the paper has any fates, and ticket stubs without keepsakes", () => {
    expect(takeHome(os, {})).toEqual([{ id: "gm", who: "The GM", keepsake: GAVEL, fallen: false }]);
    expect(takeHome({ ...os, keepsakes: undefined, cast: [{ id: "odo", name: "Odo", order: 1 }] }, { odo: { fate: "vanished" } }).map((t) => t.keepsake)).toEqual([TICKET_STUB, TICKET_STUB]);
  });
});
