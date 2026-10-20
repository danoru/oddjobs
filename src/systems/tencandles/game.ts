import { z } from "zod";
import { d6, leftOf, moveSeat, rightOf, seatOf, type Actor, type Applied, type GameRules, type Viewer } from "@/lib/game";
import { CANDLES, DEFAULT_SETTINGS, type TcSettings } from "./rules";

/**
 * Ten Candles at the table, as a pure reducer plus a per-viewer projection.
 * The rules it follows, and how sure we are of each, are in ./rules.ts.
 *
 * Seats go clockwise from the GM's left: seat 0 is on the GM's left, the
 * last seat on the GM's right. A player's left neighbour is the next seat.
 */

// ---- State ---------------------------------------------------------------------

export const STEPS = ["traits", "module", "concept", "moment", "brink", "stack", "record"] as const;
export type Step = (typeof STEPS)[number];
export type Phase = "lobby" | "creation" | "truths" | "scene" | "ended";
export type CardKind = "virtue" | "vice" | "moment" | "brink";
export type TraitKind = Exclude<CardKind, "brink">;

export interface Card {
  id: number;
  kind: CardKind;
  text: string;
  /** Seat that wrote it, or the GM. */
  author: number | "gm";
  /** Seat whose stack it's in, or "them" for the Brink written about Them. */
  owner: number | "them";
  burned: boolean;
}

export interface Player {
  playerId: string;
  name: string;
  characterId: string | null;
  concept: { name: string; look: string; concept: string } | null;
  /** Top to bottom; the Brink always sits under these. */
  order: TraitKind[] | null;
  hope: boolean;
  alive: boolean;
  /** What they left for the end: a voice recording or a written message. */
  recorded: "audio" | "text" | null;
  /** Creation steps this player has done. */
  done: Step[];
}

export interface Roll {
  id: number;
  scene: number;
  seat: number;
  /** Living the Moment. */
  moment: boolean;
  dice: number[];
  hope: number | null;
  gmDice: number[];
  /** Rerolls taken: burning the top trait, or embracing the Brink. */
  used: ("burn" | "brink")[];
  resolved: null | {
    success: boolean;
    sixes: number;
    gmSixes: number;
    narrator: "player" | "gm";
    /** Dice set aside for the scene. */
    ones: number;
    seized: boolean;
    /** The character died (Last Stand failure, or their player chose it). */
    died: boolean;
    /** A candle went dark because of this roll. */
    darkened: boolean;
  };
}

export interface Truth {
  by: number | "gm";
  text: string;
}

export interface TcState {
  v: 1;
  phase: Phase;
  step: Step | null;
  settings: TcSettings;
  players: Player[];
  cards: Card[];
  nextId: number;
  candles: boolean[];
  scene: number;
  lastStand: boolean;
  /** Player dice set aside this scene. */
  lost: number;
  /** Extra GM dice this scene (only with the "1s go to the GM" setting). */
  gmBonus: number;
  /** The truths ritual in progress. */
  truths: { scene: number; starter: number | "gm"; needed: number; entries: Truth[] } | null;
  /** Truths stated so far, by scene. */
  stated: { scene: number; entries: Truth[] }[];
  roll: Roll | null;
  /** Resolved rolls, newest last (the last 30). */
  log: Roll[];
  /** Seat whose failure darkened the last candle (starts the next truths). */
  active: number | null;
  /** When each candle was lit (server ms), and how long it burns (ms); null while dark or when candles don't burn. */
  litAt: (number | null)[];
  life: (number | null)[];
  /** A draft making a candle sputter, waiting for the GM to say whether it goes out. */
  draft: { index: number; at: number } | null;
  /** The last candle put out by something other than a roll: the GM's hand, burning down, or a draft. `n` counts them. */
  lastOut: { index: number; cause: OutCause; n: number } | null;
}

export type OutCause = "hand" | "burnout" | "draft";

export function initialState(): TcState {
  return {
    v: 1,
    phase: "lobby",
    step: null,
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    cards: [],
    nextId: 1,
    candles: Array.from({ length: CANDLES }, () => false),
    scene: 0,
    lastStand: false,
    lost: 0,
    gmBonus: 0,
    truths: null,
    stated: [],
    roll: null,
    log: [],
    active: null,
    litAt: Array.from({ length: CANDLES }, () => null),
    life: Array.from({ length: CANDLES }, () => null),
    draft: null,
    lastOut: null,
  };
}

