import type { Act } from "@/lib/coreSchema";
import type { ActData, NewRow, PoolRollData } from "@/lib/live";
import type { Stage } from "./schema";
import { litCount, type TcState } from "./game";

/**
 * The act card for a candle count: acts follow the module's stages in order
 * (the stage that applies while that many candles burn), with one more act,
 * if written, for the Last Stand. Null when the one-shot has no acts.
 */
export function actForCandles(acts: readonly unknown[], stages: Pick<Stage, "candles">[], lit: number): number | null {
  if (!acts.length || lit < 1) return null;
  if (lit === 1 && acts.length > stages.length) return Math.min(stages.length, acts.length - 1);
  const sorted = [...stages].sort((a, b) => b.candles - a.candles);
  let at = 0;
  sorted.forEach((st, i) => {
    if (st.candles >= lit) at = i;
  });
  return Math.min(at, acts.length - 1);
}

/** The scene a state is in or about to begin (truths open each scene). */
const sceneOf = (s: TcState | null) => (!s ? 0 : s.phase === "truths" && s.truths ? s.truths.scene : s.phase === "scene" ? s.scene : 0);

export interface MirrorOptions {
  acts: Act[];
  stages: Pick<Stage, "candles">[];
  /** The act card the log shows now (-1 for none). */
  lastAct: number;
}

/**
 * What a Ten Candles move adds to the table's event log, so the spotlight,
 * the tapestry and the chronicle see the night the same way they see a 5e
 * one: each settled roll (with whether it darkened a candle or killed), each
 * death by a player's choice, and each candle the GM put out by hand. The
 * game state itself stays the reducer's; its own log only keeps 30 rolls.
 */
export function mirrorTc(prev: TcState | null, next: TcState, opts?: MirrorOptions): NewRow[] {
  const rows: NewRow[] = [];
  const seen = new Set((prev?.log ?? []).map((r) => r.id));
  const nameOf = (seat: number) => {
    const p = next.players[seat];
    return p ? (p.concept?.name ?? p.name) : "Someone";
  };

  for (const r of next.log) {
    if (seen.has(r.id) || !r.resolved) continue;
    const data: PoolRollData = {
      system: "pool",
      who: nameOf(r.seat),
      characterId: next.players[r.seat]?.characterId ?? null,
      label: r.moment ? "Living the Moment" : `Scene ${r.scene}`,
      dice: r.dice,
      gmDice: r.gmDice,
      hope: r.hope,
      success: r.resolved.success,
      narrator: r.resolved.narrator,
      darkened: r.resolved.darkened,
      died: r.resolved.died,
    };
    rows.push({ kind: "roll", data, byPlayer: next.players[r.seat]?.playerId ?? null, toPlayer: null, hidden: false });
  }

  // Deaths that weren't a roll's (a player choosing to die, or the GM ending it).
  const diedByRoll = new Set(next.log.filter((r) => !seen.has(r.id) && r.resolved?.died).map((r) => r.seat));
  if (prev)
    next.players.forEach((p, i) => {
      const before = prev.players.find((x) => x.playerId === p.playerId);
      if (before?.alive && !p.alive && !diedByRoll.has(i) && next.phase !== "ended")
        rows.push({ kind: "death", data: { who: nameOf(i) }, byPlayer: p.playerId, toPlayer: null, hidden: false });
    });

  // A candle put out by the GM's hand, by burning down or by a draft (not one a roll put out).
  const seized = next.log.filter((r) => r.resolved?.seized && prev?.log.find((x) => x.id === r.id && !x.resolved?.seized)).length;
  if (prev && next.lastOut && next.lastOut.n !== prev.lastOut?.n && (prev.phase === "scene" || prev.phase === "truths"))
    rows.push({ kind: "candle", data: { lit: litCount(next), cause: next.lastOut.cause }, byPlayer: null, toPlayer: null, hidden: false });
  if (seized)
    rows.push({ kind: "candle", data: { lit: litCount(next), seized: true }, byPlayer: null, toPlayer: null, hidden: false });

  // A new scene opens (truths) or starts (play): when the candles have burned into the next stage, its act card goes up on the TV.
  if (opts && (sceneOf(next) > sceneOf(prev) || (prev?.phase === "truths" && next.phase === "scene"))) {
    const index = actForCandles(opts.acts, opts.stages, litCount(next));
    if (index !== null && index !== opts.lastAct) {
      const data: ActData = { ...opts.acts[index], index, total: opts.acts.length };
      rows.push({ kind: "act", data, byPlayer: null, toPlayer: null, hidden: false });
    }
  }

  return rows;
}
