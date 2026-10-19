import type { z } from "zod";
import { oneShotSchema, SYSTEM_IDS, type CoreCharacter, type OneShotWithCast } from "./schema";
import * as dnd5e from "@/systems/dnd5e/schema";
import * as tencandles from "@/systems/tencandles/schema";
import { crossCheck } from "./crossCheck";
import { crossCheck as crossCheck5e } from "@/systems/dnd5e/content";
import { crossCheck as crossCheckTc } from "@/systems/tencandles/content";
import { withVariant } from "@/systems/dnd5e/variants";
import { spellNames } from "@/systems/dnd5e/cards";

/**
 * The whole check a one-shot goes through, without touching the disk: Zod on
 * every document, then crossCheck, then (5e) every level variant and the spell
 * book. The build's loader (src/lib/content.ts) reads the files and calls
 * `checkParsed`; the builder calls `checkDoc` on a draft as it's typed. Same
 * checks, so a draft that passes here publishes and builds.
 */

/** A one-shot as one document: what the builder edits and the store saves. Raw JSON, maybe invalid. */
export interface OneShotDoc {
  /** oneshot.json */
  oneshot: Record<string, unknown>;
  /** characters/<id>.json, in board order. */
  cast: Record<string, unknown>[];
  /** 5e level variants: variants/<level>/<id>.json for each level declared in `oneshot.variants`. */
  variants: { level: number; cast: Record<string, unknown>[] }[];
}

export type DocPath = (string | number)[];

export interface DocIssue {
  /** Where in the OneShotDoc, e.g. ["cast", 2, "mech", "hp"]. Empty when it's about the whole one-shot. */
  path: DocPath;
  message: string;
  /** "schema": a field is missing or malformed. "check": a cross-check (rules, ties, ids…). */
  kind: "schema" | "check";
}

export type SpellBook = Record<string, dnd5e.SpellInfo>;

type ParsedVariant = { level: number; note?: string; cast: dnd5e.VariantCharacter[] };

/**
 * Every check after Zod, on already-parsed documents. Returns the build's
 * messages, each with where it points. Spell checks are skipped when
 * `spells` is null.
 */
export function checkParsed(
  os: z.infer<typeof oneShotSchema>,
  cast: CoreCharacter[],
  variantCasts: dnd5e.VariantCharacter[][],
  spells: SpellBook | null,
): { message: string; path: DocPath }[] {
  const out: { message: string; path: DocPath }[] = [];
  const add = (messages: string[], scope?: number) =>
    out.push(
      ...messages
        .map((message) => ({ message, path: locate(message, os, cast, scope) }))
        // A level only swaps mechanics, so anything it finds elsewhere (a tie,
        // a letter) the base pass has already reported.
        .filter((x) => scope === undefined || x.path[0] === "variants" || (x.path[0] === "oneshot" && x.path[1] === "variants")),
    );

  add(safely(() => crossCheck(os, cast)));
  if (os.system !== "dnd5e") return out;

  const base = cast as dnd5e.Character[];
  const variants: ParsedVariant[] = os.variants.map((v, i) => ({ ...v, cast: variantCasts[i] ?? [] }));
  variants.forEach((v, vi) => {
    const shape: string[] = [];
    if (v.level === os.level) shape.push("variant repeats the base level");
    for (const c of base) if (!v.cast.some((x) => x.id === c.id)) shape.push(`no variants/${v.level}/${c.id}.json`);
    for (const x of v.cast) if (!base.some((c) => c.id === x.id)) shape.push(`${x.id} isn't in the cast`);
    const msgs = shape.map((e) => `level ${v.level}: ${e}`);
    if (shape.length === 0) {
      const merged = withVariant({ ...os, cast: base, variants: [v] }, v.level);
      msgs.push(...safely(() => crossCheck(merged, merged.cast)).map((e) => `level ${v.level}: ${e}`));
    }
    add(msgs, vi);
  });
  if (new Set(os.variants.map((v) => v.level)).size !== os.variants.length) add(["duplicate variant levels"]);

  // Every spell at every level needs card text.
  if (spells) {
    const levels = [base, ...variants.map((v) => v.cast.map((x) => ({ ...x, options: x.options ?? [] })))];
    for (const name of spellNames(levels))
      if (!spells[name])
        out.push({
          message: `spell "${name}" isn't in content/rules/spells.json (the cards need its text)`,
          path: whereIsSpell(name, base, variants),
        });
  }
  return out;
}