/** A game saved before candles burned (or settings were added) gets the missing fields. */
export function normalize(s: TcState): TcState {
  const blank = () => Array.from({ length: CANDLES }, () => null);
  return {
    ...s,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    litAt: s.litAt ?? blank(),
    life: s.life ?? blank(),
    draft: s.draft ?? null,
    lastOut: s.lastOut ?? null,
  };
}

/** How long a candle lit now will burn, in ms, or null when candles don't burn at this table. */
export function burnTime(settings: Pick<TcSettings, "burnMin" | "burnMax">, rng: () => number): number | null {
  if (!settings.burnMin || settings.burnMin <= 0) return null;
  const hi = Math.max(settings.burnMin, settings.burnMax);
  return Math.round((settings.burnMin + rng() * (hi - settings.burnMin)) * 60_000);
}

/** When a lit candle will go out on its own (server ms), or null. */
export const burnsOutAt = (s: Pick<TcState, "litAt" | "life">, i: number) => {
  const at = s.litAt[i];
  const life = s.life[i];
  return at === null || at === undefined || life === null || life === undefined ? null : at + life;
};

/** Candles that have burned all the way down by `now`. */
export const spent = (s: Pick<TcState, "candles" | "litAt" | "life">, now: number) =>
  s.candles.map((on, i) => (on && (burnsOutAt(s, i) ?? Infinity) <= now ? i : -1)).filter((i) => i >= 0);

// ---- Derived -------------------------------------------------------------------

export const litCount = (s: Pick<TcState, "candles">) => s.candles.filter(Boolean).length;
export const darkCount = (s: Pick<TcState, "candles">) => CANDLES - litCount(s);
export const playerPool = (s: TcState) => Math.max(0, litCount(s) - s.lost);
export const gmPool = (s: TcState) => darkCount(s) + (s.settings.onesToGm ? s.gmBonus : 0);

/** A seat's cards, top first: its traits in the chosen order, then its Brink. */
export function stackOf(s: Pick<TcState, "cards" | "players">, seat: number): Card[] {
  const p = s.players[seat];
  const mine = s.cards.filter((c) => c.owner === seat);
  const order = p?.order ?? ["virtue", "vice", "moment"];
  const traits = order.map((k) => mine.find((c) => c.kind === k)).filter((c): c is Card => Boolean(c));
  const brink = mine.find((c) => c.kind === "brink");
  return brink ? [...traits, brink] : traits;
}

/** The card on top: the first one not burned. */
export const topCard = (s: Pick<TcState, "cards" | "players">, seat: number) =>
  stackOf(s, seat).find((c) => !c.burned) ?? null;

/** Who writes whose cards, from the seat order and settings. */
export function recipients(n: number, settings: Pick<TcSettings, "virtueTo">) {
  const virtue = (i: number) => (settings.virtueTo === "right" ? rightOf(i, n) : leftOf(i, n));
  const vice = (i: number) => (settings.virtueTo === "right" ? leftOf(i, n) : rightOf(i, n));
  /** The last seat (on the GM's right) writes for Them; everyone else for their left. */
  const brink = (i: number): number | "them" => (i === n - 1 ? "them" : i + 1);
  return { virtue, vice, brink };
}

/** Speakers for a round of truths: living players clockwise, then the GM, starting from `starter`. */
export function truthRing(s: TcState, starter: number | "gm"): (number | "gm")[] {
  const ring: (number | "gm")[] = [...s.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0), "gm"];
  const at = ring.indexOf(starter);
  return at < 0 ? ring : [...ring.slice(at), ...ring.slice(0, at)];
}

/** Whose turn it is to state a truth, or null once enough are stated. */
export function truthSpeaker(s: TcState): number | "gm" | null {
  const t = s.truths;
  if (!t || t.entries.length >= t.needed) return null;
  const ring = truthRing(s, t.starter);
  return ring[t.entries.length % ring.length];
}

/** Who still owes something for the current creation step. */
export function waitingOn(s: TcState): number[] {
  if (s.phase !== "creation" || !s.step || s.step === "module") return [];
  return s.players.map((p, i) => (p.done.includes(s.step!) ? -1 : i)).filter((i) => i >= 0);
}

// ---- Actions -------------------------------------------------------------------

const text = (max: number) => z.string().trim().min(1).max(max);
const seat = z.number().int().min(0).max(7);

