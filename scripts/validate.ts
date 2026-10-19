/**
 * validate.ts — parse and cross-check every one-shot under content/oneshots.
 *
 *   pnpm validate            — all one-shots
 *   pnpm validate <slug>     — just one
 *
 * Every 5e level variant is checked too, and its key numbers printed under the base.
 *
 * Exits 1 on the first broken one-shot, printing every problem found in it.
 */
import { listSlugs, loadOneShot } from "../src/lib/content";
import { derive, classLine } from "../src/systems/dnd5e/derive";
import { levelsOf, withVariant } from "../src/systems/dnd5e/variants";

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : listSlugs();
let failed = false;
for (const slug of slugs) {
  try {
    const base = loadOneShot(slug);
    if (base.system === "tencandles") {
      const m = base.module;
      console.log(
        `ok  ${slug} (Ten Candles, ${m.areas.length} areas, ${m.stages.length} stages, ${base.cast.length} pre-mades, ${base.suggestedTruths.length} suggested truths, ${base.skin})`,
      );
      for (const c of base.cast) console.log(`    ${c.name.padEnd(22)} ${c.poster.header.padEnd(10)} ${c.story.concept.slice(0, 60)}`);
      continue;
    }
    const levels = levelsOf(base);
    console.log(
      `ok  ${slug} (${base.ruleset}, level ${levels.map((l) => l.level).join("/")}, ${base.cast.length} characters, ${base.skin})`,
    );
    for (const { level } of levels) {
      const os = withVariant(base, level);
      if (levels.length > 1) console.log(`  level ${level}${level === base.level ? " (as written)" : ""}`);
      for (const c of os.cast) {
        const d = derive(c);
        console.log(`    ${c.name.padEnd(22)} ${classLine(c).padEnd(36)} HP ${c.mech.hp}  AC ${c.mech.ac.value}  init ${d.initiative}  PP ${d.passive.perception}${d.spell ? `  DC ${d.spell.dc}` : ""}`);
      }
    }
  } catch (e) {
    failed = true;
    console.error(`FAIL ${slug}\n${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
