import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/game";
import {
  applyTc,
  initialState,
  litCount,
  playerPool,
  recipients,
  stackOf,
  topCard,
  truthSpeaker,
  viewTc,
  type TcAction,
  type TcState,
} from "./game";

const GM: Actor = { role: "gm" };
const P = (n: number): Actor => ({ role: "player", playerId: `player-id-${n}-xxxx` });

/** Dice that come up as listed, in order (then 2s). */
function dice(...faces: number[]) {
  const q = [...faces];
  return () => ((q.shift() ?? 2) - 1 + 0.5) / 6;
}

function act(s: TcState, a: TcAction, who: Actor, rng = dice()): TcState {
  const r = applyTc(s, a, who, rng);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}

function refuse(s: TcState, a: TcAction, who: Actor, rng = dice()): string {
  const r = applyTc(s, a, who, rng);
  if (r.ok) throw new Error(`${a.type} should have been refused`);
  return r.error;
}

/** Three players through character creation, with each card's text saying who wrote what for whom. */
function created(settings: Partial<TcState["settings"]> = {}): TcState {
  let s = initialState();
  for (const n of [0, 1, 2]) s = act(s, { type: "sit", name: `Ana${n}` }, P(n));
  if (Object.keys(settings).length) s = act(s, { type: "settings", patch: settings }, GM);
  s = act(s, { type: "begin" }, GM);
  for (const n of [0, 1, 2]) s = act(s, { type: "traits", virtue: `virtue by ${n}`, vice: `vice by ${n}` }, P(n));
  s = act(s, { type: "next" }, GM); // → module
  s = act(s, { type: "next" }, GM); // → concept
  for (const n of [0, 1, 2]) s = act(s, { type: "concept", name: `Char${n}`, look: "wet coat", concept: "a nurse" }, P(n));
  s = act(s, { type: "next" }, GM); // → moment
  for (const n of [0, 1, 2]) s = act(s, { type: "moment", text: `moment of ${n}` }, P(n));
  s = act(s, { type: "next" }, GM); // → brink
  for (const n of [0, 1, 2]) s = act(s, { type: "brink", text: `brink by ${n}` }, P(n));
  s = act(s, { type: "brink", text: "brink by the GM" }, GM);
  s = act(s, { type: "next" }, GM); // → stack
  for (const n of [0, 1, 2]) s = act(s, { type: "order", order: ["virtue", "vice", "moment"] }, P(n));
  s = act(s, { type: "next" }, GM); // → record
  for (const n of [0, 1, 2]) s = act(s, { type: "recorded", kind: "text" }, P(n));
  return act(s, { type: "next" }, GM); // → scene 1
}

describe("seats and passing cards", () => {
  it("passes Virtues right and Vices left by default, and the reverse when set", () => {
    const r = recipients(3, { virtueTo: "right" });
    expect([0, 1, 2].map(r.virtue)).toEqual([2, 0, 1]);
    expect([0, 1, 2].map(r.vice)).toEqual([1, 2, 0]);
    const l = recipients(3, { virtueTo: "left" });
    expect([0, 1, 2].map(l.virtue)).toEqual([1, 2, 0]);
  });

  it("deals every player a Virtue from one neighbour and a Vice from the other", () => {
    const s = created();
    const owned = (seat: number, kind: string) => s.cards.find((c) => c.owner === seat && c.kind === kind)?.text;
    expect(owned(0, "virtue")).toBe("virtue by 1");
    expect(owned(0, "vice")).toBe("vice by 2");
    expect(owned(1, "virtue")).toBe("virtue by 2");
    expect(owned(2, "vice")).toBe("vice by 1");
  });

  it("has Brinks written by the player on your right, the GM for seat 0, and the GM's right for Them", () => {
    const s = created();
    const brink = (owner: number | "them") => s.cards.find((c) => c.kind === "brink" && c.owner === owner)?.text;
    expect(brink(0)).toBe("brink by the GM");
    expect(brink(1)).toBe("brink by 0");
    expect(brink(2)).toBe("brink by 1");
    expect(brink("them")).toBe("brink by 2");
  });

  it("stacks traits in the chosen order with the Brink at the bottom", () => {
    let s = created();
    expect(stackOf(s, 0).map((c) => c.kind)).toEqual(["virtue", "vice", "moment", "brink"]);
    s = { ...s, players: s.players.map((p, i) => (i === 1 ? { ...p, order: ["moment", "vice", "virtue"] } : p)) };
    expect(stackOf(s, 1).map((c) => c.kind)).toEqual(["moment", "vice", "virtue", "brink"]);
  });

  it("lights candles 3, 3, 3 and then the tenth as creation goes", () => {
    let s = initialState();
    s = act(s, { type: "sit", name: "Solo" }, P(0));
    s = act(s, { type: "begin" }, GM);
    s = act(s, { type: "traits", virtue: "v", vice: "x" }, P(0));
    s = act(s, { type: "next" }, GM);
    expect(litCount(s)).toBe(3);
    expect(created().candles.every(Boolean)).toBe(true);
  });

  it("waits for everyone before moving on, unless the GM forces it", () => {
    let s = initialState();
    for (const n of [0, 1]) s = act(s, { type: "sit", name: `P${n}` }, P(n));
    s = act(s, { type: "begin" }, GM);
    s = act(s, { type: "traits", virtue: "v", vice: "x" }, P(0));
    expect(refuse(s, { type: "next" }, GM)).toMatch(/waiting on P1/);
    expect(act(s, { type: "next", force: true }, GM).step).toBe("module");
    expect(refuse(s, { type: "next" }, P(0))).toMatch(/GM/);
  });

  it("fixes the seats once creation starts", () => {
    const s = created();
    expect(refuse(s, { type: "sit", name: "Late" }, P(9))).toMatch(/started/);
    expect(refuse(s, { type: "move", from: 0, to: 2 }, GM)).toMatch(/fixed/);
  });
});

