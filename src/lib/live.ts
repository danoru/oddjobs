import { z } from "zod";
import type { Viewer } from "./game";
import { SOUND_STINGERS, type Act, type NoticeKind, type Rumor, type RumorTruth } from "./coreSchema";
import { NOTICE_KINDS } from "./coreSchema";
import type { CoinMeta, DiceKind } from "@/systems/registry";
import { foldTallies, rollDuality, rollTallies, type DualityData, type SheetLimits, type TallyData } from "@/systems/daggerheart/live";

/**
 * The table's event log: everything that happens at a table outside a
 * system's own game state. Dice rolls, notes passed under the table, the
 * GM's bell, act cards, spotlight ticks, rumors drawn, notices pinned to the
 * town board and inspiration coins are all rows of one append-only log
 * (`TableEvent` in Prisma), polled with a cursor.
 *
 * Like a system's game (src/lib/game.ts), it is two pure functions the API
 * wraps: `applyLive` turns an action into a new row or a refusal, and
 * `viewEvents` decides what each viewer may see. The privacy rules live in
 * the projection and are unit-tested in live.test.ts:
 *   - a note's text reaches only its sender and its recipient (not even the
 *     GM, unless it's to or from the GM); everyone else, the TV included,
 *     only sees that a note changed hands;
 *   - a hidden roll reaches only the GM and whoever rolled it;
 *   - rumors reach only the player who drew them, without the truth; the GM
 *     sees every draw with the truth;
 *   - spotlight ticks and roll-hiding are the GM's alone;
 *   - a bell for one player rings only on that player's phone;
 *   - nobody but the server ever sees a player's browser id: people are
 *     known to each other by an opaque handle.
 * Daggerheart's duality rolls and the Hope, Fear and slots they move are
 * rows here too (src/systems/daggerheart/live.ts); they're the whole table's,
 * so they're never hidden.
 */

// ---- People --------------------------------------------------------------------

/** Someone at the table: a player who tore a poster or took a seat. Server-side only (it has the browser id). */
export interface Person {
  playerId: string;
  /** Opaque, stable per table; safe to send to anyone. */
  handle: string;
  /** The name they gave the table. */
  name: string;
  characterId: string | null;
  /** The character's name, when they hold one. */
  character: string | null;
  /** When they joined the table (tore their poster), for the spotlight's clock. */
  since: string | null;
}

export type PublicPerson = Omit<Person, "playerId">;

export const toPublicPerson = ({ playerId: _, ...p }: Person): PublicPerson => p; // eslint-disable-line @typescript-eslint/no-unused-vars

/** "Rook (Dana)", or just the player's name. */
export const personLabel = (p: Pick<PublicPerson, "name" | "character">) => (p.character ? `${p.character} (${p.name})` : p.name);

// ---- Rows ----------------------------------------------------------------------

export const LIVE_KINDS = [
  "roll",
  "note",
  "bell",
  "act",
  "tick",
  "rumor",
  "notice",
  "settle",
  "unpin",
  "coin",
  "spend",
  "hide",
  "death",
  "candle",
  "tally",
] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];

/** A die as rolled. `kept: false` for the one dropped by advantage or disadvantage. */
export interface Die {
  sides: number;
  value: number;
  kept: boolean;
}

/** A d20-system roll from a phone or the GM: the dice, the modifier and the total. */
export interface RollData {
  system: "d20";
  who: string;
  characterId: string | null;
  label: string;
  formula: string;
  dice: Die[];
  mod: number;
  total: number;
  mode: RollMode;
  /** 20 or 1 on the kept d20, else null. Stored, so the tapestry needn't re-derive it. */
  nat: 20 | 1 | null;
  /** Rerolled by spending a coin. */
  reroll?: boolean;
}

/** A Ten Candles roll, mirrored from the game reducer once it's settled. */
export interface PoolRollData {
  system: "pool";
  who: string;
  characterId: string | null;
  label: string;
  dice: number[];
  gmDice: number[];
  hope: number | null;
  success: boolean;
  narrator: "player" | "gm";
  darkened: boolean;
  died: boolean;
}

export type RollMode = "normal" | "adv" | "dis";

