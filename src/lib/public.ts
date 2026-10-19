import type { OneShotWithCast } from "./schema";
import type * as dnd5e from "@/systems/dnd5e/schema";
import type * as tencandles from "@/systems/tencandles/schema";

/**
 * What player-facing pages get: everything except the GM's notes, letters and
 * NPC fallbacks — and, per system, whatever else only the GM reads (a Ten
 * Candles module and its suggested truths).
 */
export type PublicCharacter = Omit<dnd5e.Character, "ifUnclaimed">;
export type PublicTcCharacter = Omit<tencandles.Character, "ifUnclaimed">;

export type PublicOneShot = Omit<dnd5e.OneShotWithCast, "gmNotes" | "letters" | "cast"> & { cast: PublicCharacter[] };
export type PublicTcOneShot = Omit<tencandles.OneShotWithCast, "gmNotes" | "letters" | "cast" | "module" | "suggestedTruths"> & {
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
    const { gmNotes, letters, cast, module, suggestedTruths, ...rest } = os;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return clean({ ...rest, cast: cast.map(({ ifUnclaimed, ...c }) => c) });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { gmNotes, letters, cast, ...rest } = os;
  return clean({
    ...rest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cast: cast.map(({ ifUnclaimed, ...c }) => c),
  });
}