export const tcAction = z.discriminatedUnion("type", [
  // Seats
  z.object({ type: z.literal("sit"), name: text(40), characterId: z.string().regex(/^[a-z0-9-]+$/).max(80).nullable().optional() }),
  z.object({ type: z.literal("stand") }),
  z.object({ type: z.literal("move"), from: seat, to: seat }),
  z.object({ type: z.literal("unseat"), seat }),
  z.object({
    type: z.literal("settings"),
    patch: z
      .object({
        virtueTo: z.enum(["right", "left"]),
        onesToGm: z.boolean(),
        truthStarter: z.enum(["active", "gmLeft"]),
        brinkWhen: z.enum(["any", "failed"]),
        playback: z.enum(["end", "onDeath"]),
        firstSceneTruths: z.boolean(),
        keepRecordings: z.boolean(),
        burnMin: z.number().int().min(0).max(600),
        burnMax: z.number().int().min(0).max(600),
        draftsPerHour: z.number().min(0).max(6),
      })
      .partial(),
  }),
  // Creation
  z.object({ type: z.literal("begin") }),
  /** GM: move to the next creation step. `force` skips anyone who hasn't finished. */
  z.object({ type: z.literal("next"), force: z.boolean().optional() }),
  z.object({ type: z.literal("traits"), virtue: text(140), vice: text(140) }),
  z.object({ type: z.literal("concept"), name: text(40), look: text(200), concept: text(300) }),
  z.object({ type: z.literal("moment"), text: text(200) }),
  z.object({ type: z.literal("brink"), text: text(200), for: z.union([seat, z.literal("gm")]).optional() }),
  z.object({ type: z.literal("order"), order: z.array(z.enum(["virtue", "vice", "moment"])).length(3) }),
  z.object({ type: z.literal("recorded"), kind: z.enum(["audio", "text"]).nullable() }),
  // Play
  z.object({ type: z.literal("candle"), index: z.number().int().min(0).max(CANDLES - 1), lit: z.boolean() }),
  /** GM's page: a candle has burned all the way down. */
  z.object({ type: z.literal("burnout"), index: z.number().int().min(0).max(CANDLES - 1) }),
  /** GM's page: a draft stirs the candles (the server picks which one sputters). */
  z.object({ type: z.literal("draft") }),
  /** The GM decides: does the sputtering candle go out? */
  z.object({ type: z.literal("draftSettle"), out: z.boolean() }),
  z.object({ type: z.literal("roll"), moment: z.boolean().optional(), seat: seat.optional() }),
  z.object({ type: z.literal("burn") }),
  z.object({ type: z.literal("embrace") }),
  z.object({ type: z.literal("accept") }),
  z.object({ type: z.literal("seize") }),
  z.object({ type: z.literal("die"), hopeTo: seat.optional(), seat: seat.optional() }),
  z.object({ type: z.literal("truth"), text: text(160) }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("reset") }),
]);
export type TcAction = z.infer<typeof tcAction>;

const MAX_SEATS = 6;

const fail = (error: string): Applied<TcState> => ({ ok: false, error });
const ok = (state: TcState): Applied<TcState> => ({ ok: true, state });

/** Light the first `n` dark candles, left to right. */
function light(candles: boolean[], n: number): boolean[] {
  const out = [...candles];
  for (let i = 0; i < out.length && n > 0; i++)
    if (!out[i]) {
      out[i] = true;
      n--;
    }
  return out;
}

/** Darken the last lit candle (the ones burn down from the right). */
function darken(candles: boolean[]): boolean[] {
  const out = [...candles];
  const i = out.lastIndexOf(true);
  if (i >= 0) out[i] = false;
  return out;
}

/** Candles lit as each creation step ends, as the game's creation lights them. */
const LIGHT_AFTER: Partial<Record<Step, number>> = { traits: 3, moment: 3, brink: 3, stack: 1 };

/** A scene ends: the next one starts with truths (or the game ends in the dark). */
function endScene(s: TcState, active: number | null): TcState {
  const lit = litCount(s);
  const next: TcState = { ...s, roll: null, active };
  if (lit === 0 || next.players.every((p) => !p.alive)) return { ...next, phase: "ended", truths: null };
  return startTruths(next, s.scene + 1);
}

function startTruths(s: TcState, scene: number): TcState {
  const lit = litCount(s);
  const starter: number | "gm" =
    s.settings.truthStarter === "active" && s.active !== null && s.players[s.active]?.alive
      ? s.active
      : s.players.findIndex((p) => p.alive) >= 0
        ? s.players.findIndex((p) => p.alive)
        : "gm";
  return { ...s, phase: "truths", truths: { scene, starter, needed: Math.max(0, lit - 1), entries: [] } };
}

function startScene(s: TcState, scene: number): TcState {
  return { ...s, phase: "scene", scene, lost: 0, gmBonus: 0, truths: null, roll: null, lastStand: litCount(s) === 1 };
}