export interface NoteData {
  fromName: string;
  toGm: boolean;
  toName: string;
  text: string;
  replyTo: number | null;
}

export interface BellData {
  preset: (typeof SOUND_STINGERS)[number];
  label: string;
}

export interface ActData extends Act {
  index: number;
  total: number;
}

export interface NoticeData {
  nid: string;
  kind: NoticeKind;
  title: string;
  text?: string;
}

/** What the server stores. `byPlayer`/`toPlayer` are browser ids and never leave it. */
export interface LiveRow {
  id: number;
  kind: LiveKind;
  byPlayer: string | null;
  toPlayer: string | null;
  hidden: boolean;
  data: unknown;
  createdAt: string;
}

export type NewRow = Omit<LiveRow, "id" | "createdAt">;

// ---- Actions -------------------------------------------------------------------

const handle = z.string().regex(/^[a-z0-9]{6,32}$/);
const kebab = z.string().regex(/^[a-z0-9-]+$/).max(80);
const label = z.string().trim().min(1).max(60);

export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export const liveAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roll"),
    label,
    count: z.number().int().min(1).max(20),
    sides: z.number().int().refine((n) => (DIE_SIDES as readonly number[]).includes(n), "not a die we roll"),
    mod: z.number().int().min(-20).max(30),
    mode: z.enum(["normal", "adv", "dis"]).default("normal"),
    /** GM only: a roll behind the screen. */
    hidden: z.boolean().optional(),
    /** Spend a coin to reroll (the player's own). */
    reroll: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("note"),
    to: z.union([handle, z.literal("gm")]),
    text: z.string().trim().min(1).max(500),
    replyTo: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal("bell"), preset: z.enum(SOUND_STINGERS), label: label.optional(), to: handle.optional() }),
  /** Show act `index` on the TV, or bring the curtain up on the board again (`null`). */
  z.object({ type: z.literal("act"), index: z.number().int().min(0).max(40).nullable() }),
  z.object({ type: z.literal("tick"), to: handle, beat: kebab, on: z.boolean() }),
  z.object({ type: z.literal("rumors") }),
  z.object({
    type: z.literal("notice"),
    preset: kebab.optional(),
    kind: z.enum(NOTICE_KINDS).optional(),
    title: label.optional(),
    text: z.string().trim().max(240).optional(),
  }),
  z.object({ type: z.literal("settle"), nid: kebab }),
  z.object({ type: z.literal("unpin"), nid: kebab }),
  z.object({ type: z.literal("coin"), to: handle }),
  z.object({ type: z.literal("spend"), who: handle.optional() }),
  z.object({ type: z.literal("hide"), roll: z.number().int().positive(), hidden: z.boolean() }),
  /** Daggerheart: roll the Hope and Fear dice from your sheet. `mod` is the trait; Experiences are looked up on your sheet and cost a Hope each. */
  z.object({
    type: z.literal("duality"),
    label,
    mod: z.number().int().min(-10).max(20),
    adv: z.union([z.literal(-1), z.literal(0), z.literal(1)]).default(0),
    experiences: z.array(z.string().trim().min(1).max(40)).max(3).default([]),
    reaction: z.boolean().default(false),
    difficulty: z.number().int().min(1).max(40).optional(),
  }),
  /** Daggerheart: change your own Hope or marked Stress, Hit Points or Armor Slots (the GM: anyone's, by `to`). */
  z.object({
    type: z.literal("mark"),
    track: z.enum(["hope", "stress", "hp", "armor"]),
    delta: z.number().int().min(-12).max(12).refine((n) => n !== 0, "no change"),
    to: handle.optional(),
  }),
  /** Daggerheart: the GM gains or spends Fear. */
  z.object({
    type: z.literal("fear"),
    delta: z.number().int().min(-12).max(12).refine((n) => n !== 0, "no change"),
    /** The Fear a new story opens with, one per player. */
    opening: z.boolean().optional(),
  }),
]);
export type LiveAction = z.infer<typeof liveAction>;

/** Who's acting: the GM (cookie) or a player (browser id). */
export type LiveActor = { role: "gm" } | { role: "player"; playerId: string };

