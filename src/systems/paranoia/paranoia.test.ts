import { describe, expect, it } from "vitest";
import { applyLive, liveAction, viewEvents, type LiveActor, type LiveContext, type LiveRow, type Person } from "@/lib/live";
import type { Viewer } from "@/lib/game";
import { toPublic } from "@/lib/public";
import { characterSchema, houseRulesSchema, oneShotSchema, type Character, type HouseRules, type OneShotWithCast } from "./schema";
import { cloneName, nodeFor, sheetLimits, stats } from "./derive";
import { crossCheck } from "./content";
import { foldParanoia, rollNode, type NodeData } from "./live";
import { cardsFor } from "./cards";
import { computerThreshold } from "./rules";

// ---- A hand-checked Troubleshooter ------------------------------------------------------

function trouble(over: Partial<Character["mech"]> = {}, id = "mabel", name = "Mabel"): Character {
  return characterSchema.parse({
    id,
    name,
    order: 1,
    poster: { header: "WANTED", epithet: "the Loyal", hook: "Never once suspected of anything. Suspicious.", icon: "eye" },
    story: {
      pronouns: "she/her",
      appearance: "Red jumpsuit, very ironed.",
      concept: "A clerk who reads every form.",
      stake: "A promotion, if the mission goes well.",
      goal: "Come back with all six clones.",
      voice: "Clipped.",
      mannerisms: ["salutes the cameras"],
      treasonButton: "Someone mentions the Outdoors",
      violenceButton: "Anyone skips a form",
      ties: [{ to: "otto", text: "He owes her a stamp." }],
    },
    mech: {
      clone: { name: "Mabel", clearance: "R", sector: "MXT", number: 1 },
      serviceGroup: "Central Processing Unit",
      bonusDuty: "Loyalty Officer",
      // +5 +4 +3 +2 +1 and −1…−5: Brains 3 (bureaucracy, alphaComplex, psychology), Chutzpah 1, Violence 1, Mechanics 0.
      skills: { bureaucracy: 5, alphaComplex: 4, psychology: 3, bluff: 2, guns: 1, melee: -1, athletics: -2, demolitions: -3, engineer: -4, program: -5 },
      gear: [{ name: "Laser pistol", level: 1 }],
      ...over,
    },
    naughty: {
      society: "Free Enterprise",
      societyObjective: "Sell the mission's spare reflec to a Green.",
      mutantPower: { name: "Charm", text: "People like her, briefly and against their judgement." },
      objectives: ["Get Otto's clone number"],
      favours: { serviceGroup: ["Lose one form"], society: ["A crate of bootleg Bouncy Bubble Beverage"] },
      secret: "She has been Mabel-5 since last week.",
    },
  });
}

const errs = (c: Character[]) => crossCheck({ announcements: [] }, c);

describe("Paranoia numbers", () => {
  it("makes each stat the count of positive skills under it", () => {
    expect(stats(trouble().mech)).toEqual({ brains: 3, chutzpah: 1, violence: 1, mechanics: 0 });
    expect(Object.values(stats(trouble().mech)).reduce((a, b) => a + b)).toBe(5);
    expect(nodeFor(trouble().mech, "brains", "bureaucracy", 1)).toBe(9);
    expect(nodeFor(trouble().mech, "mechanics", "program")).toBe(-5);
  });
  it("writes the clone name", () => {
    expect(cloneName(trouble().mech)).toBe("Mabel-R-MXT-1");
    expect(cloneName(trouble().mech, 3)).toBe("Mabel-R-MXT-3");
  });
  it("lets the Computer notice more often the more treasonous you are", () => {
    expect([0, 1, 2, 3, 4, 5].map(computerThreshold)).toEqual([6, 5, 4, 3, 2, 1]);
  });
});

