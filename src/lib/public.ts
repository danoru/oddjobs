import type { Character, OneShotWithCast } from "./schema";

/** GM-only fields, kept out of everything player pages receive. */
export type PublicCharacter = Omit<Character, "ifUnclaimed">;

/** What player-facing pages get: everything except the GM's notes, letters and NPC fallbacks. */
export type PublicOneShot = Omit<OneShotWithCast, "gmNotes" | "letters" | "cast"> & { cast: PublicCharacter[] };

export function toPublic(os: OneShotWithCast): PublicOneShot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { gmNotes, letters, cast, ...rest } = os;
  return JSON.parse(
    JSON.stringify({
      ...rest,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      cast: cast.map(({ ifUnclaimed, ...c }) => c),
    }),
  ) as PublicOneShot;
}