export interface LiveContext {
  people: Person[];
  /** The table's log so far, oldest first. */
  rows: LiveRow[];
  acts: Act[];
  rumors: Rumor[];
  notices: { id: string; kind: NoticeKind; title: string; text?: string }[];
  coin: CoinMeta | null;
  /** Whether this system's phones roll their own dice through the log (d20 and duality systems). */
  dice: DiceKind;
  /** Daggerheart: each character's slots and Experiences, by character id. */
  sheets?: Record<string, SheetLimits>;
  rng: () => number;
}

/** One action can write more than one row: a reroll spends a coin, then rolls. */
export type LiveApplied = { ok: true; rows: NewRow[] } | { ok: false; error: string };

const fail = (error: string): LiveApplied => ({ ok: false, error });
const newRow = (kind: LiveKind, data: unknown, by: string | null, to: string | null = null, hidden = false): NewRow => ({
  kind,
  data,
  byPlayer: by,
  toPlayer: to,
  hidden,
});
const row = (...args: Parameters<typeof newRow>): LiveApplied => ({ ok: true, rows: [newRow(...args)] });

const roll1 = (sides: number, rng: () => number) => 1 + Math.floor(rng() * sides);

/** Roll dice with crypto randomness on the server. Advantage and disadvantage roll a second d20 and keep one. */
export function rollDice(count: number, sides: number, mod: number, mode: RollMode, rng: () => number) {
  const twice = sides === 20 && count === 1 && mode !== "normal";
  const values = Array.from({ length: twice ? 2 : count }, () => roll1(sides, rng));
  let dice: Die[] = values.map((value) => ({ sides, value, kept: true }));
  if (twice) {
    const keep = mode === "adv" ? Math.max(...values) : Math.min(...values);
    const at = values.indexOf(keep);
    dice = dice.map((d, i) => ({ ...d, kept: i === at }));
  }
  const kept = dice.filter((d) => d.kept);
  const total = kept.reduce((s, d) => s + d.value, 0) + mod;
  const nat = sides === 20 && count === 1 ? (kept[0].value === 20 ? 20 : kept[0].value === 1 ? 1 : null) : null;
  const formula = `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ""}${twice ? (mode === "adv" ? " adv" : " dis") : ""}`;
  return { dice, total, nat: nat as 20 | 1 | null, formula };
}

/** The act showing now: the index of the latest act card, or -1 before the first (and after the curtain comes up again it's still the last act shown). */
export function currentAct(rows: Pick<LiveRow, "kind" | "data">[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.kind === "act" && (r.data as ActData | { index: null }).index !== null) return (r.data as ActData).index;
  }
  return -1;
}

/** Coins a player holds: received, minus spent. Keyed by browser id (server) or handle (folds). */
export function coinCount(rows: Pick<LiveRow, "kind" | "byPlayer" | "toPlayer">[], playerId: string): number {
  let n = 0;
  for (const r of rows) {
    if (r.kind === "coin" && r.toPlayer === playerId) n++;
    if (r.kind === "spend" && r.toPlayer === playerId) n--;
  }
  return Math.max(0, n);
}

/** Coins a player has tossed to others since the current act began. */
export function tossedThisAct(rows: Pick<LiveRow, "kind" | "byPlayer" | "data">[], playerId: string): number {
  let since = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].kind === "act" && (rows[i].data as { index: number | null }).index !== null) {
      since = i + 1;
      break;
    }
  }
  return rows.slice(since).filter((r) => r.kind === "coin" && r.byPlayer === playerId).length;
}

/** The rumors each player drew, by browser id. */
export function rumorDraws(rows: Pick<LiveRow, "kind" | "toPlayer" | "data">[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) if (r.kind === "rumor" && r.toPlayer) out.set(r.toPlayer, (r.data as { ids: string[] }).ids);
  return out;
}

/** Notices on the board now, in the order they went up. */
export function pinnedNotices(rows: Pick<LiveRow, "kind" | "data" | "createdAt" | "id">[]) {
  const board = new Map<string, NoticeData & { settled: boolean; at: string; id: number }>();
  for (const r of rows) {
    if (r.kind === "notice") {
      const d = r.data as NoticeData;
      board.set(d.nid, { ...d, settled: d.kind === "settled", at: r.createdAt, id: r.id });
    } else if (r.kind === "settle") {
      const n = board.get((r.data as { nid: string }).nid);
      if (n) n.settled = true;
    } else if (r.kind === "unpin") board.delete((r.data as { nid: string }).nid);
  }
  return [...board.values()];
}

