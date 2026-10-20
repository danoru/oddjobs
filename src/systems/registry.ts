import type { SystemId } from "@/lib/schema";
import type * as dnd5e from "./dnd5e/schema";
import type * as tencandles from "./tencandles/schema";
import type { SystemEditor } from "@/lib/editor/types";
import { editor as dnd5eEditor } from "./dnd5e/editor";
import { editor as tencandlesEditor } from "./tencandles/editor";

/**
 * What each game system brings, in one place. Shared pages ask this which
 * routes a one-shot has, what its badge says and what goes under a poster,
 * and narrow on `os.system` to render the system's own sheet, GM panel, TV
 * view and phone tools.
 *
 * To add a system: a schema in src/systems/<id>/schema.ts joined into the
 * union in src/lib/schema.ts, its checks in content.ts, its toPublic branch
 * in src/lib/public.ts, its builder in editor.ts, and an entry here.
 * docs/SYSTEMS.md has the sketches.
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

/** A beat the GM ticks on the spotlight tracker when a character's thread gets its moment. */
export interface SpotlightBeat {
  id: string;
  label: string;
}

/**
 * How a system rolls dice at the table. `d20`: the phone rolls checks, saves
 * and attacks from the sheet (server-side dice, logged to the table's event
 * log); `pool`: the system's own reducer rolls (Ten Candles' d6 pool), and the
 * phone only adds shake-to-roll and the TV's tray.
 */
export type DiceKind = "d20" | "pool";

/** What an inspiration coin stands for at this table, or null when the system has none. */
export interface CoinMeta {
  name: string;
  /** What spending one does, in a line. */
  spend: string;
  tossesPerAct: number;
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
  /** The admin builder's sections, field hints and starting templates (src/systems/<id>/editor.ts). */
  editor: SystemEditor;
  dice: DiceKind;
  /** The GM's spotlight beats for each character. */
  spotlight: SpotlightBeat[];
  /** Whether the system has inspiration coins at all (the one-shot can still turn them off). */
  coins: boolean;
}

export const SYSTEMS: Record<SystemId, SystemMeta> = {
  dnd5e: {
    id: "dnd5e",
    label: "D&D 5e",
    badge: "5e",
    routes: { print: true, cards: true, tents: true, play: false, kit: false },
    editor: dnd5eEditor,
    dice: "d20",
    spotlight: [
      { id: "stake", label: "Stake" },
      { id: "secret", label: "Secret" },
      { id: "ties", label: "Ties" },
      { id: "letters", label: "Letters" },
      { id: "flashback", label: "Flashback" },
    ],
    coins: true,
  },
  tencandles: {
    id: "tencandles",
    label: "Ten Candles",
    badge: "Ten Candles",
    publisher: "Cavalry Games",
    routes: { print: false, cards: false, tents: false, play: true, kit: true },
    claimVerb: "TAKE THIS ONE",
    editor: tencandlesEditor,
    dice: "pool",
    spotlight: [
      { id: "concept", label: "Concept" },
      { id: "virtue", label: "Virtue" },
      { id: "vice", label: "Vice" },
      { id: "moment", label: "Moment" },
      { id: "brink", label: "Brink" },
      { id: "letters", label: "Letters" },
    ],
    // Ten Candles has no inspiration: hope comes from living your Moment.
    coins: false,
  },
};

type AnyOneShotLike =
  | (Pick<dnd5e.OneShot, "system" | "ruleset" | "level"> & { variants?: { level: number }[]; homebrew?: boolean })
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
  return os.system === "dnd5e" ? `${os.ruleset} rules${os.homebrew ? " · homebrew" : ""}` : SYSTEMS[os.system].badge;
}

/** Whether a one-shot has a page; static paths for system-specific pages use this. */
export function hasRoute(os: { system: SystemId }, route: keyof SystemRoutes): boolean {
  return SYSTEMS[os.system].routes[route];
}

/**
 * The inspiration coin at a table: Heroic Inspiration under the 2024 rules,
 * Inspiration under 2014, renamed or turned off per one-shot (`coins`), and
 * nothing in systems without one (Ten Candles).
 */
export function coinFor(os: { system: SystemId; ruleset?: string; coins?: { enabled?: boolean; name?: string; tossesPerAct?: number } }): CoinMeta | null {
  if (!SYSTEMS[os.system].coins || os.coins?.enabled === false) return null;
  const modern = os.ruleset !== "2014";
  return {
    name: os.coins?.name ?? (modern ? "Heroic Inspiration" : "Inspiration"),
    spend: modern ? "Spend it to reroll any one die you just rolled; use the new roll." : "Spend it for advantage on one attack, save or check.",
    tossesPerAct: os.coins?.tossesPerAct ?? 1,
  };
}
