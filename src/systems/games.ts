import type { GameRules } from "@/lib/game";
import type { OneShotWithCast, SystemId } from "@/lib/schema";
import { STEPS, tenCandlesGame, type TcState } from "./tencandles/game";

/**
 * Systems with live table play, and what the game API adds to each view from
 * content (only what the rules have made public). 5e has none yet; phase 5's
 * dice tray and spotlight would add an entry here.
 */
export interface GameEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rules: GameRules<any, any, any>;
  /** Content the table has earned the right to see, e.g. a module's read-aloud intro once it's been read. */
  extras(os: OneShotWithCast, state: unknown): Record<string, unknown>;
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
  },
};