export function applyLive(a: LiveAction, actor: LiveActor, ctx: LiveContext): LiveApplied {
  const gm = actor.role === "gm";
  const me = actor.role === "player" ? ctx.people.find((p) => p.playerId === actor.playerId) ?? null : null;
  const by = actor.role === "player" ? actor.playerId : null;
  const person = (h: string) => ctx.people.find((p) => p.handle === h) ?? null;
  const atTable = () => (gm || me ? null : fail("Join the table (tear a poster or take a seat) first"));

  switch (a.type) {
    case "roll": {
      const denied = atTable();
      if (denied) return denied;
      if (ctx.dice === "pool" && !gm) return fail("At this table the game rolls the dice");
      if (a.hidden && !gm) return fail("Only the GM rolls behind the screen");
      if (a.mode !== "normal" && !(a.sides === 20 && a.count === 1)) return fail("Advantage is for a single d20");
      if (a.reroll) {
        if (!me || !ctx.coin) return fail("No coin to spend");
        if (coinCount(ctx.rows, me.playerId) < 1) return fail(`You have no ${ctx.coin.name} to spend`);
      }
      const r = rollDice(a.count, a.sides, a.mod, a.mode, ctx.rng);
      const data: RollData = {
        system: "d20",
        who: me ? (me.character ?? me.name) : "The GM",
        characterId: me?.characterId ?? null,
        label: a.label,
        formula: r.formula,
        dice: r.dice,
        mod: a.mod,
        total: r.total,
        mode: a.mode,
        nat: r.nat,
        ...(a.reroll ? { reroll: true } : {}),
      };
      const rolled = newRow("roll", data, by, null, Boolean(a.hidden && gm));
      if (!a.reroll || !me) return { ok: true, rows: [rolled] };
      return { ok: true, rows: [newRow("spend", { name: me.character ?? me.name, reroll: true }, by, me.playerId), rolled] };
    }
    case "note": {
      const denied = atTable();
      if (denied) return denied;
      let replyTo: number | null = null;
      if (a.replyTo !== undefined) {
        const parent = ctx.rows.find((r) => r.id === a.replyTo && r.kind === "note");
        // You can only answer a note that was sent to you.
        const toYou = parent && (gm ? (parent.data as NoteData).toGm : parent.toPlayer === by);
        if (!toYou) return fail("That note wasn't to you");
        replyTo = a.replyTo;
      }
      if (a.to === "gm") {
        if (gm) return fail("You are the GM");
        return row("note", { fromName: me!.character ?? me!.name, toGm: true, toName: "the GM", text: a.text, replyTo } satisfies NoteData, by);
      }
      const to = person(a.to);
      if (!to) return fail("Nobody at the table by that name");
      if (me && to.playerId === me.playerId) return fail("A note to yourself? Keep it in your pocket");
      const fromName = gm ? "the GM" : (me!.character ?? me!.name);
      return row("note", { fromName, toGm: false, toName: to.character ?? to.name, text: a.text, replyTo } satisfies NoteData, by, to.playerId);
    }
    case "bell": {
      if (!gm) return fail("Only the GM rings the bell");
      const to = a.to ? person(a.to) : null;
      if (a.to && !to) return fail("Nobody at the table by that name");
      return row("bell", { preset: a.preset, label: a.label ?? a.preset } satisfies BellData, null, to?.playerId ?? null);
    }
    case "act": {
      if (!gm) return fail("Only the GM raises the curtain");
      if (a.index === null) return row("act", { index: null }, null);
      const act = ctx.acts[a.index];
      if (!act) return fail("There's no act card by that number");
      return row("act", { ...act, index: a.index, total: ctx.acts.length } satisfies ActData, null);
    }
    case "tick": {
      if (!gm) return fail("Only the GM keeps the spotlight");
      const to = person(a.to);
      if (!to) return fail("Nobody at the table by that name");
      return row("tick", { beat: a.beat, on: a.on }, null, to.playerId);
    }
    case "rumors": {
      if (!me) return fail(gm ? "Players draw rumors" : "Tear a poster (or take a seat) before you listen at the bar");
      if (ctx.rumors.length < 2) return fail("No rumors in town tonight");
      const draws = rumorDraws(ctx.rows);
      if (draws.has(me.playerId)) return fail("You've had your two rumors");
      // Deal the least-heard rumors first, so the table hears as many different ones as it can.
      const heard = new Map(ctx.rumors.map((r) => [r.id, 0]));
      for (const ids of draws.values()) for (const id of ids) heard.set(id, (heard.get(id) ?? 0) + 1);
      const pool = ctx.rumors.map((r) => ({ id: r.id, n: heard.get(r.id) ?? 0, k: ctx.rng() }));
      pool.sort((x, y) => x.n - y.n || x.k - y.k);
      return row("rumor", { ids: pool.slice(0, 2).map((p) => p.id) }, by, me.playerId);
    }
    case "notice": {
      if (!gm) return fail("Only the GM pins notices");
      const pinned = pinnedNotices(ctx.rows);
      if (a.preset) {
        const p = ctx.notices.find((n) => n.id === a.preset);
        if (!p) return fail("No such notice");
        if (pinned.some((n) => n.nid === p.id)) return fail("That notice is already up");
        return row("notice", { nid: p.id, kind: p.kind, title: p.title, ...(p.text ? { text: p.text } : {}) } satisfies NoticeData, null);
      }
      if (!a.title) return fail("Give the notice a headline");
      const used = new Set(ctx.rows.filter((r) => r.kind === "notice").map((r) => (r.data as NoticeData).nid));
      let n = 1;
      while (used.has(`free-${n}`)) n++;
      return row("notice", { nid: `free-${n}`, kind: a.kind ?? "poster", title: a.title, ...(a.text ? { text: a.text } : {}) } satisfies NoticeData, null);
    }
    case "settle":
    case "unpin": {
      if (!gm) return fail("Only the GM tends the board");
      if (!pinnedNotices(ctx.rows).some((n) => n.nid === a.nid)) return fail("That notice isn't up");
      return row(a.type, { nid: a.nid }, null);
    }
    case "coin": {
      if (!ctx.coin) return fail("No coins at this table");
      const denied = atTable();
      if (denied) return denied;
      const to = person(a.to);
      if (!to) return fail("Nobody at the table by that name");
      if (me) {
        if (to.playerId === me.playerId) return fail("Toss it to someone else");
        if (tossedThisAct(ctx.rows, me.playerId) >= ctx.coin.tossesPerAct)
          return fail(ctx.coin.tossesPerAct ? "You've tossed your coin this act" : "Only the GM hands out coins here");
      }
      return row("coin", { fromName: me ? (me.character ?? me.name) : "the GM", toName: to.character ?? to.name, act: currentAct(ctx.rows) }, by, to.playerId);
    }
    case "spend": {
      if (!ctx.coin) return fail("No coins at this table");
      const who = gm && a.who ? person(a.who) : me;
      if (!who) return fail(gm ? "Spend whose coin?" : "Join the table first");
      if (coinCount(ctx.rows, who.playerId) < 1) return fail(`No ${ctx.coin.name} to spend`);
      return row("spend", { name: who.character ?? who.name }, by, who.playerId);
    }
    case "hide": {
      if (!gm) return fail("Only the GM hides rolls");
      const target = ctx.rows.find((r) => r.id === a.roll && r.kind === "roll");
      if (!target) return fail("No such roll");
      if ((target.data as { system?: string }).system === "duality") return fail("A duality roll moves Hope and Fear in the open, so it can't go behind the screen");
      return row("hide", { roll: a.roll, hidden: a.hidden }, null);
    }
    case "duality": {
      if (ctx.dice !== "duality") return fail("This table doesn't roll duality dice");
      if (gm) return fail("The GM rolls a d20 for adversaries");
      if (!me?.characterId) return fail("Tear a poster before you roll");
      const sheet = ctx.sheets?.[me.characterId];
      if (!sheet) return fail("Your character isn't in this one-shot");
      const exps = [];
      for (const n of new Set(a.experiences)) {
        const x = sheet.experiences.find((e) => e.name.toLowerCase() === n.toLowerCase());
        if (!x) return fail(`No Experience called "${n}" on your sheet`);
        exps.push({ name: x.name, bonus: x.bonus });
      }
      const hope = foldTallies(ctx.rows, ctx.sheets ?? {}).marks[me.characterId]?.hope ?? 0;
      if (exps.length > hope) return fail(exps.length === 1 ? "You need a Hope to add an Experience" : `You need ${exps.length} Hope for those Experiences`);
      const r = rollDuality(ctx.rng, { mod: a.mod, adv: a.adv, experiences: exps, reaction: a.reaction, difficulty: a.difficulty ?? null });
      const name = me.character ?? me.name;
      const data: DualityData = { system: "duality", who: name, characterId: me.characterId, label: a.label, ...r };
      return { ok: true, rows: [newRow("roll", data, by), ...rollTallies(r, me.characterId, name).map((t) => newRow("tally", t, by))] };
    }
    case "mark": {
      if (ctx.dice !== "duality") return fail("Nothing to mark at this table");
      const who = gm ? (a.to ? person(a.to) : null) : me;
      if (gm && !who) return fail("Mark whose sheet?");
      if (!gm && a.to && a.to !== me?.handle) return fail("You can only mark your own sheet");
      if (!who?.characterId) return fail("Tear a poster first");
      if (!ctx.sheets?.[who.characterId]) return fail("That character isn't in this one-shot");
      const name = who.character ?? who.name;
      return row("tally", { characterId: who.characterId, track: a.track, delta: a.delta, why: gm ? "the GM" : "ticked", name } satisfies TallyData, by, who.playerId);
    }
    case "fear": {
      if (ctx.dice !== "duality") return fail("No Fear at this table");
      if (!gm) return fail("Only the GM holds Fear");
      return row("tally", { characterId: null, track: "fear", delta: a.delta, why: a.opening ? "the opening Fear" : a.delta < 0 ? "spent" : "gained", name: "the GM" } satisfies TallyData, null);
    }
  }
}