describe("what each viewer may read", () => {
  const s = created();
  const json = (v: unknown) => JSON.stringify(v);

  it("never sends anyone's player id", () => {
    for (const viewer of [GM, P(0), P(1), { role: "table" as const }]) expect(json(viewTc(s, viewer))).not.toContain("player-id-");
  });

  it("shows a player their own stack, Brink included, and the cards they wrote", () => {
    const v = viewTc(s, P(0));
    expect(v.you).toBe(0);
    const texts = v.cards.map((c) => c.text);
    expect(texts).toEqual(
      expect.arrayContaining(["virtue by 1", "vice by 2", "moment of 0", "brink by the GM", "virtue by 0", "vice by 0", "brink by 0"]),
    );
  });

  it("hides other players' unburned cards", () => {
    const v = json(viewTc(s, P(0)));
    expect(v).not.toContain("moment of 1");
    expect(v).not.toContain("brink by 1"); // seat 1 wrote it about seat 2
    expect(v).not.toContain("brink by 2"); // about Them
    expect(v).not.toContain("virtue by 2"); // seat 2 wrote it for seat 1
  });

  it("shows the TV no card text at all, but does show what kind is on top", () => {
    const v = viewTc(s, { role: "table" });
    expect(v.cards).toEqual([]);
    expect(v.seats.map((x) => x.top)).toEqual(["virtue", "virtue", "virtue"]);
  });

  it("shows the GM everything", () => {
    expect(viewTc(s, GM).cards).toHaveLength(s.cards.length);
  });

  it("makes a burned card public", () => {
    let t = act(s, { type: "roll" }, P(1), dice(1, 1, 3));
    t = act(t, { type: "burn" }, P(1), dice(6, 6));
    const v = json(viewTc(t, P(0)));
    expect(v).toContain("virtue by 2"); // seat 1's burned Virtue, written by seat 2
  });

  it("lets players hear only their own words until the end (or a death, if set)", () => {
    expect(viewTc(s, P(0)).heard).toEqual([0]);
    expect(viewTc(s, GM).heard).toEqual([0, 1, 2]);
    expect(viewTc(s, { role: "table" }).heard).toEqual([]);
    const over = act(s, { type: "end" }, GM);
    expect(viewTc(over, P(0)).heard).toEqual([0, 1, 2]);
    let onDeath = act(s, { type: "settings", patch: { playback: "onDeath" } }, GM);
    onDeath = act(onDeath, { type: "die", seat: 2 }, GM);
    expect(viewTc(onDeath, P(0)).heard).toEqual([0, 2]);
  });
});