/** Run every check on a draft. `parsed` is the loaded one-shot when there are no issues at all. */
export function checkDoc(doc: OneShotDoc, spells: SpellBook | null): { issues: DocIssue[]; parsed: OneShotWithCast | null } {
  const issues: DocIssue[] = [];
  const schemaIssues = (res: z.SafeParseReturnType<unknown, unknown>, at: DocPath) => {
    if (!res.success)
      for (const i of res.error.issues) issues.push({ path: [...at, ...i.path], message: i.message, kind: "schema" });
  };

  const system = doc.oneshot?.system;
  if (!(SYSTEM_IDS as readonly unknown[]).includes(system)) {
    issues.push({ path: ["oneshot", "system"], message: `unknown system "${String(system)}"`, kind: "schema" });
    return { issues, parsed: null };
  }
  const osRes = oneShotSchema.safeParse(doc.oneshot);
  schemaIssues(osRes, ["oneshot"]);

  const charSchema = system === "dnd5e" ? dnd5e.characterSchema : tencandles.characterSchema;
  const castRes = (doc.cast ?? []).map((c, i) => {
    const r = charSchema.safeParse(c);
    schemaIssues(r, ["cast", i]);
    return r;
  });
  const variantRes = (doc.variants ?? []).map((v, vi) =>
    (v.cast ?? []).map((c, j) => {
      const r = dnd5e.variantCharacterSchema.safeParse(c);
      schemaIssues(r, ["variants", vi, "cast", j]);
      return r;
    }),
  );
  if (issues.length) {
    // Something doesn't parse yet. The system's own checks are per character
    // (levels, HP, slots…), so run them on the characters that do parse, as
    // long as the bits of the one-shot they need are there. The checks across
    // the cast (ties, letters, ids) wait until everything parses.
    const ok = castRes.flatMap((r) => (r.success ? [r.data as CoreCharacter] : []));
    const raw = doc.oneshot;
    const level5e = dnd5e.oneShotSchema.pick({ level: true, ruleset: true }).safeParse(raw);
    const own = safely(() =>
      system === "dnd5e"
        ? level5e.success
          ? crossCheck5e(level5e.data, ok as dnd5e.Character[])
          : []
        : osRes.success && osRes.data.system === "tencandles"
          ? crossCheckTc(osRes.data, ok as tencandles.Character[])
          : [],
    );
    const forLocate = (osRes.success ? osRes.data : { ...raw, letters: [] }) as z.infer<typeof oneShotSchema>;
    for (const message of own)
      issues.push({ message, path: remapCast(locate(message, forLocate, ok), ok, doc), kind: "check" });
    return { issues, parsed: null };
  }
  if (!osRes.success) return { issues, parsed: null };

  const os = osRes.data;
  const cast = castRes.map((r) => (r as z.SafeParseSuccess<CoreCharacter>).data).sort((a, b) => a.order - b.order);
  // Variant files line up with the declared levels by level, not by position.
  const declared = os.system === "dnd5e" ? os.variants : [];
  const variantCasts = declared.map((v) => {
    const vi = (doc.variants ?? []).findIndex((x) => x.level === v.level);
    return vi < 0 ? [] : variantRes[vi].map((r) => (r as z.SafeParseSuccess<dnd5e.VariantCharacter>).data);
  });
  for (const v of doc.variants ?? [])
    if (!declared.some((d) => d.level === v.level))
      issues.push({ path: ["variants"], message: `variants/${v.level} isn't declared in oneshot.json`, kind: "check" });

  const checks = checkParsed(os, cast, variantCasts, spells).map((c) => ({
    ...c,
    // The checks point at characters by board order; the doc keeps its own order.
    path: remapCast(c.path, cast, doc),
    kind: "check" as const,
  }));
  issues.push(...checks);
  if (issues.length) return { issues, parsed: null };

  const parsed: OneShotWithCast =
    os.system === "tencandles"
      ? { ...os, cast: cast as tencandles.Character[] }
      : { ...os, cast: cast as dnd5e.Character[], variants: declared.map((v, i) => ({ ...v, cast: variantCasts[i] })) };
  return { issues, parsed };
}

// ---- Pointing messages at fields --------------------------------------------

function safely(run: () => string[]): string[] {
  try {
    return run();
  } catch (e) {
    return [(e as Error).message];
  }
}

/** Board-order cast index → the doc's own index (they match once the doc is normalised). */
function remapCast(path: DocPath, cast: CoreCharacter[], doc: OneShotDoc): DocPath {
  if (path[0] === "cast" && typeof path[1] === "number") {
    const id = cast[path[1]]?.id;
    const i = doc.cast.findIndex((c) => c?.id === id);
    return i < 0 ? path : ["cast", i, ...path.slice(2)];
  }
  if (path[0] === "variants" && typeof path[1] === "number") {
    // Declared-level index → index in doc.variants.
    const declared = (doc.oneshot.variants as { level: number }[] | undefined) ?? [];
    const level = declared[path[1]]?.level;
    const vi = doc.variants.findIndex((v) => v.level === level);
    if (vi < 0) return ["oneshot", "variants"];
    const rest = path.slice(2);
    if (rest[0] === "cast" && typeof rest[1] === "string") {
      const j = doc.variants[vi].cast.findIndex((c) => c?.id === rest[1]);
      return j < 0 ? ["variants", vi] : ["variants", vi, "cast", j, ...rest.slice(2)];
    }
    return ["variants", vi, ...rest];
  }
  return path;
}

