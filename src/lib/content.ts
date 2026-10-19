import fs from "node:fs";
import type { z } from "zod";
import path from "node:path";
import { oneShotSchema, type CoreCharacter, type OneShotWithCast } from "./schema";
import * as dnd5e from "@/systems/dnd5e/schema";
import * as tencandles from "@/systems/tencandles/schema";
import { checkParsed, type SpellBook } from "./oneShotCheck";
import { spellNames } from "@/systems/dnd5e/cards";

/**
 * Content lives in git as JSON:
 *   content/oneshots/<slug>/oneshot.json
 *   content/oneshots/<slug>/characters/<id>.json
 * Everything is parsed with Zod and cross-checked; any problem throws, which
 * fails `next build` rather than shipping a broken sheet. `oneshot.json` says
 * which game system it is, and its characters are parsed with that system's
 * schema. The checks themselves are pure (./oneShotCheck.ts), so the builder can
 * run them on a draft; this file only adds the reading from disk.
 */

export { coreCrossCheck, crossCheck, RESERVED_IDS } from "./crossCheck";

// Read only at build time (every page is SSG), so keep it out of server file tracing.
export const CONTENT_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "oneshots");
/** Paraphrased spell text for the 5e card printables. */
export const SPELL_BOOK = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "rules", "spells.json");

let book: Record<string, dnd5e.SpellInfo> | null = null;

export function loadSpellBook(file = SPELL_BOOK): Record<string, dnd5e.SpellInfo> {
  if (file !== SPELL_BOOK) return parse(dnd5e.spellBookSchema, file);
  book ??= parse(dnd5e.spellBookSchema, file);
  return book;
}

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

function readCast<S extends z.ZodTypeAny>(slug: string, dir: string, schema: S): z.infer<S>[] {
  const charDir = path.join(dir, "characters");
  const files = fs.existsSync(charDir) ? fs.readdirSync(charDir).filter((f) => f.endsWith(".json")) : [];
  const cast = files.map((f) => {
    const c = parse(schema, path.join(charDir, f)) as CoreCharacter;
    if (`${c.id}.json` !== f) throw new Error(`${slug}/characters/${f}: id "${c.id}" doesn't match filename`);
    return c;
  });
  return cast.sort((a, b) => a.order - b.order) as z.infer<S>[];
}

export function loadOneShot(slug: string, root = CONTENT_ROOT, spells: SpellBook = loadSpellBook()): OneShotWithCast {
  const dir = path.join(root, slug);
  const os = parse(oneShotSchema, path.join(dir, "oneshot.json"));
  if (os.slug !== slug) throw new Error(`${slug}/oneshot.json: slug "${os.slug}" doesn't match folder`);
  const fail = (errs: string[]) => {
    if (errs.length) throw new Error(`${slug} failed checks:\n  ${errs.join("\n  ")}`);
  };
  if (os.system === "tencandles") {
    const cast = readCast(slug, dir, tencandles.characterSchema);
    fail(checkParsed(os, cast, [], spells).map((e) => e.message));
    return { ...os, cast };
  }

  const cast = readCast(slug, dir, dnd5e.characterSchema);
  // Level variants: one file per character per declared level (the checks
  // that every level is complete and passes the rules are in checkParsed).
  const variants = os.variants.map((v) => {
    const vdir = path.join(dir, "variants", String(v.level));
    const vfiles = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith(".json")) : [];
    const chars: dnd5e.VariantCharacter[] = vfiles.map((f) => {
      const vc = parse(dnd5e.variantCharacterSchema, path.join(vdir, f));
      if (`${vc.id}.json` !== f) throw new Error(`${slug}/variants/${v.level}/${f}: id "${vc.id}" doesn't match filename`);
      return vc;
    });
    return { ...v, cast: chars };
  });
  const errs = checkParsed(
    os,
    cast,
    variants.map((v) => v.cast),
    spells,
  ).map((e) => e.message);
  const vroot = path.join(dir, "variants");
  if (fs.existsSync(vroot))
    for (const d of fs.readdirSync(vroot))
      if (!os.variants.some((v) => String(v.level) === d)) errs.push(`variants/${d} isn't declared in oneshot.json`);
  fail(errs);
  return { ...os, cast, variants };
}

/** A one-shot that must be 5e (for 5e-only pages, scripts and tests). */
export function load5e(slug: string, root = CONTENT_ROOT): dnd5e.OneShotWithCast {
  const os = loadOneShot(slug, root);
  if (os.system !== "dnd5e") throw new Error(`${slug} is a ${os.system} one-shot, not 5e`);
  return os;
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

/** Every published 5e one-shot. */
export function loadAll5e(root = CONTENT_ROOT): dnd5e.OneShotWithCast[] {
  return loadAll(root).filter((os): os is dnd5e.OneShotWithCast => os.system === "dnd5e");
}

function castsAtEveryLevel(os: Pick<dnd5e.OneShotWithCast, "cast" | "variants">) {
  return [os.cast, ...os.variants.map((v) => v.cast.map((x) => ({ ...x, options: x.options ?? [] })))];
}

/** Just the spells a 5e one-shot uses at any level, for its cards pages. */
export function spellBookFor(os: dnd5e.OneShotWithCast): Record<string, dnd5e.SpellInfo> {
  const all = loadSpellBook();
  return Object.fromEntries(spellNames(castsAtEveryLevel(os)).map((n) => [n, all[n]]));
}