function rollDice(n: number, rng: () => number) {
  return Array.from({ length: n }, () => d6(rng));
}

/** Score a roll as it stands. */
export function score(r: Pick<Roll, "dice" | "hope" | "gmDice">) {
  const sixes = r.dice.filter((d) => d === 6).length;
  const hopeWins = r.hope !== null && r.hope >= 5;
  const success = sixes > 0 || hopeWins;
  const tellingSixes = sixes + (r.hope === 6 ? 1 : 0);
  const gmSixes = r.gmDice.filter((d) => d === 6).length;
  return { sixes, success, tellingSixes, gmSixes, ones: r.dice.filter((d) => d === 1).length };
}

function resolve(s: TcState, r: Roll): TcState {
  const sc = score(r);
  const players = s.players.map((p) => ({ ...p }));
  let cards = s.cards;
  const burn = (id: number) => (cards = cards.map((c) => (c.id === id ? { ...c, burned: true } : c)));
  const me = players[r.seat];

  // Living the Moment: success brings Hope; the card burns either way.
  if (r.moment) {
    const top = topCard(s, r.seat);
    if (top?.kind === "moment") burn(top.id);
    if (sc.success) me.hope = true;
  }
  // A Brink that fails you burns, and takes your Hope with it.
  if (r.used.includes("brink") && !sc.success) {
    const brink = s.cards.find((c) => c.owner === r.seat && c.kind === "brink");
    if (brink) burn(brink.id);
    me.hope = false;
  }

  const died = !sc.success && s.lastStand;
  if (died) {
    me.alive = false;
    me.hope = false;
  }
  const darkened = !sc.success && !s.lastStand;
  const done: Roll = {
    ...r,
    resolved: {
      success: sc.success,
      sixes: sc.sixes,
      gmSixes: sc.gmSixes,
      narrator: sc.success && sc.tellingSixes > sc.gmSixes ? "player" : "gm",
      ones: sc.ones,
      seized: false,
      died,
      darkened,
    },
  };
  let next: TcState = {
    ...s,
    players,
    cards,
    lost: s.lost + sc.ones,
    gmBonus: s.gmBonus + sc.ones,
    roll: null,
    log: [...s.log, done].slice(-30),
  };
  if (darkened) next = endScene({ ...next, candles: darken(next.candles) }, r.seat);
  else if (died && next.players.every((p) => !p.alive)) next = { ...next, phase: "ended", candles: next.candles.map(() => false) };
  return next;
}

/**
 * A candle going out during play, whatever put it out (a roll aside): during
 * truths the round just gets shorter (one truth per lit candle); in a scene,
 * the scene ends.
 */
function putOut(s: TcState, index: number, cause: OutCause): TcState {
  if (!s.candles[index]) return s;
  const candles = s.candles.map((c, i) => (i === index ? false : c));
  const lastOut = { index, cause, n: (s.lastOut?.n ?? 0) + 1 };
  const next = { ...s, candles, lastOut };
  if (next.phase === "truths" && next.truths) {
    if (!candles.some(Boolean)) return { ...next, phase: "ended", truths: null };
    return { ...next, truths: { ...next.truths, needed: Math.min(next.truths.needed, litCount({ candles }) - 1) } };
  }
  if (next.phase !== "scene") return next;
  return endScene(next, s.active);
}

/**
 * Apply an action, then keep the candles' burn times in step with which are
 * lit: a candle that lights gets its burn time, one that goes dark loses it,
 * and a draft over a candle that's gone (or outside play) blows over.
 */
export function applyTc(s0: TcState, a: TcAction, actor: Actor, rng: () => number, now = 0): Applied<TcState> {
  const s = normalize(s0);
  const r = applyRules(s, a, actor, rng, now);
  if (!r.ok) return r;
  const next = r.state;
  const litAt = next.candles.map((on, i) => (on ? (s.candles[i] ? s.litAt[i] : now) : null));
  const life = next.candles.map((on, i) => (on ? (s.candles[i] ? s.life[i] : burnTime(next.settings, rng)) : null));
  const playing = next.phase === "scene" || next.phase === "truths";
  const draft = next.draft && playing && next.candles[next.draft.index] ? next.draft : null;
  return { ok: true, state: { ...next, litAt, life, draft } };
}