describe("Paranoia checks", () => {
  it("passes a by-the-book Troubleshooter", () => {
    expect(errs([trouble()])).toEqual([]);
  });
  it("holds the skills to the draft", () => {
    const bad = trouble({ skills: { ...trouble().mech.skills, science: 5 } });
    expect(errs([bad])[0]).toMatch(/^mabel: skills should be \+1 to \+5 and −1 to −5 once each/);
    expect(errs([trouble({ skills: trouble().mech.skills })])).toEqual([]);
  });
  it("wants unique clone names and a full naughty side", () => {
    const otto = trouble({}, "otto", "Otto");
    expect(errs([trouble(), otto])).toEqual(["otto: clone name Mabel-R-MXT-1 is already Mabel's"]);
    const blank = { ...trouble(), naughty: { ...trouble().naughty, society: " ", objectives: [], societyObjective: undefined } };
    expect(errs([blank])).toEqual(["mabel: naughty side: everyone is in a secret society", "mabel: naughty side: give them at least one secret objective"]);
  });
  it("prints the naughty side's cards only when it's passed in", () => {
    const c = trouble();
    expect(cardsFor(c, null).map((x) => x.title)).toEqual(["Mabel-R-MXT-1", "Laser pistol"]);
    expect(cardsFor(c, c.naughty).map((x) => x.title)).toEqual(["Mabel-R-MXT-1", "Laser pistol", "Free Enterprise", "Charm", "Secret objectives"]);
  });
});

// ---- NODE dice on the event log -----------------------------------------------------

/** An rng that returns these d6 faces in turn. */
const faces = (...v: number[]) => {
  const xs = v.map((x) => (x - 0.5) / 6);
  return () => xs.shift() ?? 0.5;
};

describe("NODE dice", () => {
  it("counts every 5 or 6, the Computer die included", () => {
    expect(rollNode(faces(5, 2, 6, 6), 3, 6)).toMatchObject({ dice: [5, 2, 6], computer: 6, successes: 3, noticed: true });
    expect(rollNode(faces(1, 1, 5), 2, 6)).toMatchObject({ successes: 1, noticed: false });
  });
  it("rolls anti-dice for a negative pool: each miss takes a success away", () => {
    expect(rollNode(faces(1, 6, 2, 5), -3, 6)).toMatchObject({ dice: [], anti: [1, 6, 2], computer: 5, successes: -1 });
  });
  it("notices on a lower Computer die as treason rises", () => {
    expect(rollNode(faces(4), 0, computerThreshold(2)).noticed).toBe(true);
    expect(rollNode(faces(4), 0, computerThreshold(1)).noticed).toBe(false);
  });
});

const A = "aaaaaaaaaaaaaaaa1";
const B = "bbbbbbbbbbbbbbbb2";
const C = "cccccccccccccccc3";
const people: Person[] = [
  { playerId: A, handle: "handlea001", name: "Ann", characterId: "mabel", character: "Mabel", since: "2026-10-20T19:00:00.000Z" },
  { playerId: B, handle: "handleb002", name: "Bo", characterId: "otto", character: "Otto", since: "2026-10-20T19:01:00.000Z" },
  { playerId: C, handle: "handlec003", name: "Cy", characterId: "zed", character: "Zed", since: "2026-10-20T19:02:00.000Z" },
];
const gm: LiveActor = { role: "gm" };
const pa: LiveActor = { role: "player", playerId: A };
const pb: LiveActor = { role: "player", playerId: B };
const pc: LiveActor = { role: "player", playerId: C };

function table(rng: () => number = Math.random, house: Partial<HouseRules> = {}) {
  const rows: LiveRow[] = [];
  const otto = trouble({ clone: { name: "Otto", clearance: "R", sector: "OPX", number: 1 } }, "otto", "Otto");
  const zed = trouble({ clone: { name: "Zed", clearance: "R", sector: "ZZZ", number: 2 } }, "zed", "Zed");
  const sheets = sheetLimits([trouble(), otto, zed]);
  const houseRules = houseRulesSchema.parse(house);
  const ctx = (): LiveContext => ({ people, rows, acts: [], rumors: [], notices: [], coin: null, dice: "node", paranoia: { sheets, houseRules }, rng });
  let n = 0;
  const play = (a: Record<string, unknown>, who: LiveActor) => {
    // Parsed like the API parses them, so the defaults (gear 0, skill null) apply.
    const r = applyLive(liveAction.parse(a), who, ctx());
    if (r.ok) for (const row of r.rows) rows.push({ ...row, id: ++n, createdAt: new Date(Date.parse("2026-10-20T20:00:00Z") + n * 1000).toISOString() });
    return r;
  };
  return { rows, play, fold: () => foldParanoia(rows, sheets, houseRules).marks };
}

