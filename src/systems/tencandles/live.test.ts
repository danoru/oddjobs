import { describe, expect, it } from "vitest";
import type { PoolRollData } from "@/lib/live";
import { applyTc, initialState, type TcAction, type TcState } from "./game";
import { actForCandles, mirrorTc } from "./live";

const acts = ["lamp", "burn", "line", "tunnel", "last"].map((id) => ({ id, title: id.toUpperCase() }));
const stages = [{ candles: 10 }, { candles: 7 }, { candles: 4 }, { candles: 2 }];

describe("Ten Candles: the candles drive the act cards", () => {
  it("picks the stage's act for a candle count, and the extra act for the Last Stand", () => {
    expect([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => actForCandles(acts, stages, n))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 3, 4]);
    expect(actForCandles(acts.slice(0, 4), stages, 1)).toBe(3);
    expect(actForCandles([], stages, 5)).toBeNull();
    expect(actForCandles(acts.slice(0, 2), stages, 3)).toBe(1); // fewer acts than stages: the last one holds
  });
});

/** A game through creation to scene 1, with two seats, as the reducer plays it. */
function started(): TcState {
  let s = initialState();
  const a = (action: TcAction, actor: Parameters<typeof applyTc>[2]) => {
    const r = applyTc(s, action, actor, () => 0.99);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  };
  const gm = { role: "gm" } as const;
  const p = (i: number) => ({ role: "player", playerId: `player-${i}-xxxxxxxx` }) as const;
  a({ type: "sit", name: "Ida" }, p(0));
  a({ type: "sit", name: "Owen" }, p(1));
  a({ type: "begin" }, gm);
  for (const i of [0, 1]) a({ type: "traits", virtue: "brave", vice: "rash" }, p(i));
  a({ type: "next" }, gm);
  a({ type: "next" }, gm);
  for (const i of [0, 1]) a({ type: "concept", name: `C${i}`, look: "wet", concept: "lost" }, p(i));
  a({ type: "next" }, gm);
  for (const i of [0, 1]) a({ type: "moment", text: "hope" }, p(i));
  a({ type: "next" }, gm);
  for (const i of [0, 1]) a({ type: "brink", text: "seen" }, p(i));
  a({ type: "brink", text: "seen too" }, gm);
  a({ type: "next" }, gm);
  for (const i of [0, 1]) a({ type: "order", order: ["virtue", "vice", "moment"] }, p(i));
  a({ type: "next" }, gm);
  for (const i of [0, 1]) a({ type: "recorded", kind: "text" }, p(i));
  return s;
}

describe("Ten Candles: what the game adds to the table's log", () => {
  it("raises the first act when scene one begins", () => {
    const before = started();
    const r = applyTc(before, { type: "next" }, { role: "gm" }, () => 0.99);
    if (!r.ok) throw new Error(r.error);
    const rows = mirrorTc(before, r.state, { acts, stages, lastAct: -1 });
    expect(rows.map((x) => x.kind)).toEqual(["act"]);
    expect(rows[0].data).toMatchObject({ id: "lamp", index: 0, total: 5 });
    // Already up? Nothing new.
    expect(mirrorTc(before, r.state, { acts, stages, lastAct: 0 })).toEqual([]);
  });

  it("mirrors a settled roll (failure darkens a candle), and the GM putting a candle out by hand", () => {
    let s = started();
    const go = (action: TcAction, actor: Parameters<typeof applyTc>[2], rng = () => 0.99) => {
      const prev = s;
      const r = applyTc(s, action, actor, rng);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      return mirrorTc(prev, s, { acts, stages, lastAct: 0 });
    };
    go({ type: "next" }, { role: "gm" });
    const ida = { role: "player", playerId: "player-0-xxxxxxxx" } as const;
    expect(go({ type: "roll" }, ida, () => 0)).toEqual([]); // rolled, not settled yet
    const settled = go({ type: "accept" }, ida);
    const roll = settled.find((x) => x.kind === "roll")!;
    expect(roll.byPlayer).toBe("player-0-xxxxxxxx");
    expect(roll.data as PoolRollData).toMatchObject({ system: "pool", who: "C0", success: false, darkened: true });
    expect(settled.some((x) => x.kind === "candle")).toBe(false); // the roll put it out, not the GM
    // During truths the GM puts out another by hand.
    const byHand = go({ type: "candle", index: s.candles.lastIndexOf(true), lit: false }, { role: "gm" });
    expect(byHand.map((x) => x.kind)).toEqual(["candle"]);
  });

  it("mirrors a death by choice", () => {
    let s = started();
    const r0 = applyTc(s, { type: "next" }, { role: "gm" }, () => 0.99);
    if (!r0.ok) throw new Error(r0.error);
    s = r0.state;
    const r = applyTc(s, { type: "die", seat: 1 }, { role: "gm" }, () => 0.99);
    if (!r.ok) throw new Error(r.error);
    const rows = mirrorTc(s, r.state);
    expect(rows).toEqual([{ kind: "death", data: { who: "C1" }, byPlayer: "player-1-xxxxxxxx", toPlayer: null, hidden: false }]);
  });
});