// ---- What each viewer sees -----------------------------------------------------

/** Who an event is by or for, as a viewer sees it. */
export type Party = PublicPerson | "gm" | "all" | null;

export interface LiveEvent {
  id: number;
  kind: LiveKind;
  at: string;
  by: Party;
  to: Party;
  /** The viewer did it. */
  mine: boolean;
  /** It's addressed to the viewer (or to everyone). */
  forMe: boolean;
  /** A roll behind the screen this viewer may not look at: no dice, no who. */
  redacted?: boolean;
  data: unknown;
}

/** A rumor as the drawer sees it (no truth), or as the GM sees it (with). */
export type RumorView = { id: string; text: string; truth?: RumorTruth };

export interface ViewContext {
  people: Person[];
  rumors: Rumor[];
}

/** Rolls hidden right now: hidden when made, then toggled by the GM's `hide` events. */
export function hiddenRolls(rows: Pick<LiveRow, "id" | "kind" | "hidden" | "data">[]): Set<number> {
  const out = new Set<number>();
  for (const r of rows) {
    if (r.kind === "roll" && r.hidden) out.add(r.id);
    if (r.kind === "hide") {
      const d = r.data as { roll: number; hidden: boolean };
      if (d.hidden) out.add(d.roll);
      else out.delete(d.roll);
    }
  }
  return out;
}

