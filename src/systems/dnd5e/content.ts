import type { Character, OneShot } from "./schema";
import { totalLevel } from "./derive";
import { rulesCheck } from "./rules";

/**
 * 5e checks Zod can't see, per character: levels add up, the rules math
 * (src/systems/dnd5e/rules.ts), ruleset-only fields, and customization
 * options that tag exactly one entry. The shared checks (ties, ids, letters)
 * are in src/lib/content.ts.
 */
export function crossCheck(os: Pick<OneShot, "level" | "ruleset">, cast: Character[]): string[] {
  const errs: string[] = [];
  for (const c of cast) {
    const at = `${c.id}:`;
    if (totalLevel(c) !== os.level) errs.push(`${at} level ${totalLevel(c)} but one-shot is level ${os.level}`);
    else errs.push(...rulesCheck(c, os.ruleset));
    if (c.mech.saves.length !== 2) errs.push(`${at} expected 2 saving throw proficiencies`);
    if (os.ruleset === "2024" && !c.mech.originFeat) errs.push(`${at} 2024 characters need an originFeat`);
    if (os.ruleset === "2014" && c.mech.originFeat) errs.push(`${at} originFeat is a 2024 rule`);
    if (os.ruleset === "2014" && c.mech.weaponMasteries.length) errs.push(`${at} weapon masteries are a 2024 rule`);
    for (const e of c.mech.expertise)
      if (!c.mech.skills.includes(e)) errs.push(`${at} expertise in ${e} without proficiency`);

    for (const opt of c.options) {
      const tagged =
        opt.kind === "spell"
          ? (c.mech.spellcasting?.spells ?? []).filter((s) => s.option === opt.id).map((s) => s.name)
          : opt.kind === "attack"
            ? c.mech.attacks.filter((a) => a.option === opt.id).map((a) => a.name)
            : opt.kind === "equipment"
              ? c.mech.equipment.filter((e) => e.option === opt.id).map((e) => e.name)
              : opt.kind === "feature"
                ? c.mech.features.filter((f) => f.option === opt.id).map((f) => f.name)
                : c.story.trinket
                  ? [c.story.trinket]
                  : [];
      if (tagged.length !== 1) {
        errs.push(`${at} option "${opt.id}" must tag exactly one ${opt.kind} (found ${tagged.length})`);
        continue;
      }
      if (opt.kind === "spell") {
        const atk = c.mech.attacks.filter((a) => a.option === opt.id);
        const stock = opt.choices.find((ch) => ch.value.name === tagged[0]);
        if (atk.length > 1) errs.push(`${at} option "${opt.id}" tags more than one attack`);
        if (stock && Boolean(stock.attack) !== (atk.length === 1))
          errs.push(`${at} option "${opt.id}": stock choice attack and tagged attack disagree`);
      }
      const names = opt.choices.map((ch) => (typeof ch.value === "string" ? ch.value : ch.value.name));
      if (!names.includes(tagged[0])) errs.push(`${at} option "${opt.id}" has no choice matching stock "${tagged[0]}"`);
    }
  }
  return errs;
}