describe("dice", () => {
  it("rolls one die per lit candle for the players and one per dark candle for the GM", () => {
    const s = created();
    expect(s.phase).toBe("scene");
    expect(s.scene).toBe(1);
    const t = act(s, { type: "roll" }, P(0), dice(6));
    expect(t.roll!.dice).toHaveLength(10);
    expect(t.roll!.gmDice).toHaveLength(0);
  });

  it("succeeds on any 6 and sets 1s aside for the rest of the scene", () => {
    let s = created();
    s = act(s, { type: "roll" }, P(0), dice(6, 1, 1, 3));
    s = act(s, { type: "accept" }, P(0));
    expect(s.log.at(-1)!.resolved).toMatchObject({ success: true, narrator: "player", ones: 2 });
    expect(playerPool(s)).toBe(8);
    expect(s.phase).toBe("scene");
  });

  it("gives the telling to the GM when the GM rolls as many 6s", () => {
    let s = created();
    s = { ...s, candles: s.candles.map((c, i) => i < 8) }; // two dark: the GM has two dice
    s = act(s, { type: "roll" }, P(0), dice(6, 2, 2, 2, 2, 2, 2, 2, 6, 3));
    s = act(s, { type: "accept" }, GM);
    expect(s.log.at(-1)!.resolved).toMatchObject({ success: true, narrator: "gm", sixes: 1, gmSixes: 1 });
  });

  it("darkens a candle and ends the scene on a failure, then asks for truths", () => {
    let s = created();
    s = act(s, { type: "roll" }, P(1), dice(2, 3, 4, 5, 2, 3, 4, 5, 2, 3));
    s = act(s, { type: "accept" }, P(1));
    expect(litCount(s)).toBe(9);
    expect(s.phase).toBe("truths");
    expect(s.truths).toMatchObject({ scene: 2, needed: 8, starter: 1 });
  });

  it("burning the top trait rerolls only the 1s", () => {
    let s = created();
    s = act(s, { type: "roll" }, P(0), dice(1, 3, 1, 4, 2, 2, 2, 2, 2, 2));
    s = act(s, { type: "burn" }, P(0), dice(6, 5));
    expect(s.roll!.dice).toEqual([6, 3, 5, 4, 2, 2, 2, 2, 2, 2]);
    expect(topCard(s, 0)!.kind).toBe("vice");
    expect(refuse(s, { type: "burn" }, P(1))).toMatch(/Only the player rolling/);
  });

  it("living the Moment gives Hope on a success, and the Moment burns either way", () => {
    let s = created();
    s = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, order: ["moment", "virtue", "vice"] } : p)) };
    s = act(s, { type: "roll", moment: true }, P(0), dice(6));
    s = act(s, { type: "accept" }, P(0));
    expect(s.players[0].hope).toBe(true);
    expect(topCard(s, 0)!.kind).toBe("virtue");
  });

  it("a Hope die succeeds on a 5", () => {
    let s = created();
    s = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, hope: true } : p)) };
    s = act(s, { type: "roll" }, P(0), dice(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5));
    expect(s.roll!.hope).toBe(5);
    s = act(s, { type: "accept" }, P(0));
    expect(s.log.at(-1)!.resolved!.success).toBe(true);
  });

  it("embracing the Brink rerolls everything; failing burns it and takes the Hope die", () => {
    let s = created();
    // Burn everything but the Brink.
    s = { ...s, cards: s.cards.map((c) => (c.owner === 0 && c.kind !== "brink" ? { ...c, burned: true } : c)) };
    s = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, hope: true } : p)) };
    s = act(s, { type: "roll" }, P(0), dice(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3));
    s = act(s, { type: "embrace" }, P(0), dice(3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2));
    s = act(s, { type: "accept" }, P(0));
    expect(s.players[0].hope).toBe(false);
    expect(s.cards.find((c) => c.owner === 0 && c.kind === "brink")!.burned).toBe(true);
    expect(litCount(s)).toBe(9);
  });

  it("a Brink that works stays on top to be embraced again", () => {
    let s = created();
    s = { ...s, cards: s.cards.map((c) => (c.owner === 0 && c.kind !== "brink" ? { ...c, burned: true } : c)) };
    s = act(s, { type: "roll" }, P(0), dice(2));
    s = act(s, { type: "embrace" }, P(0), dice(6));
    s = act(s, { type: "accept" }, P(0));
    expect(topCard(s, 0)!.kind).toBe("brink");
  });

  it("can restrict Brinks to failed rolls", () => {
    let s = created({ brinkWhen: "failed" });
    s = { ...s, cards: s.cards.map((c) => (c.owner === 0 && c.kind !== "brink" ? { ...c, burned: true } : c)) };
    s = act(s, { type: "roll" }, P(0), dice(6));
    expect(refuse(s, { type: "embrace" }, P(0))).toMatch(/only for a roll that failed/);
  });

  it("lets the roller darken a candle to take back the telling", () => {
    let s = created();
    s = { ...s, candles: s.candles.map((c, i) => i < 9) };
    s = act(s, { type: "roll" }, P(2), dice(6, 2, 2, 2, 2, 2, 2, 2, 2, 6));
    s = act(s, { type: "accept" }, P(2));
    s = act(s, { type: "seize" }, P(2));
    expect(litCount(s)).toBe(8);
    expect(s.log.at(-1)!.resolved).toMatchObject({ narrator: "player", seized: true });
    expect(s.truths!.starter).toBe(2);
  });

  it("can send players' 1s to the GM", () => {
    let s = created({ onesToGm: true });
    s = act(s, { type: "roll" }, P(0), dice(6, 1, 1));
    s = act(s, { type: "accept" }, P(0));
    s = act(s, { type: "roll" }, P(1));
    expect(s.roll!.gmDice).toHaveLength(2);
  });

  it("ends the scene when a real candle goes out", () => {
    let s = created();
    s = act(s, { type: "candle", index: 4, lit: false }, GM);
    expect(s.phase).toBe("truths");
    expect(litCount(s)).toBe(9);
  });
});

