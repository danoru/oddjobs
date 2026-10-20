import type { GameRules } from "@/lib/game";
import type { OneShotWithCast, SystemId } from "@/lib/schema";
import type { NewRow } from "@/lib/live";
import { STEPS, tenCandlesGame, type TcState } from "./tencandles/game";
import { mirrorTc } from "./tencandles/live";

/**
 * Systems with live table play, and what the game API adds to each view from
 * content (only what the rules have made public), and what each move adds
 * to the table's event log. 5e has none: its dice roll through the log.
 */
export interface GameEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rules: GameRules<any, any, any>;
  /** Content the table has earned the right to see, e.g. a module's read-aloud intro once it's been read. */
  extras(os: OneShotWithCast, state: unknown): Record<string, unknown>;
  /** Rows a move adds to the table's event log (src/lib/live.ts), from the state before and after. */
  mirror?(prev: unknown, next: unknown, os: OneShotWithCast, lastAct: number): NewRow[];
}

export const GAMES: Partial<Record<SystemId, GameEntry>> = {
  tencandles: {
    rules: tenCandlesGame,
    extras(os, state) {
      if (os.system !== "tencandles") return {};
      const s = state as TcState;
      const read = s.phase !== "lobby" && !(s.phase === "creation" && s.step !== null && STEPS.indexOf(s.step) < STEPS.indexOf("concept"));
      return { intro: read ? os.module.intro : null };
    },
    mirror: (prev, next, os, lastAct) =>
      mirrorTc(prev as TcState | null, next as TcState, os.system === "tencandles" ? { acts: os.acts, stages: os.module.stages, lastAct } : undefined),
  },
};
