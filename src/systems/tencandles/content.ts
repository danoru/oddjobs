import type { Character, OneShot } from "./schema";

/** Ten Candles checks Zod can't see. The shared ones (ties, ids, letters) are in src/lib/content.ts. */
export function crossCheck(os: OneShot, cast: Character[]): string[] {
  const errs: string[] = [];
  const areas = os.module.areas.map((a) => a.id);
  if (new Set(areas).size !== areas.length) errs.push("module: duplicate area ids");
  const stages = os.module.stages.map((s) => s.candles);
  if (new Set(stages).size !== stages.length) errs.push("module: two stages start at the same candle count");
  if (stages.some((n, i) => i > 0 && n > stages[i - 1])) errs.push("module: list stages from ten candles down");
  // Characters are made at the table; pre-mades are optional and nobody is required.
  if (os.coreRoles.length) errs.push("coreRoles: Ten Candles characters are made at the table, so none are required");
  if (os.players.min < 1 || os.players.max > 6) errs.push("players: Ten Candles plays with a handful of players");
  for (const c of cast) {
    if (c.story.namePrompts.includes(c.name)) errs.push(`${c.id}: name prompts repeat the name`);
  }
  return errs;
}