describe("truths", () => {
  function atTruths(): TcState {
    let s = created();
    s = act(s, { type: "roll" }, P(1), dice(2, 2, 2, 2, 2, 2, 2, 2, 2, 2));
    return act(s, { type: "accept" }, P(1));
  }

  it("goes round from the player who failed, clockwise, the GM in turn", () => {
    let s = atTruths();
    const order: (number | "gm" | null)[] = [];
    for (let i = 0; i < 8; i++) {
      const who = truthSpeaker(s);
      order.push(who);
      s = act(s, { type: "truth", text: `truth ${i}` }, who === "gm" ? GM : P(who as number));
    }
    expect(order).toEqual([1, 2, "gm", 0, 1, 2, "gm", 0]);
    expect(truthSpeaker(s)).toBeNull();
  });

  it("refuses a truth out of turn, and the closing line before enough truths", () => {
    const s = atTruths();
    expect(refuse(s, { type: "truth", text: "x" }, P(0))).toMatch(/turn/);
    expect(refuse(s, { type: "close" }, P(0))).toMatch(/Not every truth/);
  });

  it("closes with 'and we are alive' and starts the next scene with full pools", () => {
    let s = atTruths();
    for (let i = 0; i < 8; i++) s = act(s, { type: "truth", text: `t${i}` }, GM);
    s = act(s, { type: "close" }, P(0));
    expect(s.phase).toBe("scene");
    expect(s.scene).toBe(2);
    expect(playerPool(s)).toBe(9);
    expect(s.stated.at(-1)!.entries).toHaveLength(8);
  });

  it("asks for fewer truths if candles go out during the round", () => {
    let s = atTruths();
    s = act(s, { type: "candle", index: 7, lit: false }, GM);
    s = act(s, { type: "candle", index: 6, lit: false }, GM);
    expect(s.truths!.needed).toBe(6);
    expect(s.phase).toBe("truths");
  });

  it("can start with the player on the GM's left instead", () => {
    let s = created({ truthStarter: "gmLeft" });
    s = act(s, { type: "roll" }, P(2), dice(2, 2, 2, 2, 2, 2, 2, 2, 2, 2));
    s = act(s, { type: "accept" }, P(2));
    expect(truthSpeaker(s)).toBe(0);
  });
});

describe("the last stand", () => {
  function lastStand(): TcState {
    let s = created();
    s = { ...s, candles: s.candles.map((c, i) => i < 2) };
    s = act(s, { type: "roll" }, P(0), dice(2, 2));
    s = act(s, { type: "accept" }, P(0)); // one candle left
    expect(s.truths!.needed).toBe(0);
    return act(s, { type: "close" }, GM);
  }

  it("rolls one die, and a failure kills the character without darkening the candle", () => {
    let s = lastStand();
    expect(s.lastStand).toBe(true);
    s = act(s, { type: "roll" }, P(1), dice(3));
    expect(s.roll!.dice).toHaveLength(1);
    s = act(s, { type: "accept" }, P(1));
    expect(s.players[1].alive).toBe(false);
    expect(litCount(s)).toBe(1);
    expect(refuse(s, { type: "roll" }, P(1))).toMatch(/dead/);
  });

  it("ends when the last character dies", () => {
    let s = lastStand();
    for (const n of [0, 1, 2]) {
      s = act(s, { type: "roll" }, P(n), dice(4));
      s = act(s, { type: "accept" }, P(n));
    }
    expect(s.phase).toBe("ended");
    expect(litCount(s)).toBe(0); // the last light goes with them
  });

  it("ends when the last candle goes out", () => {
    const s = act(lastStand(), { type: "candle", index: 0, lit: false }, GM);
    expect(s.phase).toBe("ended");
  });
});

describe("dying by choice", () => {
  it("is allowed after your own failed roll, and can pass on your Hope", () => {
    let s = created();
    s = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, hope: true } : p)) };
    expect(refuse(s, { type: "die" }, P(0))).toMatch(/after a roll of yours that failed/);
    s = act(s, { type: "roll" }, P(0), dice(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2));
    s = act(s, { type: "accept" }, P(0));
    s = act(s, { type: "die", hopeTo: 2 }, P(0));
    expect(s.players[0].alive).toBe(false);
    expect(s.players[2].hope).toBe(true);
  });
});
