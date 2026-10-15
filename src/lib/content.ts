import fs from "node:fs";
import type { z } from "zod";
import path from "node:path";
import { characterSchema, oneShotSchema, type Character, type OneShot, type OneShotWithCast } from "./schema";
import { totalLevel } from "./derive";

/**
 * Content lives in git as JSON:
 *   content/oneshots/<slug>/oneshot.json
 *   content/oneshots/<slug>/characters/<id>.json
 * Everything is parsed with Zod and cross-checked; any problem throws, which
 * fails `next build` rather than shipping a broken sheet.
 */

// Read only at build time (every page is SSG), so keep it out of server file tracing.
export const CONTENT_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "oneshots");

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${path.relative(process.cwd(), file)}: ${(e as Error).message}`);
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, file: string): z.infer<S> {
  const res = schema.safeParse(readJson(file));
  if (!res.success) {
    const issues = res.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`${path.relative(process.cwd(), file)} is invalid:\n${issues}`);
  }
  return res.data;
}

/** Character ids that would collide with pages under /<oneshot>/. */
const RESERVED_IDS = ["print", "flyer"];

/** Problems that Zod alone can't see. Returns human-readable messages. */
export function crossCheck(os: OneShot, cast: Character[]): string[] {
  const errs: string[] = [];
  const ids = new Set(cast.map((c) => c.id));
  if (ids.size !== cast.length) errs.push("duplicate character ids");
  if (new Set(cast.map((c) => c.order)).size !== cast.length) errs.push("duplicate character order values");
  if (cast.length < os.players.min) errs.push(`only ${cast.length} characters for min ${os.players.min} players`);
  if (os.players.min > os.players.max) errs.push("players.min > players.max");

  for (const r of os.coreRoles) if (!ids.has(r)) errs.push(`coreRoles: no character "${r}"`);
  if (os.coreRoles.length > os.players.min) errs.push("more coreRoles than players.min");

  for (const c of cast) {
    const at = `${c.id}:`;
    if (RESERVED_IDS.includes(c.id)) errs.push(`${at} id clashes with the /${c.id} page`);
    if (totalLevel(c) !== os.level) errs.push(`${at} level ${totalLevel(c)} but one-shot is level ${os.level}`);
    if (c.mech.saves.length !== 2) errs.push(`${at} expected 2 saving throw proficiencies`);
    for (const t of c.story.ties) {
      if (t.to === c.id) errs.push(`${at} tie to self`);
      else if (!ids.has(t.to)) errs.push(`${at} tie to unknown character "${t.to}"`);
    }
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

export function loadOneShot(slug: string, root = CONTENT_ROOT): OneShotWithCast {
  const dir = path.join(root, slug);
  const os = parse(oneShotSchema, path.join(dir, "oneshot.json"));
  if (os.slug !== slug) throw new Error(`${slug}/oneshot.json: slug "${os.slug}" doesn't match folder`);
  const charDir = path.join(dir, "characters");
  const files = fs.existsSync(charDir) ? fs.readdirSync(charDir).filter((f) => f.endsWith(".json")) : [];
  const cast = files.map((f) => {
    const c = parse(characterSchema, path.join(charDir, f));
    if (`${c.id}.json` !== f) throw new Error(`${slug}/characters/${f}: id "${c.id}" doesn't match filename`);
    return c;
  });
  cast.sort((a, b) => a.order - b.order);
  const errs = crossCheck(os, cast);
  if (errs.length) throw new Error(`${slug} failed checks:\n  ${errs.join("\n  ")}`);
  return { ...os, cast };
}

export function listSlugs(root = CONTENT_ROOT): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "oneshot.json")))
    .map((d) => d.name)
    .sort();
}

/**
 * One-shots the site should show. Production builds fail on any broken
 * one-shot; in dev a half-written one is logged and skipped so the rest of
 * the board keeps working while you author.
 */
const warned = new Set<string>();

export function publishedSlugs(root = CONTENT_ROOT): string[] {
  const strict = process.env.NODE_ENV === "production";
  return listSlugs(root).filter((slug) => {
    try {
      loadOneShot(slug, root);
      return true;
    } catch (e) {
      if (strict) throw e;
      const msg = (e as Error).message;
      if (!warned.has(msg)) console.warn(`[content] skipping ${msg}`);
      warned.add(msg);
      return false;
    }
  });
}

export function loadAll(root = CONTENT_ROOT): OneShotWithCast[] {
  return publishedSlugs(root).map((s) => loadOneShot(s, root));
}
