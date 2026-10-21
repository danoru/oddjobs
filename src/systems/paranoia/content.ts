import type { Character, OneShot } from "./schema";
import { SKILL_KEYS } from "./schema";
import { cloneName } from "./derive";

/**
 * Paranoia checks Zod can't see: each Troubleshooter's skills follow the
 * draft (+1…+5 and −1…−5 once each, the rest 0), clone names are unique and
 * nobody starts past their sixth clone, and the naughty side is filled in.
 * Society, power and service-group names are free text (the GM's book wins;
 * ./rules.ts has suggestions). The shared checks are in src/lib/crossCheck.ts.
 */
export function crossCheck(os: Pick<OneShot, "announcements"> & { coreRoles?: string[] }, cast: Character[]): string[] {
  const errs: string[] = [];
  const names = new Map<string, string>();
  for (const c of cast) {
    const at = `${c.id}:`;
    const m = c.mech;
    const values = SKILL_KEYS.map((k) => m.skills[k]);
    const pos = values.filter((v) => v > 0).sort((a, b) => a - b);
    const neg = values.filter((v) => v < 0).sort((a, b) => b - a);
    if (pos.join() !== "1,2,3,4,5" || neg.join() !== "-1,-2,-3,-4,-5")
      errs.push(`${at} skills should be +1 to +5 and −1 to −5 once each, the rest 0 (got ${[...pos].reverse().map((v) => `+${v}`).join(" ") || "none"} / ${neg.join(" ") || "none"})`);
    const name = cloneName(m, 1).toLowerCase();
    if (names.has(name)) errs.push(`${at} clone name ${cloneName(m)} is already ${names.get(name)}'s`);
    names.set(name, c.name);
    if (!c.naughty.society.trim()) errs.push(`${at} naughty side: everyone is in a secret society`);
    if (!c.naughty.mutantPower.name.trim()) errs.push(`${at} naughty side: everyone is a mutant`);
    if (c.naughty.objectives.length === 0 && !c.naughty.societyObjective) errs.push(`${at} naughty side: give them at least one secret objective`);
    if (c.naughty.societyObjective && c.naughty.objectives.length >= 3) errs.push(`${at} naughty side: the society's objective takes one of the three secret objective lines`);
  }
  const ids = os.announcements.map((a) => a.id);
  if (new Set(ids).size !== ids.length) errs.push("duplicate announcement ids");
  return errs;
}
