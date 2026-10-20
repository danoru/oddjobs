import type { Epilogue } from "@/components/gazette/Gazette";
import { FATE_LABEL } from "./legacy";
import type { ActData, LiveEvent, NoteData, PoolRollData, RollData } from "./live";
import type { DualityData } from "@/systems/daggerheart/live";
import type { TapestryEdits } from "./epilogueSchema";

/**
 * The night's tapestry: a frieze of panels woven from what happened at the
 * table. Posters torn down, letters opened, natural 20s and 1s (Daggerheart
 * critical successes; or candles
 * going dark and the dead, in Ten Candles), each act card, how many notes
 * passed under the table, and the fates from the morning after. Built only
 * from what the table could see (the TV's view of the log), so hidden rolls
 * and note texts never reach it. The GM can drop or rename panels.
 */

export type PanelKind = "claim" | "letter" | "nat20" | "nat1" | "crit" | "darkened" | "death" | "act" | "notes" | "coins" | "fate";

export interface Panel {
  /** Stable, so the GM's edits stick: "claim:rook", "roll:42", "fate:rook"… */
  id: string;
  kind: PanelKind;
  title: string;
  caption: string;
  /** ISO time, or null for the closing panels. */
  at: string | null;
  /** A poster icon key for the woodcut, when the panel is about one character. */
  characterId: string | null;
}

export interface TapestryInput {
  cast: { id: string; name: string }[];
  claims: { characterId: string; name: string; claimedAt: string }[];
  letters: { id: string; to: string; openedAt: string | null }[];
  /** The log as the table (TV) sees it. */
  events: LiveEvent[];
  epilogue: Epilogue | null;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function buildTapestry(input: TapestryInput): Panel[] {
  const nameOf = (id: string | null) => input.cast.find((c) => c.id === id)?.name ?? "Someone";
  const timed: Panel[] = [];

  for (const c of input.claims)
    timed.push({
      id: `claim:${c.characterId}`,
      kind: "claim",
      title: `${nameOf(c.characterId)} is torn from the board`,
      caption: `played by ${c.name}`,
      at: c.claimedAt,
      characterId: c.characterId,
    });

  for (const l of input.letters)
    if (l.openedAt)
      timed.push({ id: `letter:${l.id}`, kind: "letter", title: `${nameOf(l.to)} breaks a seal`, caption: "and reads what was meant for them alone", at: l.openedAt, characterId: l.to });

  let notes = 0;
  let coins = 0;
  for (const e of input.events) {
    if (e.kind === "roll" && e.data && !e.redacted) {
      const d = e.data as RollData | PoolRollData | DualityData;
      if (d.system === "d20" && d.nat === 20)
        timed.push({ id: `roll:${e.id}`, kind: "nat20", title: `A natural 20 for ${d.who}`, caption: d.label, at: e.at, characterId: d.characterId });
      else if (d.system === "d20" && d.nat === 1)
        timed.push({ id: `roll:${e.id}`, kind: "nat1", title: `A natural 1 for ${d.who}`, caption: d.label, at: e.at, characterId: d.characterId });
      else if (d.system === "duality" && d.outcome === "crit")
        timed.push({ id: `roll:${e.id}`, kind: "crit", title: `A critical success for ${d.who}`, caption: d.label, at: e.at, characterId: d.characterId });
      else if (d.system === "pool" && d.died)
        timed.push({ id: `roll:${e.id}`, kind: "death", title: `${d.who} is lost to the dark`, caption: "the Last Stand fails", at: e.at, characterId: d.characterId });
      else if (d.system === "pool" && d.darkened)
        timed.push({ id: `roll:${e.id}`, kind: "darkened", title: "A candle goes dark", caption: `${d.who}'s roll fails`, at: e.at, characterId: d.characterId });
    } else if (e.kind === "death") {
      const who = (e.data as { who: string }).who;
      timed.push({ id: `death:${e.id}`, kind: "death", title: `${who} chooses the dark`, caption: "and does not come back", at: e.at, characterId: null });
    } else if (e.kind === "candle") {
      const d = e.data as { lit: number; seized?: boolean; cause?: "hand" | "burnout" | "draft" };
      timed.push({
        id: `candle:${e.id}`,
        kind: "darkened",
        title: d.cause === "burnout" ? "A candle burns down" : d.cause === "draft" ? "A draft takes a candle" : "A candle goes dark",
        caption: d.seized ? "spent to take back the telling" : `${d.lit} still burn`,
        at: e.at,
        characterId: null,
      });
    } else if (e.kind === "act" && (e.data as { index: number | null }).index !== null) {
      const a = e.data as ActData;
      timed.push({ id: `act:${a.id}`, kind: "act", title: `Act ${ROMAN[a.index] ?? a.index + 1}: ${a.title}`, caption: a.subtitle ?? "", at: e.at, characterId: null });
    } else if (e.kind === "note") notes++;
    else if (e.kind === "coin") coins++;
  }

  // The same act raised twice keeps its first panel.
  const seen = new Set<string>();
  const ordered = timed
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

  const closing: Panel[] = [];
  if (notes)
    closing.push({ id: "notes", kind: "notes", title: `${notes} ${notes === 1 ? "note" : "notes"} passed under the table`, caption: "and nobody else read them", at: null, characterId: null });
  if (coins)
    closing.push({ id: "coins", kind: "coins", title: `${coins} brass ${coins === 1 ? "coin" : "coins"} tossed`, caption: "for a moment well played", at: null, characterId: null });
  for (const c of input.cast) {
    const e = input.epilogue?.entries[c.id];
    if (!e?.fate) continue;
    closing.push({
      id: `fate:${c.id}`,
      kind: "fate",
      title: `${c.name}: ${FATE_LABEL[e.fate].toLowerCase()}`,
      caption: e.line ? `“${e.line}”` : e.title ? `the ${e.title}` : "",
      at: null,
      characterId: c.id,
    });
  }
  return [...ordered, ...closing];
}

/** The GM's edits on top: renamed panels take their new titles; dropped ones go (or, for the GM, stay marked). */
export function applyEdits(panels: Panel[], edits: TapestryEdits, keepDropped = false): (Panel & { dropped: boolean })[] {
  return panels
    .map((p) => ({ ...p, title: edits.titles[p.id] ?? p.title, dropped: edits.dropped.includes(p.id) }))
    .filter((p) => keepDropped || !p.dropped);
}

/** Note texts never reach the tapestry, even if handed a log that has them. */
export function stripNoteText(events: LiveEvent[]): LiveEvent[] {
  return events.map((e) => {
    if (e.kind !== "note") return e;
    const { text: _, ...rest } = e.data as NoteData; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...e, data: rest };
  });
}
