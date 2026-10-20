import { describe, expect, it } from "vitest";
import { applyTc, burnTime, initialState, spent, viewTc, type TcAction, type TcState } from "./game";
import { mirrorTc } from "./live";

const gm = { role: "gm" } as const;
const p = (i: number) => ({ role: "player", playerId: `player-${i}-xxxxxxxx` }) as const;
const MIN = 60_000;
const T0 = Date.parse("2026-10-20T19:00:00Z");

/** A table played through the reducer, with a clock we move by hand. */
function table(settings: Partial<TcState["settings"]> = {}) {
  let s = initialState();
  let now = T0;
  const go = (action: TcAction, actor: Parameters<typeof applyTc>[2] = gm, rng = () => 0.5) => {
    const r = applyTc(s, action, actor, rng, now);
    if (!r.ok) return r.error;
    s = r.state;
    return null;
  };
  go({ type: "settings", patch: settings });
  for (const i of [0, 1]) go({ type: "sit", name: `P${i}` }, p(i));
  go({ type: "begin" });
  for (const i of [0, 1]) go({ type: "traits", virtue: "brave", vice: "rash" }, p(i));
  const step = () => {
    now += MIN;
    return go({ type: "next" });
  };
  step(); // three candles, lit a minute in
  step(); // module
  for (const i of [0, 1]) go({ type: "concept", name: `C${i}`, look: "wet", concept: "lost" }, p(i));
  step();
  for (const i of [0, 1]) go({ type: "moment", text: "hope" }, p(i));
  step(); // three more
  for (const i of [0, 1]) go({ type: "brink", text: "seen" }, p(i));
  go({ type: "brink", text: "seen too" });
  step(); // three more
  for (const i of [0, 1]) go({ type: "order", order: ["virtue", "vice", "moment"] }, p(i));
  step(); // the tenth
  for (const i of [0, 1]) go({ type: "recorded", kind: "text" }, p(i));
  step(); // scene 1
  return {
    get s() {
      return s;
    },
    go,
    later: (ms: number) => (now += ms),
    get now() {
      return now;
    },
  };
}

describe("Ten Candles: candles that burn down", () => {
  it("gives each candle a burn time between the table's minutes when it's lit", () => {
    expect(burnTime({ burnMin: 120, burnMax: 180 }, () => 0)).toBe(120 * MIN);
    expect(burnTime({ burnMin: 120, burnMax: 180 }, () => 0.999999)).toBeCloseTo(180 * MIN, -3);
    expect(burnTime({ burnMin: 0, burnMax: 180 }, () => 0.5)).toBeNull();
    const t = table();
    expect(t.s.phase).toBe("scene");
    expect(t.s.candles.every(Boolean)).toBe(true);
    for (let i = 0; i < 10; i++) {
      expect(t.s.litAt[i]).not.toBeNull();
      expect(t.s.life[i]).toBe(150 * MIN); // rng 0.5 → halfway between 120 and 180
    }
    // Lit in batches as creation went on, so they won't all go out together.
    expect(new Set(t.s.litAt).size).toBeGreaterThan(1);
  });

  it("lets the GM's page put out a candle once it has burned down, which ends the scene", () => {
    const t = table();
    const first = t.s.litAt.indexOf(Math.min(...(t.s.litAt as number[])));
    expect(t.go({ type: "burnout", index: first })).toMatch(/hasn't burned down/);
    t.later(150 * MIN);
    expect(spent(t.s, t.now)).toContain(first);
    expect(t.go({ type: "burnout", index: first }, p(0))).toMatch(/Only the GM/);
    const before = t.s;
    expect(t.go({ type: "burnout", index: first })).toBeNull();
    expect(t.s.candles[first]).toBe(false);
    expect(t.s.litAt[first]).toBeNull();
    expect(t.s.phase).toBe("truths"); // a candle going out ends the scene
    expect(t.s.lastOut).toMatchObject({ index: first, cause: "burnout" });
    expect(mirrorTc(before, t.s).find((r) => r.kind === "candle")?.data).toMatchObject({ cause: "burnout", lit: 9 });
  });

  it("never burns down at a table with real candles", () => {
    const t = table({ burnMin: 0 });
    expect(t.s.life.every((x) => x === null)).toBe(true);
    t.later(600 * MIN);
    expect(spent(t.s, t.now)).toEqual([]);
    expect(t.go({ type: "burnout", index: 9 })).toMatch(/hasn't burned down/);
  });
});

describe("Ten Candles: drafts", () => {
  it("makes one lit candle sputter until the GM decides, and only in play", () => {
    const t = table();
    expect(t.go({ type: "draft" }, p(0))).toMatch(/Only the GM/);
    expect(t.go({ type: "draft" })).toBeNull();
    const d = t.s.draft!;
    expect(t.s.candles[d.index]).toBe(true);
    expect(t.go({ type: "draft" })).toMatch(/already sputtering/);
    // Everyone sees it sputter, the TV included.
    expect(viewTc(t.s, { role: "table" }).draft).toEqual(d);
    expect(t.go({ type: "draftSettle", out: false })).toBeNull();
    expect(t.s.draft).toBeNull();
    expect(t.s.candles[d.index]).toBe(true);
    expect(t.s.phase).toBe("scene");
  });

  it("puts the candle out when the GM says so, ending the scene", () => {
    const t = table();
    t.go({ type: "draft" });
    const index = t.s.draft!.index;
    expect(t.go({ type: "draftSettle", out: true }, p(1))).toMatch(/Only the GM/);
    expect(t.go({ type: "draftSettle", out: true })).toBeNull();
    expect(t.s.candles[index]).toBe(false);
    expect(t.s.phase).toBe("truths");
    expect(t.s.lastOut).toMatchObject({ index, cause: "draft" });
    expect(t.go({ type: "draftSettle", out: true })).toMatch(/No candle is sputtering/);
  });

  it("blows over if its candle goes out some other way", () => {
    const t = table();
    t.go({ type: "draft" });
    const index = t.s.draft!.index;
    t.go({ type: "candle", index, lit: false });
    expect(t.s.draft).toBeNull();
  });

  it("refuses between scenes", () => {
    const s = initialState();
    const r = applyTc(s, { type: "draft" }, gm, () => 0.5, T0);
    expect(r.ok).toBe(false);
  });
});

describe("Ten Candles: games saved before candles burned", () => {
  it("still load, view and play", () => {
    const old = initialState() as Partial<TcState>;
    delete old.litAt;
    delete old.life;
    delete old.draft;
    delete old.lastOut;
    const settings = { ...old.settings! } as Partial<TcState["settings"]>;
    delete settings.burnMin;
    delete settings.draftsPerHour;
    const legacy = { ...old, settings } as TcState;
    expect(viewTc(legacy, { role: "table" }).burnsOut).toHaveLength(10);
    const r = applyTc(legacy, { type: "sit", name: "Ann" }, p(0), () => 0.5, T0);
    expect(r.ok && r.state.settings.burnMin).toBe(120);
  });
});
