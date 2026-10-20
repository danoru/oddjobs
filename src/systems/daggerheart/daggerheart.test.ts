import { describe, expect, it } from "vitest";
import { applyLive, viewEvents, type LiveAction, type LiveActor, type LiveContext, type LiveRow, type Person } from "@/lib/live";
import type { Viewer } from "@/lib/game";
import { toPublic } from "@/lib/public";
import { characterSchema, oneShotSchema, type Character, type OneShotWithCast } from "./schema";
import { expected, hpFor, sheetLimits, weaponLine } from "./derive";
import { crossCheck } from "./content";
import { foldTallies, rollDuality, type DualityData, type TallyData } from "./live";
import { cardsFor } from "./cards";
import { ARMOR, CLASS_INFO, DOMAIN_CARDS, WEAPONS } from "./srd";

// ---- A hand-checked level-1 character ---------------------------------------------------

const leather = ARMOR.find((a) => a.name === "Leather Armor")!;
const gambeson = ARMOR.find((a) => a.name === "Gambeson Armor")!;
const weapon = (name: string) => ({ ...WEAPONS.find((w) => w.name === name)! });

/** A Syndicate Rogue in gambeson: Evasion 12 + 1, 6 HP, 6 Stress, Armor 3, thresholds 5+1 / 11+1. */
function rogue(over: Partial<Character["mech"]> = {}): Character {
  return characterSchema.parse({
    id: "wren",
    name: "Wren",
    order: 1,
    poster: { header: "WANTED", epithet: "the Lockpick", hook: "Opens what shouldn't be opened.", icon: "dagger" },
    story: {
      pronouns: "she/her",
      appearance: "Ink on her fingers.",
      concept: "A forger.",
      stake: "Her brother is on the ferry.",
      goal: "Get him off it.",
      secret: "She sold the ferry's route.",
      voice: "Quick and low.",
      mannerisms: ["taps her teeth"],
      ties: [{ to: "bram", text: "He owes her." }],
    },
    mech: {
      class: "Rogue",
      subclass: "Syndicate",
      level: 1,
      ancestry: "Halfling",
      community: "Slyborne",
      traits: { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 1, knowledge: 0 },
      evasion: 13,
      armor: gambeson,
      armorScore: 3,
      hp: 6,
      stress: 6,
      thresholds: { major: 6, severe: 12 },
      experiences: [
        { name: "Forger", bonus: 2 },
        { name: "Never Forget a Face", bonus: 2 },
      ],
      domainCards: [{ name: "Pick and Pull" }, { name: "Deft Deceiver" }],
      weapons: [weapon("Dagger"), weapon("Small Dagger")],
      features: [{ name: "Rogue's Dodge", source: "class", hope: true, text: "Spend 3 Hope for +2 Evasion." }],
      ...over,
    },
  });
}

const errs = (c: Character) => crossCheck({ level: 1 }, [c]);

