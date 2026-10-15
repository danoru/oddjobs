import { ABILITIES, type Character, type Ruleset } from "../schema";
import { ABILITY_NAMES, SKILL_NAMES, derive, ordinal, signed } from "../derive";

/**
 * D&D Beyond has no import, so we hand players a build recipe: the builder's
 * own steps, in its order, with every choice spelled out. Final ability scores
 * go in as overrides so we never have to reverse-engineer base scores.
 */

export interface RecipeStep {
  title: string;
  items: string[];
}

export function ddbRecipe(c: Character, ruleset: Ruleset): RecipeStep[] {
  const d = derive(c);
  const m = c.mech;
  const legacy = ruleset === "2014";
  const steps: RecipeStep[] = [];

  steps.push({
    title: "Start a character",
    items: [
      "Create → Standard builder.",
      legacy
        ? "Preferences: allow Legacy (2014) content; pick the 2014 versions of anything that has both."
        : "Preferences: use the 2024 Player's Handbook versions (not the ones marked Legacy).",
      "Preferences: Hit Point Type → Fixed. Ability Score Generation → Manual.",
      `Name: ${c.name}.`,
    ],
  });

  steps.push({
    title: "Class",
    items: [
      ...m.classes.map(
        (k, i) =>
          `${i === 0 ? "Add" : "Multiclass into"} ${k.name}, level ${k.level}${k.subclass ? ` → subclass ${k.subclass}` : ""}.`,
      ),
      `Skill picks: choose from your class list so you end with ${m.skills.map((s) => SKILL_NAMES[s]).join(", ")} (some come from your background${legacy ? "/race" : "/species"}).`,
      ...(m.expertise.length ? [`Expertise: ${m.expertise.map((s) => SKILL_NAMES[s]).join(", ")}.`] : []),
      ...(m.weaponMasteries.length ? [`Weapon Mastery: ${m.weaponMasteries.join(", ")}.`] : []),
      ...(m.feats.length ? [`Feat/ASI choices: ${m.feats.join("; ")}.`] : []),
      ...choicePicks(c),
    ],
  });

  steps.push({
    title: "Background",
    items: [
      `${m.background}.`,
      ...(m.originFeat ? [`Origin feat: ${m.originFeat}.`] : []),
      legacy
        ? "Any free proficiency/language picks: match the lists in the last step."
        : "Ability score increases: any split — you'll override the final scores in Abilities.",
    ],
  });

  steps.push({
    title: legacy ? "Race" : "Species",
    items: [
      `${m.species}${m.lineage ? ` — ${m.lineage}` : ""}.`,
      legacy ? "Ability score increases: any — you'll override the final scores next." : "Pick any lineage/ancestry option named in your features.",
    ],
  });

  steps.push({
    title: "Abilities",
    items: [
      "For each ability, open it and type the final score into Override Score:",
      ABILITIES.map((a) => `${ABILITY_NAMES[a]} ${m.abilities[a]} (${signed(d.mods[a])})`).join(" · "),
    ],
  });

  steps.push({
    title: "Equipment",
    items: [
      "Skip starting equipment, then add these from Manage Equipment:",
      ...m.equipment.map((e) => `${e.qty > 1 ? `${e.qty} × ` : ""}${e.name}${e.equipped ? " (equip it)" : ""}`),
      `Currency: ${m.gold} gp.`,
    ],
  });

  if (m.spellcasting) {
    const byLevel = new Map<number, string[]>();
    for (const sp of m.spellcasting.spells) byLevel.set(sp.level, [...(byLevel.get(sp.level) ?? []), sp.name]);
    steps.push({
      title: "Spells",
      items: [...byLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lvl, names]) => `${lvl === 0 ? "Cantrips" : `${ordinal(lvl)} level`}: ${names.join(", ")}`),
    });
  }

  steps.push({
    title: "Description",
    items: [
      `Pronouns/appearance: ${c.story.pronouns}. ${c.story.appearance}`,
      `Personality: ${c.story.voice} ${c.story.mannerisms.join(". ")}.`,
      `Backstory: ${c.story.concept}`,
      ...(c.story.trinket ? [`Trinket: ${c.story.trinket}`] : []),
    ],
  });

  steps.push({
    title: "Check it matches",
    items: [
      `HP ${m.hp} · AC ${m.ac.value} · Initiative ${signed(d.initiative)} · Passive Perception ${d.passive.perception}` +
        (d.spell ? ` · Spell DC ${d.spell.dc}` : ""),
      "If HP is off, use the HP override; if AC is off, check armour is equipped.",
    ],
  });

  return steps;
}

/** Features that read like builder choices (fighting styles, invocations, maneuvers…). */
function choicePicks(c: Character): string[] {
  const choicey = /^(Fighting Style|Eldritch Invocation|Maneuver|Metamagic|Pact of|Divine Order|Primal Order|Favored Enemy|Giant Ancestry|Fiendish Legacy|Elven Lineage|Draconic|Gnomish Lineage)/i;
  return c.mech.features.filter((f) => choicey.test(f.name)).map((f) => `Choose: ${f.name}.`);
}

export function recipeText(c: Character, ruleset: Ruleset): string {
  return [
    `${c.name} — D&D Beyond build recipe (${ruleset} rules)`,
    "",
    ...ddbRecipe(c, ruleset).flatMap((step, i) => [`${i + 1}. ${step.title}`, ...step.items.map((x) => `   - ${x}`), ""]),
  ].join("\n");
}