function party(playerId: string | null, people: Person[], fallback: Party): Party {
  if (playerId === null) return fallback;
  const p = people.find((x) => x.playerId === playerId);
  return p ? toPublicPerson(p) : fallback;
}

/**
 * One event as one viewer may see it, or null when it isn't theirs to see at
 * all. `hidden` is the set from `hiddenRolls` over the whole log.
 */
export function viewEvent(r: LiveRow, viewer: Viewer, ctx: ViewContext, hidden: Set<number>): LiveEvent | null {
  const gm = viewer.role === "gm";
  const you = viewer.role === "player" ? viewer.playerId : null;
  const mine = you !== null && r.byPlayer === you;
  const toYou = you !== null && r.toPlayer === you;
  const by = party(r.byPlayer, ctx.people, "gm");
  const base = { id: r.id, kind: r.kind, at: r.createdAt, by, mine };

  switch (r.kind) {
    case "roll": {
      if (hidden.has(r.id) && !gm && !mine) return { ...base, by: null, to: null, mine: false, forMe: false, redacted: true, data: null };
      return { ...base, to: "all", forMe: true, data: r.data, ...(hidden.has(r.id) ? { redacted: false } : {}) };
    }
    case "note": {
      const d = r.data as NoteData;
      const to: Party = d.toGm ? "gm" : party(r.toPlayer, ctx.people, null);
      const reader = mine || toYou || (gm && (d.toGm || r.byPlayer === null));
      // Everyone may see that a note changed hands; only its two ends may read it.
      const { text, ...envelope } = d;
      return { ...base, to, forMe: toYou || (gm && d.toGm), data: reader ? { ...envelope, text } : envelope };
    }
    case "bell": {
      if (r.toPlayer && !gm && !toYou) return null;
      return { ...base, to: r.toPlayer ? party(r.toPlayer, ctx.people, null) : "all", forMe: viewer.role === "player" && (!r.toPlayer || toYou), data: r.data };
    }
    case "tick":
    case "hide":
      return gm ? { ...base, to: party(r.toPlayer, ctx.people, null), forMe: false, data: r.data } : null;
    case "rumor": {
      if (!gm && !toYou) return null;
      const ids = (r.data as { ids: string[] }).ids;
      const rumors: RumorView[] = ids.flatMap((id) => {
        const x = ctx.rumors.find((y) => y.id === id);
        return x ? [gm ? { id, text: x.text, truth: x.truth } : { id, text: x.text }] : [];
      });
      return { ...base, to: party(r.toPlayer, ctx.people, null), forMe: toYou, data: { rumors } };
    }
    case "coin":
    case "spend":
      return { ...base, to: party(r.toPlayer, ctx.people, null), forMe: toYou, data: r.data };
    default:
      // Acts, notices, and the Ten Candles mirror (deaths, candles) are for everyone.
      return { ...base, to: "all", forMe: viewer.role === "player", data: r.data };
  }
}