describe("Daggerheart numbers", () => {
  it("works out Evasion, Hit Points, Stress, Armor and thresholds from class, armor and level", () => {
    expect(expected({ class: "Rogue", level: 1, armor: gambeson, bonuses: {} })).toEqual({ evasion: 13, hp: 6, stress: 6, armorScore: 3, thresholds: { major: 6, severe: 12 } });
    expect(expected({ class: "Warrior", level: 1, armor: leather, bonuses: {} })).toEqual({ evasion: 11, hp: 6, stress: 6, armorScore: 3, thresholds: { major: 7, severe: 14 } });
    // Full plate is −2 Evasion; a Guardian starts at 9.
    const plate = ARMOR.find((a) => a.name === "Full Plate Armor")!;
    expect(expected({ class: "Guardian", level: 1, armor: plate, bonuses: {} }).evasion).toBe(7);
    // No armor: Major is the level, Severe twice it.
    expect(expected({ class: "Wizard", level: 1, bonuses: {} }).thresholds).toEqual({ major: 1, severe: 2 });
    expect(expected({ class: "Wizard", level: 3, bonuses: {} }).thresholds).toEqual({ major: 3, severe: 6 });
    // Bonuses: a Giant's Hit Point, a Vengeance Guardian's Stress, a Stalwart's thresholds, a shield.
    expect(expected({ class: "Guardian", level: 1, armor: leather, bonuses: { hp: 1, stress: 1, thresholds: 1, armor: 1 } })).toEqual({
      evasion: 9,
      hp: 8,
      stress: 7,
      armorScore: 4,
      thresholds: { major: 8, severe: 15 },
    });
  });

  it("rolls Proficiency in damage dice", () => {
    expect(weaponLine({ traits: rogue().mech.traits, proficiency: 1 }, weapon("Dagger"))).toMatchObject({ attack: 2, damage: "1d8+1", dice: { count: 1, sides: 8, mod: 1 } });
    expect(weaponLine({ traits: rogue().mech.traits, proficiency: 2 }, weapon("Longsword"))).toMatchObject({ attack: 1, damage: "2d10+3" });
  });

  it("knows which threshold some damage reaches", () => {
    const th = { major: 6, severe: 12 };
    expect([0, 1, 5, 6, 11, 12, 30].map((n) => hpFor(n, th))).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it("matches the SRD tables it was built from", () => {
    expect(Object.values(CLASS_INFO).map((k) => k.domains.join("/"))).toEqual([
      "Grace/Codex",
      "Sage/Arcana",
      "Valor/Blade",
      "Bone/Sage",
      "Midnight/Grace",
      "Splendor/Valor",
      "Arcana/Midnight",
      "Blade/Bone",
      "Codex/Splendor",
    ]);
    // Three level-1 cards in each of the nine domains.
    expect(DOMAIN_CARDS).toHaveLength(27);
    for (const d of new Set(DOMAIN_CARDS.map((c) => c.domain))) expect(DOMAIN_CARDS.filter((c) => c.domain === d)).toHaveLength(3);
    // The 2025 errata.
    expect(WEAPONS.find((w) => w.name === "Longsword")).toMatchObject({ die: "d10", mod: 3 });
    expect(WEAPONS.find((w) => w.name === "Spear")).toMatchObject({ die: "d8", mod: 3 });
    expect(WEAPONS.find((w) => w.name === "Spear")?.feature).toBeUndefined();
    expect(WEAPONS.find((w) => w.name === "Glowing Rings")).toMatchObject({ die: "d10", mod: 2 });
  });
});

describe("Daggerheart checks", () => {
  it("passes a by-the-book level-1 character", () => {
    expect(errs(rogue())).toEqual([]);
  });

  it("holds domain cards to the class's two domains, the level and the loadout", () => {
    expect(errs(rogue({ domainCards: [{ name: "Pick and Pull", where: "loadout" }, { name: "Rune Ward", where: "loadout" }] }))).toEqual([
      'wren: domain card "Rune Ward" is Arcana, not one of the Rogue\'s domains (Midnight and Grace)',
    ]);
    expect(errs(rogue({ domainCards: [{ name: "Pick and Pull", where: "loadout" }] }))).toEqual(["wren: domain cards: a level-1 character has 2 (got 1)"]);
    expect(errs(rogue({ domainCards: [{ name: "Pick and Pull", where: "loadout" }, { name: "Not A Card", where: "loadout" }] }))[0]).toMatch(/isn't in the SRD table/);
    // Six cards in play at level 5 is one too many.
    const six = DOMAIN_CARDS.filter((c) => c.domain === "Midnight" || c.domain === "Grace").map((c) => ({ name: c.name, where: "loadout" as const }));
    const high = crossCheck({ level: 5 }, [rogue({ level: 5, domainCards: six, thresholds: { major: 10, severe: 16 } })]);
    expect(high).toContain("wren: loadout: at most 5 domain cards in play (got 6); put the rest in the vault");
    expect(crossCheck({ level: 5 }, [rogue({ level: 5, domainCards: six.map((x, i) => ({ ...x, where: i ? "loadout" : "vault" })), thresholds: { major: 10, severe: 16 } })])).toEqual([]);
  });

  it("wants the level-1 trait spread, Proficiency 1 and two +2 Experiences", () => {
    expect(errs(rogue({ traits: { agility: 2, strength: 2, finesse: 0, instinct: 0, presence: 0, knowledge: -1 } }))[0]).toMatch(/^wren: traits should spread/);
    expect(errs(rogue({ proficiency: 2 }))).toEqual(["wren: Proficiency is 1 at level 1 (got 2)"]);
    expect(errs(rogue({ experiences: [{ name: "Forger", bonus: 3 }, { name: "Liar", bonus: 2 }] }))).toEqual(["wren: experiences: a level-1 character has 2, each +2"]);
  });

  it("checks Evasion, Hit Points, Stress, Armor and thresholds against the rules", () => {
    expect(errs(rogue({ evasion: 12 }))).toEqual(["wren: Evasion 12, but Rogue 12 + 1 makes 13"]);
    expect(errs(rogue({ hp: 7 }))).toEqual(["wren: HP 7, but a Rogue starts with 6 = 6"]);
    expect(errs(rogue({ stress: 5 }))).toEqual(["wren: Stress 5, but everyone starts with 6 = 6"]);
    expect(errs(rogue({ armorScore: 4 }))).toEqual(["wren: Armor Score 4, but Gambeson Armor gives 3 = 3"]);
    expect(errs(rogue({ thresholds: { major: 5, severe: 11 } }))).toEqual(["wren: thresholds 5/11, but Gambeson Armor's 5/11 plus level 1 makes 6/12"]);
    // Bonuses say where an extra comes from.
    expect(errs(rogue({ hp: 7, bonuses: { hp: 1, note: "Giant" } }))).toEqual([]);
  });

  it("checks the subclass and what the hands can hold", () => {
    expect(errs(rogue({ subclass: "Troubadour" }))[0]).toMatch(/isn't a Rogue subclass/);
    expect(errs(rogue({ weapons: [weapon("Longsword"), weapon("Small Dagger")] }))).toEqual(["wren: weapons: a two-handed primary leaves no hand for a secondary weapon"]);
  });

  it("makes a card for every domain card, weapon, the armor and each feature", () => {
    const cards = cardsFor(rogue());
    expect(cards.map((c) => c.title)).toEqual(["Pick and Pull", "Deft Deceiver", "Dagger", "Small Dagger", "Gambeson Armor", "Rogue's Dodge"]);
    expect(cards[0]).toMatchObject({ kind: "spell", kicker: "Midnight · level 1 ability", accent: expect.any(String) });
  });
});

// ---- Duality dice on the event log ------------------------------------------------------

/** An rng that returns these die faces in turn (for d12s and d6s). */
const faces = (...rolls: [number, number][]) => {
  const xs = rolls.map(([v, sides]) => (v - 0.5) / sides);
  return () => xs.shift() ?? 0.5;
};

describe("duality dice", () => {
  const base = { mod: 2, adv: 0 as const, experiences: [], reaction: false, difficulty: 12 };
  it("rolls with Hope, with Fear, or a critical on matching dice", () => {
    expect(rollDuality(faces([9, 12], [4, 12]), base)).toMatchObject({ hope: 9, fear: 4, total: 15, outcome: "hope", success: true });
    expect(rollDuality(faces([2, 12], [7, 12]), base)).toMatchObject({ total: 11, outcome: "fear", success: false });
    // Matching dice succeed whatever the total.
    expect(rollDuality(faces([3, 12], [3, 12]), { ...base, difficulty: 30 })).toMatchObject({ total: 8, outcome: "crit", success: true });
  });
  it("adds a d6 for advantage, takes one away for disadvantage, and adds Experiences", () => {
    expect(rollDuality(faces([5, 12], [6, 12], [4, 6]), { ...base, adv: 1 })).toMatchObject({ adv: { value: 4, sign: 1 }, total: 17 });
    expect(rollDuality(faces([5, 12], [6, 12], [4, 6]), { ...base, adv: -1 })).toMatchObject({ adv: { value: 4, sign: -1 }, total: 9 });
    expect(rollDuality(faces([5, 12], [6, 12]), { ...base, experiences: [{ name: "Forger", bonus: 2 }] }).total).toBe(15);
  });
});

const A = "aaaaaaaaaaaaaaaa1";
const B = "bbbbbbbbbbbbbbbb2";
const people: Person[] = [
  { playerId: A, handle: "handlea001", name: "Ann", characterId: "wren", character: "Wren", since: "2026-10-20T19:00:00.000Z" },
  { playerId: B, handle: "handleb002", name: "Bo", characterId: "bram", character: "Bram", since: "2026-10-20T19:01:00.000Z" },
];
const gm: LiveActor = { role: "gm" };
const pa: LiveActor = { role: "player", playerId: A };
const pb: LiveActor = { role: "player", playerId: B };

/** A Daggerheart table that plays actions and keeps the log, like the API does. */
function table(rng: () => number = Math.random) {
  const rows: LiveRow[] = [];
  const bram = rogue();
  bram.id = "bram";
  bram.name = "Bram";
  const sheets = sheetLimits([rogue(), bram]);
  const ctx = (): LiveContext => ({ people, rows, acts: [], rumors: [], notices: [], coin: null, dice: "duality", sheets, rng });
  let n = 0;
  const play = (a: Omit<LiveAction, never> | Record<string, unknown>, who: LiveActor) => {
    const r = applyLive(a as LiveAction, who, ctx());
    if (r.ok) for (const row of r.rows) rows.push({ ...row, id: ++n, createdAt: new Date(Date.parse("2026-10-20T20:00:00Z") + n * 1000).toISOString() });
    return r;
  };
  const fold = () => foldTallies(rows, sheets);
  return { rows, play, fold, sheets };
}

const duality = (over: Record<string, unknown> = {}) => ({ type: "duality", label: "Finesse", mod: 2, adv: 0, experiences: [], reaction: false, ...over });

describe("duality dice at the table", () => {
  it("gives the roller a Hope on Hope, the GM a Fear on Fear, and a Hope and a cleared Stress on a critical", () => {
    const t = table(faces([10, 12], [3, 12], [2, 12], [11, 12], [6, 12], [6, 12]));
    expect(t.fold().marks.wren.hope).toBe(2);
    expect(t.play(duality(), pa).ok).toBe(true);
    expect(t.fold().marks.wren.hope).toBe(3);
    t.play(duality(), pa);
    expect(t.fold().fear).toBe(1);
    t.play({ type: "mark", track: "stress", delta: 2 }, pa);
    t.play(duality(), pa);
    expect(t.fold().marks.wren).toMatchObject({ hope: 4, stress: 1 });
    const crit = t.rows.filter((r) => r.kind === "roll").at(-1)!.data as DualityData;
    expect(crit.outcome).toBe("crit");
  });

  it("spends a Hope per Experience, and refuses without the Hope", () => {
    const t = table(faces([1, 12], [12, 12], [1, 12], [12, 12], [1, 12], [12, 12]));
    expect(t.play(duality({ experiences: ["forger", "Never Forget a Face"] }), pa).ok).toBe(true);
    const r = t.rows.find((x) => x.kind === "roll")!.data as DualityData;
    expect(r.experiences).toEqual([
      { name: "Forger", bonus: 2 },
      { name: "Never Forget a Face", bonus: 2 },
    ]);
    expect(r.total).toBe(1 + 12 + 2 + 4);
    expect(t.fold().marks.wren.hope).toBe(0);
    expect(t.play(duality({ experiences: ["Forger"] }), pa)).toEqual({ ok: false, error: "You need a Hope to add an Experience" });
    expect(t.play(duality({ experiences: ["Swordsman"] }), pa)).toEqual({ ok: false, error: 'No Experience called "Swordsman" on your sheet' });
  });

  it("earns no Hope or Fear on a reaction roll", () => {
    const t = table(faces([12, 12], [1, 12]));
    t.play(duality({ reaction: true }), pa);
    expect(t.fold()).toMatchObject({ fear: 0, marks: { wren: { hope: 2 } } });
  });

  it("keeps duality to players with a character, and Fear to the GM", () => {
    const t = table();
    expect(t.play(duality(), gm)).toEqual({ ok: false, error: "The GM rolls a d20 for adversaries" });
    expect(t.play({ type: "fear", delta: 1 }, pa)).toEqual({ ok: false, error: "Only the GM holds Fear" });
    expect(t.play({ type: "fear", delta: 3, opening: true }, gm).ok).toBe(true);
    t.play({ type: "fear", delta: -1 }, gm);
    expect(t.fold().fear).toBe(2);
    expect((t.rows[0].data as TallyData).why).toBe("the opening Fear");
  });

  it("lets a player mark only their own sheet; the GM marks anyone's", () => {
    const t = table();
    expect(t.play({ type: "mark", track: "hp", delta: 2, to: "handleb002" }, pa)).toEqual({ ok: false, error: "You can only mark your own sheet" });
    expect(t.play({ type: "mark", track: "hp", delta: 2 }, pb).ok).toBe(true);
    expect(t.play({ type: "mark", track: "armor", delta: 1, to: "handlea001" }, gm).ok).toBe(true);
    expect(t.play({ type: "mark", track: "hp", delta: 1 }, gm)).toEqual({ ok: false, error: "Mark whose sheet?" });
    expect(t.fold().marks).toMatchObject({ bram: { hp: 2 }, wren: { armor: 1 } });
  });

  it("clamps every count to its slots: Hope at 6, Fear at 12, marks at the sheet's", () => {
    const t = table();
    t.play({ type: "mark", track: "hope", delta: 9 }, pa);
    t.play({ type: "mark", track: "hp", delta: 12 }, pa);
    t.play({ type: "mark", track: "stress", delta: -3 }, pa);
    t.play({ type: "fear", delta: 12 }, gm);
    t.play({ type: "fear", delta: 5 }, gm);
    expect(t.fold()).toMatchObject({ fear: 12, marks: { wren: { hope: 6, hp: 6, stress: 0 } } });
  });

  it("keeps duality rolls in the open, and never shows a browser id", () => {
    const t = table(faces([4, 12], [9, 12]));
    t.play(duality(), pa);
    t.play({ type: "mark", track: "hp", delta: 1 }, pb);
    const roll = t.rows.find((r) => r.kind === "roll")!;
    expect(t.play({ type: "hide", roll: roll.id, hidden: true }, gm)).toEqual({ ok: false, error: "A duality roll moves Hope and Fear in the open, so it can't go behind the screen" });
    for (const viewer of [{ role: "gm" }, pa, pb, { role: "table" }] as Viewer[]) {
      const seen = viewEvents(t.rows, viewer, { people, rumors: [] });
      expect(seen.filter((e) => e.kind === "tally")).toHaveLength(2);
      const json = JSON.stringify(seen);
      expect(json).not.toContain(A);
      expect(json).not.toContain(B);
    }
    // The TV folds the same counts the server does.
    const tv = viewEvents(t.rows, { role: "table" }, { people, rumors: [] });
    expect(foldTallies(tv, t.sheets)).toEqual(t.fold());
  });
});

describe("Daggerheart privacy", () => {
  it("strips the adversaries, notes, letters and NPC fallbacks from player pages", () => {
    const os = oneShotSchema.parse({
      slug: "test-ferry",
      title: "Test Ferry",
      system: "daggerheart",
      level: 1,
      pitch: "A ferry.",
      premise: "Why.",
      players: { min: 1, max: 4 },
      durationHrs: 3,
      tone: ["warm"],
      setting: "A river",
      posting: { header: "HIRING", reward: "Passage" },
      gmNotes: "The ferryman is dead.",
      letters: [{ id: "l1", to: "wren", title: "A note", when: "Act 1", text: "Your brother is below decks." }],
      adversaries: [
        { id: "eel", name: "River Eel", type: "Bruiser", difficulty: 12, thresholds: { major: 8, severe: 14 }, hp: 5, stress: 2, attack: { name: "Bite", mod: 2, range: "Melee", damage: "1d10+2" } },
      ],
    });
    const full: OneShotWithCast = { ...os, cast: [{ ...rogue(), ifUnclaimed: { npc: "She stays ashore and sulks.", reassign: [], cuts: [] } }] };
    const pub = toPublic(full);
    const json = JSON.stringify(pub);
    for (const k of ["adversaries", "gmNotes", "letters", "acts", "rumors", "notices"]) expect(k in pub).toBe(false);
    for (const s of ["River Eel", "The ferryman is dead", "below decks", "sulks"]) expect(json).not.toContain(s);
    expect(pub.cast[0].mech.evasion).toBe(13);
  });
});