function applyRules(s: TcState, a: TcAction, actor: Actor, rng: () => number, now: number): Applied<TcState> {
  const gm = actor.role === "gm";
  const me = actor.role === "player" ? seatOf(s.players, actor.playerId) : -1;
  const seated = me >= 0;
  const n = s.players.length;
  const setPlayer = (i: number, patch: Partial<Player>): Player[] =>
    s.players.map((p, j) => (j === i ? { ...p, ...patch } : p));
  const markDone = (i: number, step: Step) => (s.players[i].done.includes(step) ? s.players[i].done : [...s.players[i].done, step]);
  const inStep = (step: Step) => s.phase === "creation" && s.step === step;

  switch (a.type) {
    // ---- Seats ----
    case "sit": {
      if (actor.role !== "player") return fail("The GM doesn't take a seat");
      if (seated) return ok({ ...s, players: setPlayer(me, { name: a.name, characterId: a.characterId ?? s.players[me].characterId }) });
      if (s.phase !== "lobby") return fail("The game has started; ask the GM to deal you in next time");
      if (n >= MAX_SEATS) return fail("The table is full");
      const p: Player = {
        playerId: actor.playerId,
        name: a.name,
        characterId: a.characterId ?? null,
        concept: null,
        order: null,
        hope: false,
        alive: true,
        recorded: null,
        done: [],
      };
      return ok({ ...s, players: [...s.players, p] });
    }
    case "stand":
      if (!seated) return ok(s);
      if (s.phase !== "lobby") return fail("You can't leave the circle once it's started");
      return ok({ ...s, players: s.players.filter((_, i) => i !== me) });
    case "move":
      if (!gm) return fail("Only the GM rearranges the seats");
      if (s.phase !== "lobby") return fail("Seats are fixed once creation starts");
      return ok({ ...s, players: moveSeat(s.players, a.from, a.to) });
    case "unseat":
      if (!gm) return fail("Only the GM can unseat a player");
      if (s.phase !== "lobby") return fail("Seats are fixed once creation starts");
      return ok({ ...s, players: s.players.filter((_, i) => i !== a.seat) });
    case "settings":
      if (!gm) return fail("Only the GM changes the table's rules");
      if (s.phase !== "lobby" && ("virtueTo" in a.patch || "firstSceneTruths" in a.patch))
        return fail("That setting is fixed once creation starts");
      return ok({ ...s, settings: { ...s.settings, ...a.patch } });

    // ---- Creation ----
    case "begin":
      if (!gm) return fail("The GM starts the game");
      if (s.phase !== "lobby") return fail("Already started");
      if (n < 1) return fail("Nobody is seated yet");
      return ok({ ...s, phase: "creation", step: "traits", candles: Array.from({ length: CANDLES }, () => false) });
    case "next": {
      if (!gm) return fail("The GM moves the table on");
      if (s.phase !== "creation" || !s.step) return fail("Not making characters right now");
      const waiting = waitingOn(s);
      if (waiting.length && !a.force) return fail(`Still waiting on ${waiting.map((i) => s.players[i].name).join(", ")}`);
      if (s.step === "brink" && !s.cards.some((c) => c.kind === "brink" && c.author === "gm"))
        return fail("Write your Brink for the player on your left first");
      const lit = light(s.candles, LIGHT_AFTER[s.step] ?? 0);
      const i = STEPS.indexOf(s.step);
      if (i === STEPS.length - 1) {
        const started = { ...s, candles: lit, step: null };
        return ok(started.settings.firstSceneTruths ? startTruths(started, 1) : startScene(started, 1));
      }
      return ok({ ...s, candles: lit, step: STEPS[i + 1] });
    }
    case "traits": {
      if (!seated) return fail("Take a seat first");
      if (!inStep("traits")) return fail("It isn't time to write traits");
      const to = recipients(n, s.settings);
      const others = s.cards.filter((c) => !(c.author === me && (c.kind === "virtue" || c.kind === "vice")));
      const id = s.nextId;
      const cards: Card[] = [
        ...others,
        { id, kind: "virtue", text: a.virtue, author: me, owner: to.virtue(me), burned: false },
        { id: id + 1, kind: "vice", text: a.vice, author: me, owner: to.vice(me), burned: false },
      ];
      return ok({ ...s, cards, nextId: id + 2, players: setPlayer(me, { done: markDone(me, "traits") }) });
    }
    case "concept":
      if (!seated) return fail("Take a seat first");
      if (!inStep("concept")) return fail("It isn't time for concepts");
      return ok({
        ...s,
        players: setPlayer(me, { concept: { name: a.name, look: a.look, concept: a.concept }, done: markDone(me, "concept") }),
      });
    case "moment": {
      if (!seated) return fail("Take a seat first");
      if (!inStep("moment")) return fail("It isn't time for moments");
      const others = s.cards.filter((c) => !(c.author === me && c.kind === "moment"));
      const card: Card = { id: s.nextId, kind: "moment", text: a.text, author: me, owner: me, burned: false };
      return ok({ ...s, cards: [...others, card], nextId: s.nextId + 1, players: setPlayer(me, { done: markDone(me, "moment") }) });
    }
    case "brink": {
      if (!inStep("brink")) return fail("It isn't time for brinks");
      if (gm) {
        if (n < 1) return fail("Nobody to write for");
        const others = s.cards.filter((c) => !(c.author === "gm" && c.kind === "brink"));
        const card: Card = { id: s.nextId, kind: "brink", text: a.text, author: "gm", owner: 0, burned: false };
        return ok({ ...s, cards: [...others, card], nextId: s.nextId + 1 });
      }
      if (!seated) return fail("Take a seat first");
      const owner = recipients(n, s.settings).brink(me);
      const others = s.cards.filter((c) => !(c.author === me && c.kind === "brink"));
      const card: Card = { id: s.nextId, kind: "brink", text: a.text, author: me, owner, burned: false };
      return ok({ ...s, cards: [...others, card], nextId: s.nextId + 1, players: setPlayer(me, { done: markDone(me, "brink") }) });
    }
    case "order":
      if (!seated) return fail("Take a seat first");
      if (!inStep("stack")) return fail("It isn't time to stack your cards");
      if (new Set(a.order).size !== 3) return fail("Stack each of Virtue, Vice and Moment once");
      return ok({ ...s, players: setPlayer(me, { order: a.order, done: markDone(me, "stack") }) });
    case "recorded":
      if (!seated) return fail("Take a seat first");
      if (s.phase === "ended") return fail("It's over");
      return ok({
        ...s,
        players: setPlayer(me, {
          recorded: a.kind,
          done: a.kind ? markDone(me, "record") : s.players[me].done.filter((d) => d !== "record"),
        }),
      });

    // ---- Play ----
    case "candle": {
      if (!gm) return fail("Only the GM tends the candles");
      if (s.phase === "creation" || s.phase === "lobby") {
        const candles = s.candles.map((c, i) => (i === a.index ? a.lit : c));
        return ok({ ...s, candles });
      }
      if (a.lit) return ok({ ...s, candles: s.candles.map((c, i) => (i === a.index ? true : c)) }); // a correction
      // A candle going out, on its own or by the GM's hand, ends the scene.
      return ok(putOut(s, a.index, "hand"));
    }
    case "burnout": {
      if (!gm) return fail("Only the GM's page tends the candles");
      if (!s.candles[a.index]) return ok(s);
      const at = burnsOutAt(s, a.index);
      // A minute's grace for clocks that disagree.
      if (at === null || now < at - 60_000) return fail("That candle hasn't burned down yet");
      return ok(putOut(s, a.index, "burnout"));
    }
    case "draft": {
      if (!gm) return fail("Only the GM's page feels the drafts");
      if (s.phase !== "scene" && s.phase !== "truths") return fail("No draft between scenes");
      if (s.draft) return fail("A candle is already sputtering");
      const lit = s.candles.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
      if (!lit.length) return fail("No candle left to sputter");
      return ok({ ...s, draft: { index: lit[Math.floor(rng() * lit.length)], at: now } });
    }
    case "draftSettle": {
      if (!gm) return fail("Only the GM decides");
      if (!s.draft) return fail("No candle is sputtering");
      const index = s.draft.index;
      const cleared = { ...s, draft: null };
      return ok(a.out ? putOut(cleared, index, "draft") : cleared);
    }
    case "roll": {
      if (s.phase !== "scene") return fail("No scene is running");
      if (s.roll) return fail("Finish the roll on the table first");
      const who = gm ? (a.seat ?? -1) : me;
      if (who < 0 || who >= n) return fail(gm ? "Roll for which seat?" : "Take a seat first");
      const p = s.players[who];
      if (!p.alive) return fail("The dead don't roll");
      if (a.moment && topCard(s, who)?.kind !== "moment") return fail("Your Moment isn't on top of your stack");
      const dice = rollDice(playerPool(s), rng);
      const roll: Roll = {
        id: (s.log.at(-1)?.id ?? 0) + 1,
        scene: s.scene,
        seat: who,
        moment: Boolean(a.moment),
        dice,
        hope: p.hope ? d6(rng) : null,
        gmDice: rollDice(gmPool(s), rng),
        used: [],
        resolved: null,
      };
      return ok({ ...s, roll });
    }
    case "burn": {
      const r = s.roll;
      if (!r) return fail("No roll to burn for");
      if (!gm && me !== r.seat) return fail("Only the player rolling can burn their trait");
      const top = topCard(s, r.seat);
      if (!top || (top.kind !== "virtue" && top.kind !== "vice")) return fail("The top card isn't a Virtue or Vice");
      if (r.moment) return fail("This roll is for your Moment");
      const dice = r.dice.map((d) => (d === 1 ? d6(rng) : d));
      return ok({
        ...s,
        cards: s.cards.map((c) => (c.id === top.id ? { ...c, burned: true } : c)),
        roll: { ...r, dice, used: [...r.used, "burn"] },
      });
    }
    case "embrace": {
      const r = s.roll;
      if (!r) return fail("No roll to embrace your Brink for");
      if (!gm && me !== r.seat) return fail("Only the player rolling can embrace their Brink");
      if (topCard(s, r.seat)?.kind !== "brink") return fail("Your Brink isn't on top yet");
      if (r.used.includes("brink")) return fail("Already embraced on this roll");
      if (s.settings.brinkWhen === "failed" && score(r).success) return fail("At this table a Brink is only for a roll that failed");
      return ok({
        ...s,
        roll: { ...r, dice: rollDice(r.dice.length, rng), hope: r.hope === null ? null : d6(rng), used: [...r.used, "brink"] },
      });
    }
    case "accept": {
      const r = s.roll;
      if (!r) return fail("No roll to settle");
      if (!gm && me !== r.seat) return fail("Only the player rolling, or the GM, settles the roll");
      return ok(resolve(s, r));
    }
    case "seize": {
      const last = s.log.at(-1);
      if (s.phase !== "scene" || !last?.resolved || last.scene !== s.scene) return fail("Nothing to seize");
      if (!gm && me !== last.seat) return fail("Only the player who rolled can seize the telling");
      if (!last.resolved.success || last.resolved.narrator !== "gm" || last.resolved.seized) return fail("The GM isn't telling this one");
      if (s.lastStand) return fail("There's no candle to spare");
      const seizedRoll: Roll = { ...last, resolved: { ...last.resolved, narrator: "player", seized: true, darkened: true } };
      const next = { ...s, log: [...s.log.slice(0, -1), seizedRoll], candles: darken(s.candles) };
      return ok(endScene(next, last.seat));
    }
    case "die": {
      const who = gm ? (a.seat ?? -1) : me;
      if (who < 0 || who >= n) return fail(gm ? "Which seat?" : "Take a seat first");
      if (s.phase !== "scene" && s.phase !== "truths") return fail("Not now");
      const p = s.players[who];
      if (!p.alive) return fail("Already gone");
      const last = s.log.at(-1);
      if (!gm && !(last?.resolved && !last.resolved.success && last.seat === who && last.scene >= s.scene - 1))
        return fail("You can choose to die after a roll of yours that failed");
      let players = setPlayer(who, { alive: false, hope: false });
      if (a.hopeTo !== undefined && p.hope && a.hopeTo !== who && players[a.hopeTo]?.alive)
        players = players.map((x, i) => (i === a.hopeTo ? { ...x, hope: true } : x));
      const log = last?.resolved && last.seat === who ? [...s.log.slice(0, -1), { ...last, resolved: { ...last.resolved, died: true } }] : s.log;
      const next = { ...s, players, log };
      return ok(
        players.every((x) => !x.alive) ? { ...next, phase: "ended", truths: null, roll: null, candles: s.candles.map(() => false) } : next,
      );
    }
    case "truth": {
      if (s.phase !== "truths" || !s.truths) return fail("It isn't time for truths");
      const speaker = truthSpeaker(s);
      if (speaker === null) return fail("Enough truths: now say it together");
      if (!gm && speaker !== me) return fail("It isn't your turn to state a truth");
      const entry: Truth = { by: speaker, text: a.text };
      return ok({ ...s, truths: { ...s.truths, entries: [...s.truths.entries, entry] } });
    }
    case "close": {
      if (s.phase !== "truths" || !s.truths) return fail("It isn't time for truths");
      if (truthSpeaker(s) !== null) return fail("Not every truth has been stated yet");
      if (!gm && !seated) return fail("Take a seat first");
      const stated = [...s.stated, { scene: s.truths.scene, entries: s.truths.entries }];
      return ok(startScene({ ...s, stated }, s.truths.scene));
    }
    case "end":
      if (!gm) return fail("Only the GM ends the game");
      return ok({
        ...s,
        phase: "ended",
        roll: null,
        truths: null,
        candles: s.candles.map(() => false),
        players: s.players.map((p) => ({ ...p, alive: false, hope: false })),
      });
    case "reset":
      if (!gm) return fail("Only the GM starts over");
      return ok({ ...initialState(), settings: s.settings, players: s.players.map((p) => ({ ...p, concept: null, order: null, hope: false, alive: true, recorded: null, done: [] })) });
  }
}