/** The log as one viewer may see it. */
export function viewEvents(rows: LiveRow[], viewer: Viewer, ctx: ViewContext, after = 0): LiveEvent[] {
  const hidden = hiddenRolls(rows);
  return rows.filter((r) => r.id > after).flatMap((r) => {
    const v = viewEvent(r, viewer, ctx, hidden);
    return v ? [v] : [];
  });
}

/** Roll ids this viewer currently sees redacted, so a poll can catch rolls hidden after they arrived. */
export function redactedFor(rows: LiveRow[], viewer: Viewer): number[] {
  if (viewer.role === "gm") return [];
  const you = viewer.role === "player" ? viewer.playerId : null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...hiddenRolls(rows)].filter((id) => byId.get(id)?.byPlayer !== you || you === null).sort((a, b) => a - b);
}

// ---- Folds (in the browser, over what the viewer was sent) -----------------------

const handleOf = (p: Party) => (p && typeof p === "object" ? p.handle : null);

export interface LiveFold {
  /** The act card up now, or null when the curtain is up on the board. */
  act: ActData | null;
  /** The latest act shown (stays after the curtain comes up). */
  lastAct: ActData | null;
  notices: (NoticeData & { settled: boolean; at: string; id: number })[];
  /** Coins held, by handle. */
  coins: Record<string, number>;
  /** Coins each handle tossed this act. */
  tossed: Record<string, number>;
  rolls: LiveEvent[];
  notes: LiveEvent[];
  /** GM: ticked beats by handle. */
  ticks: Record<string, string[]>;
  /** The rumors drawn, by handle (a player sees only their own). */
  rumors: Record<string, RumorView[]>;
}