/** Character-level messages ("rook: HP 43, but…") → the field they're about. */
function charField(rest: string, c: Partial<dnd5e.Character> & Partial<tencandles.Character>): DocPath {
  if (/^level \d+ but one-shot is level/.test(rest) || /hit die/.test(rest)) return ["mech", "classes"];
  if (/^HP /.test(rest)) return ["mech", "hp"];
  if (/^spell slots/.test(rest)) return ["mech", "spellcasting", "slots"];
  if (/pact/.test(rest)) return ["mech", "spellcasting", "pact"];
  if (/above their highest slot/.test(rest)) {
    const name = rest.split(" is level")[0];
    const i = c.mech?.spellcasting?.spells.findIndex((s) => s.name === name) ?? -1;
    return i < 0 ? ["mech", "spellcasting", "spells"] : ["mech", "spellcasting", "spells", i];
  }
  if (/saving throw/.test(rest)) return ["mech", "saves"];
  if (/originFeat/.test(rest)) return ["mech", "originFeat"];
  if (/weapon masteries/.test(rest)) return ["mech", "weaponMasteries"];
  if (/^expertise/.test(rest)) return ["mech", "expertise"];
  const opt = rest.match(/^option "([^"]+)"/);
  if (opt) {
    const i = (c.options ?? []).findIndex((o) => o.id === opt[1]);
    return i < 0 ? ["options"] : ["options", i];
  }
  const tie = rest.match(/^tie to (?:unknown character )?"?([a-z0-9-]*)"?/);
  if (/^tie /.test(rest)) {
    const ties = c.story?.ties ?? [];
    const i = tie?.[1] ? ties.findIndex((t) => t.to === tie[1]) : -1;
    return i < 0 ? ["story", "ties"] : ["story", "ties", i, "to"];
  }
  if (/^ifUnclaimed/.test(rest)) return ["ifUnclaimed", "reassign"];
  if (/^id clashes/.test(rest)) return ["id"];
  if (/^name prompts/.test(rest)) return ["story", "namePrompts"];
  return [];
}

/**
 * Where a check message points. Character messages start with the id
 * ("rook: …"); variant ones with "level 3: ". `variant` is the declared-level
 * index for messages from that level's pass.
 */
function locate(message: string, os: z.infer<typeof oneShotSchema>, cast: CoreCharacter[], variant?: number): DocPath {
  let rest = message;
  const lv = message.match(/^level (\d+): (.*)$/);
  if (lv && variant !== undefined) {
    rest = lv[2];
    if (/^no variants\//.test(rest) || /isn't in the cast$/.test(rest)) return ["variants", variant];
    if (/variant repeats the base level/.test(rest)) return ["oneshot", "variants", variant, "level"];
  }
  const m = rest.match(/^([a-z0-9-]+): (.*)$/);
  const ci = m ? cast.findIndex((c) => c.id === m[1]) : -1;
  if (m && ci >= 0) {
    const field = charField(m[2], cast[ci] as never);
    if (lv && variant !== undefined) {
      // Mechanics at another level live in that level's file.
      return field[0] === "mech" || field[0] === "options" ? ["variants", variant, "cast", m[1], ...field] : ["cast", ci, ...field];
    }
    return ["cast", ci, ...field];
  }
  if (/^coreRoles/.test(rest)) return ["oneshot", "coreRoles"];
  if (/^module: .*area/.test(rest)) return ["oneshot", "module", "areas"];
  if (/^module/.test(rest)) return ["oneshot", "module", "stages"];
  if (/^players/.test(rest)) return ["oneshot", "players"];
  const letter = rest.match(/letter (?:id )?"([^"]+)"/);
  if (letter) {
    const i = os.letters.findIndex((l) => l.id === letter[1]);
    return i < 0 ? ["oneshot", "letters"] : ["oneshot", "letters", i, /addressed/.test(rest) ? "to" : "id"];
  }
  if (/sound ids/.test(rest)) return ["oneshot", "sounds"];
  if (/^duplicate variant levels/.test(rest)) return ["oneshot", "variants"];
  if (/characters for min|duplicate character/.test(rest)) return ["cast"];
  return [];
}

function whereIsSpell(name: string, base: dnd5e.Character[], variants: ParsedVariant[]): DocPath {
  const find = (c: Pick<dnd5e.Character, "mech" | "options">): DocPath | null => {
    const i = c.mech.spellcasting?.spells.findIndex((s) => s.name === name) ?? -1;
    if (i >= 0) return ["mech", "spellcasting", "spells", i, "name"];
    const o = (c.options ?? []).findIndex((x) => x.kind === "spell" && x.choices.some((ch) => ch.value.name === name));
    return o >= 0 ? ["options", o] : null;
  };
  for (const [ci, c] of base.entries()) {
    const at = find(c);
    if (at) return ["cast", ci, ...at];
  }
  for (const [vi, v] of variants.entries())
    for (const c of v.cast) {
      const at = find({ mech: c.mech, options: c.options ?? [] });
      if (at) return ["variants", vi, "cast", c.id, ...at];
    }
  return [];
}