describe("NODE at the table", () => {
  it("builds the pool on the server from the sheet, the gear, the wounds and the treason", () => {
    const t = table(faces(6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6));
    t.play({ type: "node", label: "Bureaucracy", stat: "brains", skill: "bureaucracy", gear: 1 }, pa);
    const r1 = t.rows.at(-1)!.data as NodeData;
    expect(r1).toMatchObject({ node: 9, successes: 10, threshold: 6, noticed: true });
    t.play({ type: "pmark", track: "wounds", delta: 2 }, pa);
    t.play({ type: "pmark", track: "treason", delta: 2, to: "handlea001" }, gm);
    t.play({ type: "node", label: "Bureaucracy", stat: "brains", skill: "bureaucracy", gear: 0 }, pa);
    expect(t.rows.at(-1)!.data as NodeData).toMatchObject({ node: 6, threshold: 4 });
  });

  it("keeps rolling to the players, and the dead to their next clone", () => {
    const t = table();
    expect(t.play({ type: "node", label: "x", stat: "violence" }, gm)).toEqual({ ok: false, error: "Only players roll; the Computer's side never does" });
    t.play({ type: "pmark", track: "wounds", delta: 4 }, pa);
    expect(t.play({ type: "node", label: "x", stat: "violence" }, pa)).toEqual({ ok: false, error: "You're dead. Next clone first" });
    t.play({ type: "pmark", track: "clone", delta: 1 }, pa);
    expect(t.play({ type: "node", label: "x", stat: "violence" }, pa).ok).toBe(true);
  });

  it("does to Moxie what the house rule says when the Computer notices", () => {
    for (const [rule, moxie] of [["none", 8], ["lose", 7], ["gain", 8]] as const) {
      // Violence 1 + Guns 1: two dice, then the Computer die.
      const t = table(faces(1, 1, 6), { computerMoxie: rule });
      t.play({ type: "node", label: "Guns", stat: "violence", skill: "guns", gear: 0 }, pa);
      expect([rule, t.fold().mabel.moxie]).toEqual([rule, moxie]);
    }
  });

  it("decants a new clone: unhurt, with the house rule's Moxie; after six, out of clones", () => {
    const t = table(Math.random, { cloneMoxie: "four" });
    t.play({ type: "pmark", track: "moxie", delta: -3 }, pa);
    t.play({ type: "pmark", track: "wounds", delta: 3 }, pa);
    t.play({ type: "pmark", track: "clone", delta: 1 }, pa);
    expect(t.fold().mabel).toMatchObject({ clone: 2, wounds: 0, moxie: 4 });
    for (let i = 0; i < 6; i++) t.play({ type: "pmark", track: "clone", delta: 1 }, pa);
    expect(t.fold().mabel.clone).toBe(7);
    expect(t.play({ type: "node", label: "x", stat: "violence" }, pa)).toEqual({ ok: false, error: "You're out of clones" });
    const full = table(Math.random, { cloneMoxie: "full" });
    full.play({ type: "pmark", track: "moxie", delta: -5 }, pb);
    full.play({ type: "pmark", track: "clone", delta: 1 }, pb);
    expect(full.fold().otto.moxie).toBe(8);
    // Zed's mission starts on clone 2.
    expect(full.fold().zed.clone).toBe(2);
  });

  it("keeps treason and XP to the Computer, and clamps the Flags to the track", () => {
    const t = table();
    expect(t.play({ type: "pmark", track: "treason", delta: -1 }, pa)).toEqual({ ok: false, error: "Only the Computer awards treason" });
    expect(t.play({ type: "pmark", track: "xp", delta: 100 }, pa)).toEqual({ ok: false, error: "Only the Computer hands out XP Points" });
    expect(t.play({ type: "pmark", track: "clone", delta: -1 }, pa)).toEqual({ ok: false, error: "Only the Computer can un-decant a clone" });
    expect(t.play({ type: "pmark", track: "moxie", delta: -1, to: "handleb002" }, pa)).toEqual({ ok: false, error: "You can only mark your own sheet" });
    t.play({ type: "pmark", track: "treason", delta: 9, to: "handleb002" }, gm);
    expect(t.fold().otto.treason).toBe(4);
    const six = table(Math.random, { treasonLevels: 6 });
    six.play({ type: "pmark", track: "treason", delta: 9, to: "handleb002" }, gm);
    expect(six.fold().otto.treason).toBe(5);
  });
});