export function foldLive(events: LiveEvent[]): LiveFold {
  const f: LiveFold = { act: null, lastAct: null, notices: [], coins: {}, tossed: {}, rolls: [], notes: [], ticks: {}, rumors: {} };
  const board = new Map<string, NoticeData & { settled: boolean; at: string; id: number }>();
  const ticks: Record<string, Set<string>> = {};
  for (const e of events) {
    const to = handleOf(e.to);
    const by = handleOf(e.by);
    switch (e.kind) {
      case "act": {
        const d = e.data as ActData | { index: null };
        f.act = d.index === null ? null : (d as ActData);
        if (d.index !== null) {
          f.lastAct = d as ActData;
          f.tossed = {};
        }
        break;
      }
      case "notice": {
        const d = e.data as NoticeData;
        board.set(d.nid, { ...d, settled: d.kind === "settled", at: e.at, id: e.id });
        break;
      }
      case "settle": {
        const n = board.get((e.data as { nid: string }).nid);
        if (n) board.set(n.nid, { ...n, settled: true });
        break;
      }
      case "unpin":
        board.delete((e.data as { nid: string }).nid);
        break;
      case "coin":
        if (to) f.coins[to] = (f.coins[to] ?? 0) + 1;
        if (by) f.tossed[by] = (f.tossed[by] ?? 0) + 1;
        break;
      case "spend":
        if (to) f.coins[to] = Math.max(0, (f.coins[to] ?? 0) - 1);
        break;
      case "roll":
        f.rolls.push(e);
        break;
      case "note":
        f.notes.push(e);
        break;
      case "tick": {
        if (!to) break;
        const d = e.data as { beat: string; on: boolean };
        ticks[to] ??= new Set();
        if (d.on) ticks[to].add(d.beat);
        else ticks[to].delete(d.beat);
        break;
      }
      case "rumor":
        if (to) f.rumors[to] = (e.data as { rumors: RumorView[] }).rumors;
        break;
    }
  }
  f.notices = [...board.values()];
  f.ticks = Object.fromEntries(Object.entries(ticks).map(([h, s]) => [h, [...s]]));
  return f;
}

/** Bells this phone should ring: for it (or everyone), newer than what it had already seen when it loaded. */
export function bellsToRing(events: LiveEvent[], seenUpTo: number): LiveEvent[] {
  return events.filter((e) => e.kind === "bell" && e.forMe && e.id > seenUpTo);
}

// ---- The spotlight ---------------------------------------------------------------

export interface SpotlightRow {
  handle: string;
  /** When their thread last had the table's attention (ms since epoch), or null. */
  lastAt: number | null;
  /** What it was: "rolled Stealth", "opened a letter"… */
  last: string | null;
}

/**
 * When each person last had the spotlight: any roll of theirs, a note they
 * passed or got, a coin, a letter opened, or a beat the GM ticked for them.
 */
export function spotlight(
  people: PublicPerson[],
  events: LiveEvent[],
  lettersOpened: { characterId: string; openedAt: string }[],
): SpotlightRow[] {
  return people.map((p) => {
    let lastAt: number | null = p.since ? Date.parse(p.since) : null;
    let last: string | null = p.since ? "joined the table" : null;
    const bump = (at: string, what: string) => {
      const t = Date.parse(at);
      if (!Number.isNaN(t) && (lastAt === null || t >= lastAt)) {
        lastAt = t;
        last = what;
      }
    };
    for (const e of events) {
      const by = handleOf(e.by);
      const to = handleOf(e.to);
      if (e.kind === "roll" && by === p.handle) bump(e.at, `rolled ${(e.data as RollData | PoolRollData | null)?.label ?? "dice"}`);
      else if (e.kind === "note" && (by === p.handle || to === p.handle)) bump(e.at, by === p.handle ? "passed a note" : "got a note");
      else if (e.kind === "coin" && (by === p.handle || to === p.handle)) bump(e.at, by === p.handle ? "tossed a coin" : "caught a coin");
      else if (e.kind === "tick" && to === p.handle && (e.data as { on: boolean }).on) bump(e.at, `${(e.data as { beat: string }).beat} beat`);
    }
    for (const l of lettersOpened) if (l.characterId === p.characterId) bump(l.openedAt, "opened a letter");
    return { handle: p.handle, lastAt, last };
  });
}

/** Minutes since their spotlight, rounded down; null if never. */
export const minutesSince = (lastAt: number | null, now: number) => (lastAt === null ? null : Math.max(0, Math.floor((now - lastAt) / 60000)));
