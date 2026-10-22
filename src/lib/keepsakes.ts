import type { Keepsake } from "./coreSchema";
import type { HistoryEntry, HistoryRole } from "./history";
import type { Fate } from "./legacy";

/**
 * Keepsakes (phase 13), the only "achievements": each job someone saw to the
 * end leaves one small object in the cabinet on their profile. There's no
 * awards table and nothing to unlock; the cabinet is read from their history
 * (./history.ts), so it's retroactive, a guest's seat earns nothing until an
 * account adopts it, and finishing a game (or saving its paper) is all it
 * takes. Pure, so the rules are tested without a database.
 *
 * - The GM and any co-GM take the one-shot's GM keepsake.
 * - A player takes their character's own keepsake if the one-shot gives
 *   them one, else the shared player keepsake.
 * - A one-shot without keepsakes hands out a ticket stub.
 * - A character who fell takes the object home cracked or scorched.
 * - The same object from the same job stacks ("×2"), drawn as it was on the
 *   latest run, with every run listed in its card.
 *
 * What a cabinet never holds: secrets, titles, scars, lines, or anything
 * else from the night beyond the character's name (as the board shows it,
 * to anyone but its player) and their fate.
 */

/** What everyone gets from a one-shot that names no keepsakes. */
export const TICKET_STUB: Keepsake = {
  name: "A ticket stub",
  note: "Admit one. Torn at the door, and kept in a coat pocket ever since.",
  art: "ticket",
};

/** The fates that mark the object. */
export const FALLEN: readonly Fate[] = ["fell"];
export const isFallen = (fate: Fate | null | undefined) => fate != null && FALLEN.includes(fate);

/** The parts of a one-shot the keepsakes read. */
export interface KeepsakeSource {
  keepsakes?: { player: Keepsake; gm: Keepsake };
  cast: { id: string; keepsake?: Keepsake }[];
}

/**
 * The keepsake for a role (and character) in a one-shot, and which of its
 * objects it is: "gm", "player" (the shared one) or "c:<id>" (their own).
 */
export function keepsakeFor(os: KeepsakeSource | null, role: HistoryRole, characterId?: string): { keepsake: Keepsake; which: string } {
  if (role !== "player") return { keepsake: os?.keepsakes?.gm ?? TICKET_STUB, which: "gm" };
  const own = characterId ? os?.cast.find((c) => c.id === characterId)?.keepsake : undefined;
  if (own) return { keepsake: own, which: `c:${characterId}` };
  return { keepsake: os?.keepsakes?.player ?? TICKET_STUB, which: "player" };
}

/** One night an object was earned. */
export interface CabinetRun {
  code: string;
  date: string;
  role: HistoryRole;
  /** For a player: who they were and how it ended. */
  character?: { name: string; fate: Fate | null };
}

/** One object on the shelf. */
export interface CabinetItem {
  /** Stable within a cabinet: `<oneshot>:<which>`. */
  id: string;
  oneshot: string;
  /** The one-shot's title. */
  title: string;
  keepsake: Keepsake;
  /** How many times it was earned (the "×2"). */
  count: number;
  /** Drawn cracked or scorched: the latest run's character fell. */
  fallen: boolean;
  /** Newest first. */
  runs: CabinetRun[];
}

/**
 * The cabinet for a history (newest first, as ./history.ts gives it).
 * `sourceOf` gives each one-shot's keepsakes, or null if it's gone.
 */
export function shelve(entries: HistoryEntry[], sourceOf: (oneshot: string) => KeepsakeSource | null): CabinetItem[] {
  const items = new Map<string, CabinetItem>();
  for (const e of entries) {
    const { keepsake, which } = keepsakeFor(sourceOf(e.oneshot), e.role, e.character?.id);
    const id = `${e.oneshot}:${which}`;
    const run: CabinetRun = {
      code: e.code,
      date: e.date,
      role: e.role,
      ...(e.character ? { character: { name: e.character.name, fate: e.character.fate } } : {}),
    };
    const had = items.get(id);
    if (had) {
      had.count++;
      had.runs.push(run);
    } else {
      items.set(id, { id, oneshot: e.oneshot, title: e.title, keepsake, count: 1, fallen: isFallen(run.character?.fate), runs: [run] });
    }
  }
  return [...items.values()];
}

/** What one person takes home from a night, for the morning after's strip. */
export interface TakeHome {
  /** "gm", or the character's id. */
  id: string;
  /** "The GM", or the character's name. */
  who: string;
  keepsake: Keepsake;
  fallen: boolean;
}

/**
 * What everyone takes home from a game: the GM's keepsake, then one for
 * each character the paper says was played (a fate is set), in board order.
 */
export function takeHome(
  os: KeepsakeSource & { cast: { id: string; name: string; order: number }[] },
  fates: Record<string, { fate?: Fate | null } | undefined>,
): TakeHome[] {
  const out: TakeHome[] = [{ id: "gm", who: "The GM", keepsake: keepsakeFor(os, "gm").keepsake, fallen: false }];
  for (const c of [...os.cast].sort((a, b) => a.order - b.order)) {
    const fate = fates[c.id]?.fate;
    if (!fate) continue;
    out.push({ id: c.id, who: c.name, keepsake: keepsakeFor(os, "player", c.id).keepsake, fallen: isFallen(fate) });
  }
  return out;
}