describe("treason reports and Friend Computer", () => {
  it("shows a report to the Computer and its author only; everyone else sees one was filed", () => {
    const t = table();
    expect(t.play({ type: "accuse", to: "handleb002", text: "OTTO-READS-COMMIE-PAMPHLETS" }, pa).ok).toBe(true);
    expect(t.play({ type: "accuse", to: "handlea001", text: "x" }, pa)).toEqual({ ok: false, error: "Report yourself? The Computer appreciates your honesty, but no" });
    expect(t.play({ type: "accuse", to: "handlea001", text: "x" }, gm).ok).toBe(false);
    const see = (v: Viewer) => viewEvents(t.rows, v, { people, rumors: [] });
    for (const v of [{ role: "gm" }, pa] as Viewer[]) expect(JSON.stringify(see(v))).toContain("OTTO-READS-COMMIE-PAMPHLETS");
    for (const v of [pb, pc, { role: "table" }] as Viewer[]) {
      const json = JSON.stringify(see(v));
      expect(json).not.toContain("OTTO-READS");
      expect(json).not.toContain("Mabel");
      expect(see(v)[0]).toMatchObject({ kind: "accuse", redacted: true, by: null, to: null, data: null });
    }
    for (const v of [{ role: "gm" }, pa, pb, pc, { role: "table" }] as Viewer[]) for (const id of [A, B, C]) expect(JSON.stringify(see(v))).not.toContain(id);
  });

  it("lets only the GM speak as the Computer, to everyone", () => {
    const t = table();
    expect(t.play({ type: "computer", text: "Happiness is mandatory." }, pa)).toEqual({ ok: false, error: "Only Friend Computer speaks for Friend Computer" });
    expect(t.play({ type: "computer", text: "Happiness is mandatory." }, gm).ok).toBe(true);
    for (const v of [pa, pb, { role: "table" }] as Viewer[]) expect(JSON.stringify(viewEvents(t.rows, v, { people, rumors: [] }))).toContain("Happiness is mandatory.");
  });

  it("refuses Paranoia's actions at other tables", () => {
    const rows: LiveRow[] = [];
    const ctx: LiveContext = { people, rows, acts: [], rumors: [], notices: [], coin: null, dice: "d20", rng: Math.random };
    expect(applyLive({ type: "computer", text: "x" }, gm, ctx).ok).toBe(false);
    expect(applyLive({ type: "node", label: "x", stat: "violence", skill: null, gear: 0 }, pa, ctx).ok).toBe(false);
    expect(applyLive({ type: "accuse", to: "handleb002", text: "x" }, pa, ctx).ok).toBe(false);
  });
});

describe("Paranoia privacy", () => {
  it("keeps every naughty side, the briefing and the announcements off player pages", () => {
    const os = oneShotSchema.parse({
      slug: "test-mission",
      title: "Test Mission",
      system: "paranoia",
      pitch: "A mission.",
      premise: "Why.",
      players: { min: 1, max: 5 },
      durationHrs: 3,
      tone: ["comic"],
      setting: "Alpha Complex",
      posting: { header: "WANTED", reward: "XP Points" },
      team: "Team Spotless",
      objectives: ["Fetch the thing"],
      briefing: "BRIEFING-TEXT: the thing is in sector GOD.",
      announcements: [{ id: "a1", text: "ANNOUNCEMENT-TEXT: stay calm." }],
    });
    const full: OneShotWithCast = { ...os, cast: [trouble()] };
    const pub = toPublic(full);
    const json = JSON.stringify(pub);
    for (const k of ["briefing", "announcements", "gmNotes", "letters"]) expect(k in pub).toBe(false);
    expect("naughty" in pub.cast[0]).toBe(false);
    for (const x of ["Free Enterprise", "Charm", "Mabel-5", "BRIEFING-TEXT", "ANNOUNCEMENT-TEXT", "bootleg"]) expect(json).not.toContain(x);
    expect(pub.objectives).toEqual(["Fetch the thing"]);
  });
});
