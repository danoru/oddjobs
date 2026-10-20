import type { OneShotWithCast } from "./schema";
import type * as dnd5e from "@/systems/dnd5e/schema";
import type * as tencandles from "@/systems/tencandles/schema";

/**
 * What player-facing pages get: everything except the GM's notes, letters,
 * NPC fallbacks, act cards, rumors and town-board presets — and, per system,
 * whatever else only the GM reads (a Ten Candles module and its suggested
 * truths). Acts, rumors and notices reach players only through the table's
 * event log (src/lib/live.ts), once the GM shows, deals or pins them.
 */
export type PublicCharacter = Omit<dnd5e.Character, "ifUnclaimed">;
export type PublicTcCharacter = Omit<tencandles.Character, "ifUnclaimed">;

type GmOnly = "gmNotes" | "letters" | "acts" | "rumors" | "notices";
/** What players may know about the GM-only extras: only that rumors are there to be drawn. */
type Flags = { hasRumors: boolean };
export type PublicOneShot = Omit<dnd5e.OneShotWithCast, GmOnly | "cast"> & Flags & { cast: PublicCharacter[] };
export type PublicTcOneShot = Omit<tencandles.OneShotWithCast, GmOnly | "cast" | "module" | "suggestedTruths"> & Flags & {
  cast: PublicTcCharacter[];
};
export type PublicAnyOneShot = PublicOneShot | PublicTcOneShot;

const clean = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function toPublic(os: dnd5e.OneShotWithCast): PublicOneShot;
export function toPublic(os: tencandles.OneShotWithCast): PublicTcOneShot;
export function toPublic(os: OneShotWithCast): PublicAnyOneShot;
export function toPublic(os: OneShotWithCast): PublicAnyOneShot {
  if (os.system === "tencandles") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { gmNotes, letters, acts, rumors, notices, cast, module, suggestedTruths, ...rest } = os;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return clean({ ...rest, hasRumors: rumors.length >= 2, cast: cast.map(({ ifUnclaimed, ...c }) => c) });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { gmNotes, letters, acts, rumors, notices, cast, ...rest } = os;
  return clean({
    ...rest,
    hasRumors: rumors.length >= 2,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cast: cast.map(({ ifUnclaimed, ...c }) => c),
  });
}
