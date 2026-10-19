import type { SystemId } from "@/lib/schema";
import type * as dnd5e from "./dnd5e/schema";
import type * as tencandles from "./tencandles/schema";

/**
 * What each game system brings, in one place. Shared pages ask this which
 * routes a one-shot has, what its badge says and what goes under a poster,
 * and narrow on `os.system` to render the system's own sheet, GM panel, TV
 * view and phone tools.
 *
 * To add a system: a schema in src/systems/<id>/schema.ts joined into the
 * union in src/lib/schema.ts, its checks in content.ts, its toPublic branch
 * in src/lib/public.ts, and an entry here. docs/SYSTEMS.md has the sketches.
 */

export interface SystemRoutes {
  /** `/<slug>/print`: every character sheet. */
  print: boolean;
  /** `/<slug>/cards` and `/<slug>/<id>/cards`: spell, item and feature cards. */
  cards: boolean;
  /** `/<slug>/tents` and `/<slug>/<id>/tent`: folded name tents and tokens. */
  tents: boolean;
  /** `/<slug>/play`: the phone at the table (character creation, dice…). */
  play: boolean;
  /** `/<slug>/kit`: a GM-only printable table kit (it carries the module). */
  kit: boolean;
}

export interface SystemMeta {
  id: SystemId;
  /** "D&D 5e", "Ten Candles". */
  label: string;
  /** Short stamp for postings and the TV. */
  badge: string;
  /** Who publishes the game, for the play-aid notice. */
  publisher?: string;
  routes: SystemRoutes;
  /** What players do to take a character, on the poster's tear strip, when it isn't the skin's own words. */
  claimVerb?: string;
}

export const SYSTEMS: Record<SystemId, SystemMeta> = {
  dnd5e: {
    id: "dnd5e",
    label: "D&D 5e",
    badge: "5e",
    routes: { print: true, cards: true, tents: true, play: false, kit: false },
  },
  tencandles: {
    id: "tencandles",
    label: "Ten Candles",
    badge: "Ten Candles",
    publisher: "Cavalry Games",
    routes: { print: false, cards: false, tents: false, play: true, kit: true },
    claimVerb: "TAKE THIS ONE",
  },
};

type AnyOneShotLike =
  | (Pick<dnd5e.OneShot, "system" | "ruleset" | "level"> & { variants?: { level: number }[] })
  | Pick<tencandles.OneShot, "system">;

/** The line under a poster: class and level in 5e; in Ten Candles, what's in their pockets (traits come at the table). */
export function posterTag(
  c: Pick<dnd5e.Character, "mech"> | Pick<tencandles.Character, "story">,
): string {
  if ("mech" in c) return c.mech.classes.map((k) => `${k.name} ${k.level}`).join(" / ");
  return c.story.carrying.length ? `Carrying ${c.story.carrying[0]}` : "A pre-made concept";
}

/** The ruleset stamp on a posting: "2024 rules", or the system's badge. */
export function rulesStamp(os: AnyOneShotLike): string {
  return os.system === "dnd5e" ? `${os.ruleset} rules` : SYSTEMS[os.system].badge;
}

/** Whether a one-shot has a page; static paths for system-specific pages use this. */
export function hasRoute(os: { system: SystemId }, route: keyof SystemRoutes): boolean {
  return SYSTEMS[os.system].routes[route];
}