// ---- What each viewer sees ------------------------------------------------------

export interface CardView {
  id: number;
  kind: CardKind;
  text: string;
  author: number | "gm";
  owner: number | "them";
  burned: boolean;
}

export interface SeatView {
  index: number;
  name: string;
  characterId: string | null;
  concept: Player["concept"];
  alive: boolean;
  hope: boolean;
  recorded: boolean;
  /** Creation steps done (so everyone can see who we're waiting on). */
  done: Step[];
  /** Cards left in the stack, and what kind is on top (the face is public; its text only to those allowed). */
  left: number;
  top: CardKind | null;
  /** The stack order, top first: only for your own seat (and the GM). */
  order: TraitKind[] | null;
}

export interface TcView {
  phase: Phase;
  step: Step | null;
  settings: TcSettings;
  candles: boolean[];
  scene: number;
  lastStand: boolean;
  pools: { players: number; gm: number; lost: number };
  seats: SeatView[];
  /** Your seat, if you're seated. */
  you: number | null;
  /** Every card you may read: your own stack, cards you wrote, burned cards, and (GM) all. */
  cards: CardView[];
  truths: (NonNullable<TcState["truths"]> & { speaker: number | "gm" | null }) | null;
  stated: TcState["stated"];
  roll: Roll | null;
  log: Roll[];
  waiting: number[];
  /** Which seats' final words may be heard by this viewer now. */
  heard: number[];
  /** When each lit candle goes out on its own (server ms), or null; and how long it was given to burn (ms). */
  burnsOut: (number | null)[];
  burnLife: (number | null)[];
  /** A candle sputtering in a draft, waiting on the GM. */
  draft: TcState["draft"];
}

