import { describe, expect, it } from "vitest";
import {
  applyLive,
  bellsToRing,
  coinCount,
  foldLive,
  rollDice,
  spotlight,
  toPublicPerson,
  viewEvents,
  type LiveAction,
  type LiveActor,
  type LiveContext,
  type LiveRow,
  type NoteData,
  type Person,
} from "./live";
import type { Viewer } from "./game";
import { coinFor } from "@/systems/registry";

const A = "aaaaaaaaaaaaaaaa1";
const B = "bbbbbbbbbbbbbbbb2";
const C = "cccccccccccccccc3";
const people: Person[] = [
  { playerId: A, handle: "handlea001", name: "Ann", characterId: "rook", character: "Rook", since: "2026-10-19T19:00:00.000Z" },
  { playerId: B, handle: "handleb002", name: "Bo", characterId: "marrow", character: "Marrow", since: "2026-10-19T19:01:00.000Z" },
  { playerId: C, handle: "handlec003", name: "Cy", characterId: "odo", character: "Odo", since: "2026-10-19T19:02:00.000Z" },
];
const gm: LiveActor = { role: "gm" };
const pa: LiveActor = { role: "player", playerId: A };
const pb: LiveActor = { role: "player", playerId: B };
const pc: LiveActor = { role: "player", playerId: C };
const V = { gm: { role: "gm" } as Viewer, a: pa as Viewer, b: pb as Viewer, c: pc as Viewer, tv: { role: "table" } as Viewer };

const rumors = [
  { id: "r1", text: "The harbourmaster drinks with smugglers.", truth: "true" as const },
  { id: "r2", text: "The bell was sold to a man in a sea-green coat.", truth: "half" as const },
  { id: "r3", text: "The drowned can't cross running fresh water.", truth: "false" as const },
  { id: "r4", text: "Sister Vell kept a child nobody else has seen.", truth: "true" as const },
];

/** A little table that plays actions and keeps the log, like the API does. */
function table(extra: Partial<LiveContext> = {}) {
  const rows: LiveRow[] = [];
  let n = 0;
  let clock = Date.parse("2026-10-19T20:00:00.000Z");
  const ctx = (): LiveContext => ({
    people,
    rows,
    acts: [
      { id: "beach", title: "The Beach at Midnight" },
      { id: "cave", title: "The Smugglers' Cave", subtitle: "where the bell went down" },
    ],
    rumors,
    notices: [
      { id: "reward-up", kind: "reward", title: "Reward doubled", text: "600 gp now" },
      { id: "sighted", kind: "sighted", title: "Lanterns seen under the bay" },
    ],
    coin: coinFor({ system: "dnd5e", ruleset: "2024" }),
    dice: "d20",
    rng: () => 0.99,
    ...extra,
  });
  const play = (actor: LiveActor, action: LiveAction) => {
    const r = applyLive(action, actor, ctx());
    if (!r.ok) return r.error;
    for (const x of r.rows) rows.push({ ...x, id: ++n, createdAt: new Date((clock += 60000)).toISOString() });
    return null;
  };
  const view = (v: Viewer) => viewEvents(rows, v, { people, rumors });
  return { rows, play, view };
}

const json = (x: unknown) => JSON.stringify(x);

