import type { OneShotWithCast } from "./schema";

/** What player-facing pages get: everything except the GM's notes. */
export type PublicOneShot = Omit<OneShotWithCast, "gmNotes">;

export function toPublic(os: OneShotWithCast): PublicOneShot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { gmNotes, ...rest } = os;
  return JSON.parse(JSON.stringify(rest)) as PublicOneShot;
}