/** May this viewer read this card? The GM always; anyone once it burns; else only its owner and its writer. */
export function canRead(card: Card, viewer: Viewer, you: number | null): boolean {
  if (viewer.role === "gm") return true;
  if (card.burned) return true;
  if (you === null) return false;
  return card.owner === you || card.author === you;
}

/** Whose recordings this viewer may hear: their own, the GM all of them, everyone when the rules say so. */
export function audible(s: TcState, viewer: Viewer, you: number | null): number[] {
  return s.players
    .map((p, i) => i)
    .filter((i) => {
      if (viewer.role === "gm" || i === you) return true;
      if (s.phase === "ended") return true;
      return s.settings.playback === "onDeath" && !s.players[i].alive;
    });
}

export function viewTc(s0: TcState, viewer: Viewer): TcView {
  const s = normalize(s0);
  const you = viewer.role === "player" ? seatOf(s.players, viewer.playerId) : -1;
  const y = you >= 0 ? you : null;
  const seats: SeatView[] = s.players.map((p, i) => {
    const stack = stackOf(s, i);
    const top = stack.find((c) => !c.burned) ?? null;
    return {
      index: i,
      name: p.name,
      characterId: p.characterId,
      concept: p.concept,
      alive: p.alive,
      hope: p.hope,
      recorded: p.recorded !== null,
      done: p.done,
      left: s.phase === "creation" && s.step !== "record" ? 0 : stack.filter((c) => !c.burned).length,
      top: s.phase === "creation" && s.step !== "record" ? null : (top?.kind ?? null),
      order: viewer.role === "gm" || i === y ? p.order : null,
    };
  });
  const cards: CardView[] = s.cards
    .filter((c) => canRead(c, viewer, y))
    .map((c) => ({ ...c }));
  return {
    phase: s.phase,
    step: s.step,
    settings: s.settings,
    candles: s.candles,
    scene: s.scene,
    lastStand: s.lastStand,
    pools: { players: playerPool(s), gm: gmPool(s), lost: s.lost },
    seats,
    you: y,
    cards,
    truths: s.truths ? { ...s.truths, speaker: truthSpeaker(s) } : null,
    stated: s.stated,
    roll: s.roll,
    log: s.log,
    waiting: waitingOn(s),
    heard: audible(s, viewer, y),
    burnsOut: s.candles.map((_, i) => burnsOutAt(s, i)),
    burnLife: s.candles.map((on, i) => (on ? s.life[i] : null)),
    draft: s.draft,
  };
}

export const tenCandlesGame: GameRules<TcState, TcAction, TcView> = {
  init: initialState,
  action: tcAction,
  apply: applyTc,
  view: viewTc,
};