describe("the event log: privacy", () => {
  it("never sends a browser id to anyone, the GM included", () => {
    const t = table();
    t.play(pa, { type: "roll", label: "Stealth", count: 1, sides: 20, mod: 5, mode: "adv" });
    t.play(pa, { type: "note", to: "handleb002", text: "Meet me by the rope." });
    t.play(pb, { type: "note", to: "gm", text: "I'm going to cut the rope." });
    t.play(gm, { type: "bell", preset: "bell", to: "handlec003" });
    t.play(pc, { type: "rumors" });
    t.play(gm, { type: "tick", to: "handlea001", beat: "secret", on: true });
    t.play(pa, { type: "coin", to: "handleb002" });
    for (const v of Object.values(V)) {
      const out = json(t.view(v));
      for (const id of [A, B, C]) expect(out).not.toContain(id);
    }
  });

  it("lets only the sender and the recipient read a note; the TV and the GM see only that it passed", () => {
    const t = table();
    expect(t.play(pa, { type: "note", to: "handleb002", text: "SECRET-AB" })).toBeNull();
    for (const [who, v] of Object.entries(V)) {
      const out = json(t.view(v));
      expect(out.includes("SECRET-AB"), who).toBe(who === "a" || who === "b");
      // Everyone sees the envelope change hands.
      expect(t.view(v)[0]).toMatchObject({ kind: "note", data: { fromName: "Rook", toName: "Marrow" } });
    }
  });

  it("lets the GM read notes to and from the GM, and nobody else", () => {
    const t = table();
    t.play(pb, { type: "note", to: "gm", text: "TO-THE-GM" });
    const noteId = t.rows[0].id;
    expect(t.play(gm, { type: "note", to: "handleb002", text: "GM-REPLY", replyTo: noteId })).toBeNull();
    expect(json(t.view(V.gm))).toContain("TO-THE-GM");
    expect(json(t.view(V.gm))).toContain("GM-REPLY");
    expect(json(t.view(V.b))).toContain("GM-REPLY");
    for (const v of [V.a, V.c, V.tv]) {
      expect(json(t.view(v))).not.toContain("TO-THE-GM");
      expect(json(t.view(v))).not.toContain("GM-REPLY");
    }
  });

  it("only lets you answer a note that was sent to you", () => {
    const t = table();
    t.play(pa, { type: "note", to: "handleb002", text: "hi" });
    expect(t.play(pc, { type: "note", to: "handlea001", text: "butting in", replyTo: t.rows[0].id })).toMatch(/wasn't to you/);
    expect(t.play(pb, { type: "note", to: "handlea001", text: "hello back", replyTo: t.rows[0].id })).toBeNull();
    expect(t.play(gm, { type: "note", to: "handlea001", text: "not mine", replyTo: t.rows[0].id })).toMatch(/wasn't to you/);
  });

  it("shows a hidden roll only to the GM and the roller, and a blank placeholder to everyone else", () => {
    const t = table();
    expect(t.play(gm, { type: "roll", label: "Ambush", count: 1, sides: 20, mod: 3, mode: "normal", hidden: true })).toBeNull();
    expect(t.view(V.gm)[0].data).toMatchObject({ label: "Ambush" });
    for (const v of [V.a, V.b, V.tv]) {
      const [e] = t.view(v);
      expect(e).toMatchObject({ kind: "roll", redacted: true, data: null, by: null });
      expect(json(e)).not.toContain("Ambush");
    }
  });

  it("lets the GM hide a player's roll after the fact, and un-hide it", () => {
    const t = table();
    t.play(pa, { type: "roll", label: "Sleight of Hand", count: 1, sides: 20, mod: 7, mode: "normal" });
    const id = t.rows[0].id;
    expect(t.view(V.b)[0].redacted).toBeUndefined();
    expect(t.play(pa, { type: "hide", roll: id, hidden: true })).toMatch(/Only the GM/);
    t.play(gm, { type: "hide", roll: id, hidden: true });
    expect(t.view(V.b)[0]).toMatchObject({ redacted: true, data: null });
    expect(t.view(V.tv)[0]).toMatchObject({ redacted: true, data: null });
    expect(t.view(V.a)[0].data).toMatchObject({ label: "Sleight of Hand" }); // the roller still sees it
    expect(t.view(V.b).some((e) => e.kind === "hide")).toBe(false); // and only the GM sees the hiding
    t.play(gm, { type: "hide", roll: id, hidden: false });
    expect(t.view(V.b)[0].data).toMatchObject({ label: "Sleight of Hand" });
  });

  it("refuses hidden rolls from players", () => {
    const t = table();
    expect(t.play(pa, { type: "roll", label: "x", count: 1, sides: 20, mod: 0, mode: "normal", hidden: true })).toMatch(/behind the screen/);
  });

  it("deals two rumors a player, shows them only to that player without the truth, and every draw to the GM with it", () => {
    const t = table();
    expect(t.play(pa, { type: "rumors" })).toBeNull();
    expect(t.play(pa, { type: "rumors" })).toMatch(/two rumors/);
    expect(t.play(gm, { type: "rumors" })).toMatch(/Players draw/);
    const mine = t.view(V.a).find((e) => e.kind === "rumor")!;
    const drawn = (mine.data as { rumors: { id: string; text: string; truth?: string }[] }).rumors;
    expect(drawn).toHaveLength(2);
    for (const r of drawn) expect(r.truth).toBeUndefined();
    expect(json(t.view(V.a))).not.toMatch(/"truth"/);
    for (const v of [V.b, V.c, V.tv]) expect(t.view(v).some((e) => e.kind === "rumor")).toBe(false);
    const gmView = t.view(V.gm).find((e) => e.kind === "rumor")!;
    for (const r of (gmView.data as { rumors: { truth?: string }[] }).rumors) expect(r.truth).toMatch(/true|false|half/);
  });

  it("spreads rumors round the table before repeating any", () => {
    const t = table();
    t.play(pa, { type: "rumors" });
    t.play(pb, { type: "rumors" });
    const ids = t.rows.flatMap((r) => (r.data as { ids: string[] }).ids);
    expect(new Set(ids).size).toBe(4);
  });

  it("keeps spotlight ticks and hide events to the GM", () => {
    const t = table();
    t.play(gm, { type: "tick", to: "handlea001", beat: "secret", on: true });
    expect(t.play(pa, { type: "tick", to: "handlea001", beat: "secret", on: true })).toMatch(/Only the GM/);
    expect(t.view(V.gm)).toHaveLength(1);
    for (const v of [V.a, V.b, V.tv]) expect(t.view(v)).toHaveLength(0);
  });

  it("rings a targeted bell only on its player's phone (and shows it to the GM)", () => {
    const t = table();
    t.play(gm, { type: "bell", preset: "heartbeat", to: "handleb002" });
    t.play(gm, { type: "bell", preset: "bell" });
    expect(bellsToRing(t.view(V.b), 0).map((e) => e.id)).toEqual([1, 2]);
    expect(bellsToRing(t.view(V.a), 0).map((e) => e.id)).toEqual([2]);
    expect(t.view(V.a).some((e) => e.id === 1)).toBe(false);
    expect(bellsToRing(t.view(V.gm), 0)).toHaveLength(0); // the GM's own page doesn't ring
    expect(bellsToRing(t.view(V.tv), 0)).toHaveLength(0);
    expect(bellsToRing(t.view(V.b), 1).map((e) => e.id)).toEqual([2]); // already heard on load
    expect(t.play(pa, { type: "bell", preset: "bell" })).toMatch(/Only the GM/);
  });
});

describe("the event log: rules", () => {
  it("rolls d20 with advantage and disadvantage, keeping the right die", () => {
    const seq = [0.1, 0.9];
    let i = 0;
    const rng = () => seq[i++ % 2];
    const adv = rollDice(1, 20, 4, "adv", rng);
    expect(adv.dice.map((d) => d.value)).toEqual([3, 19]);
    expect(adv.dice.filter((d) => d.kept).map((d) => d.value)).toEqual([19]);
    expect(adv.total).toBe(23);
    const dis = rollDice(1, 20, 4, "dis", rng);
    expect(dis.dice.filter((d) => d.kept).map((d) => d.value)).toEqual([3]);
    expect(rollDice(1, 20, 0, "normal", () => 0.999).nat).toBe(20);
    expect(rollDice(1, 20, 0, "normal", () => 0).nat).toBe(1);
    expect(rollDice(2, 6, 3, "normal", () => 0.5)).toMatchObject({ total: 11, nat: null, formula: "2d6+3" });
  });

  it("only lets people at the table roll and pass notes", () => {
    const t = table();
    const stranger: LiveActor = { role: "player", playerId: "zzzzzzzzzzzzzzzz9" };
    expect(t.play(stranger, { type: "roll", label: "x", count: 1, sides: 20, mod: 0, mode: "normal" })).toMatch(/Join the table/);
    expect(t.play(stranger, { type: "note", to: "gm", text: "hi" })).toMatch(/Join the table/);
    expect(t.play(pa, { type: "note", to: "handlea001", text: "me" })).toMatch(/yourself/);
  });

  it("leaves pool systems' dice to their own game", () => {
    const t = table({ dice: "pool" });
    expect(t.play(pa, { type: "roll", label: "x", count: 1, sides: 20, mod: 0, mode: "normal" })).toMatch(/game rolls/);
  });

  it("shows act cards in order and brings the curtain up again", () => {
    const t = table();
    expect(t.play(pa, { type: "act", index: 0 })).toMatch(/Only the GM/);
    expect(t.play(gm, { type: "act", index: 5 })).toMatch(/no act card/);
    t.play(gm, { type: "act", index: 1 });
    let f = foldLive(t.view(V.tv));
    expect(f.act).toMatchObject({ title: "The Smugglers' Cave", index: 1, total: 2 });
    t.play(gm, { type: "act", index: null });
    f = foldLive(t.view(V.tv));
    expect(f.act).toBeNull();
    expect(f.lastAct?.index).toBe(1);
  });

  it("pins, settles and takes down notices, presets once each", () => {
    const t = table();
    expect(t.play(gm, { type: "notice", preset: "reward-up" })).toBeNull();
    expect(t.play(gm, { type: "notice", preset: "reward-up" })).toMatch(/already up/);
    expect(t.play(gm, { type: "notice", title: "Missing: one dog" })).toBeNull();
    expect(t.play(gm, { type: "notice" })).toMatch(/headline/);
    t.play(gm, { type: "settle", nid: "reward-up" });
    let f = foldLive(t.view(V.a));
    expect(f.notices.map((n) => [n.nid, n.settled])).toEqual([
      ["reward-up", true],
      ["free-1", false],
    ]);
    t.play(gm, { type: "unpin", nid: "free-1" });
    f = foldLive(t.view(V.tv));
    expect(f.notices.map((n) => n.nid)).toEqual(["reward-up"]);
    expect(t.play(pa, { type: "notice", title: "Forged" })).toMatch(/Only the GM/);
  });

  it("lets each player toss one coin an act, the GM any number, and counts them on the sheet", () => {
    const t = table();
    expect(t.play(pa, { type: "coin", to: "handlea001" })).toMatch(/someone else/);
    expect(t.play(pa, { type: "coin", to: "handleb002" })).toBeNull();
    expect(t.play(pa, { type: "coin", to: "handlec003" })).toMatch(/this act/);
    expect(t.play(gm, { type: "coin", to: "handleb002" })).toBeNull();
    expect(t.play(gm, { type: "coin", to: "handleb002" })).toBeNull();
    expect(coinCount(t.rows, B)).toBe(3);
    t.play(gm, { type: "act", index: 0 });
    expect(t.play(pa, { type: "coin", to: "handlec003" })).toBeNull(); // a new act, a new coin
    const f = foldLive(t.view(V.tv));
    expect(f.coins).toEqual({ handleb002: 3, handlec003: 1 });
  });

  it("spends a coin to reroll, and refuses without one", () => {
    const t = table();
    expect(t.play(pc, { type: "roll", label: "Athletics", count: 1, sides: 20, mod: 2, mode: "normal", reroll: true })).toMatch(/no Heroic Inspiration/);
    t.play(gm, { type: "coin", to: "handlec003" });
    expect(t.play(pc, { type: "roll", label: "Athletics", count: 1, sides: 20, mod: 2, mode: "normal", reroll: true })).toBeNull();
    expect(t.rows.map((r) => r.kind)).toEqual(["coin", "spend", "roll"]);
    expect(coinCount(t.rows, C)).toBe(0);
    expect(t.play(pc, { type: "spend" })).toMatch(/No Heroic Inspiration/);
  });

  it("has no coins in systems without them (Ten Candles) or where the one-shot turns them off", () => {
    expect(coinFor({ system: "tencandles" })).toBeNull();
    expect(coinFor({ system: "dnd5e", ruleset: "2024", coins: { enabled: false } })).toBeNull();
    expect(coinFor({ system: "dnd5e", ruleset: "2014" })?.name).toBe("Inspiration");
    expect(coinFor({ system: "dnd5e", ruleset: "2024" })?.name).toBe("Heroic Inspiration");
    const t = table({ coin: null });
    expect(t.play(gm, { type: "coin", to: "handleb002" })).toMatch(/No coins/);
  });

  it("works out who's been out of the spotlight longest", () => {
    const t = table();
    t.play(pa, { type: "roll", label: "Stealth", count: 1, sides: 20, mod: 5, mode: "normal" });
    t.play(gm, { type: "tick", to: "handleb002", beat: "stake", on: true });
    const pub = people.map(toPublicPerson);
    const rows = spotlight(pub, t.view(V.gm), [{ characterId: "odo", openedAt: "2026-10-19T19:30:00.000Z" }]);
    expect(rows.find((r) => r.handle === "handlea001")?.last).toBe("rolled Stealth");
    expect(rows.find((r) => r.handle === "handleb002")?.last).toBe("stake beat");
    expect(rows.find((r) => r.handle === "handlec003")?.last).toBe("opened a letter");
    const at = (h: string) => rows.find((r) => r.handle === h)!.lastAt!;
    expect(at("handlec003")).toBeLessThan(at("handlea001"));
  });

  it("records who a note is from by character name", () => {
    const t = table();
    t.play(pc, { type: "note", to: "gm", text: "x" });
    expect((t.rows[0].data as NoteData).fromName).toBe("Odo");
  });
});
