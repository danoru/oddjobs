import type { Character } from "./schema";

/**
 * "What changes tonight": given who's actually playing, work out which absent
 * characters become NPCs, which of their story beats move to someone at the
 * table, and which scenes drop out. Pure, so the GM page and tests share it.
 */

export interface TonightPlan {
  npcs: { id: string; name: string; note: string }[];
  moves: { beat: string; from: string; to: string; text: string }[];
  /** Beats with no listed inheritor at the table — the GM decides. */
  orphaned: { beat: string; from: string }[];
  cuts: { from: string; text: string }[];
}

export function planTonight(cast: Pick<Character, "id" | "name" | "ifUnclaimed">[], present: string[]): TonightPlan {
  const here = new Set(present);
  const plan: TonightPlan = { npcs: [], moves: [], orphaned: [], cuts: [] };
  for (const c of cast) {
    if (here.has(c.id)) continue;
    const f = c.ifUnclaimed;
    plan.npcs.push({ id: c.id, name: c.name, note: f?.npc ?? "No fallback written — play them as an NPC or leave them out." });
    for (const r of f?.reassign ?? []) {
      const to = r.to.find((id) => here.has(id));
      if (to) plan.moves.push({ beat: r.beat, from: c.id, to, text: r.text });
      else plan.orphaned.push({ beat: r.beat, from: c.id });
    }
    for (const cut of f?.cuts ?? []) plan.cuts.push({ from: c.id, text: cut });
  }
  return plan;
}

/** What one player should be handed because someone else isn't here. */
export function inheritedBy(plan: TonightPlan, id: string) {
  return plan.moves.filter((m) => m.to === id);
}
