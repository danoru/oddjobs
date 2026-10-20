import { z } from "zod";
import type { DocPath } from "@/lib/oneShotCheck";
import type { SystemId } from "@/lib/schema";
import * as dnd5e from "@/systems/dnd5e/schema";
import * as tencandles from "@/systems/tencandles/schema";
import * as daggerheart from "@/systems/daggerheart/schema";
import { getAt } from "@/lib/store/doc";
import type { FieldHint, Scope, SystemEditor } from "./types";

/**
 * Finds the Zod schema behind any place in a OneShotDoc, so the builder can
 * pick an input for it: ["cast", 2, "poster", "hook"] → a string with
 * max 90, described "Hook". Wrappers (optional, default) are peeled off and
 * remembered.
 */

const SCHEMAS: Record<SystemId, { oneshot: z.ZodTypeAny; character: z.ZodTypeAny; variant?: z.ZodTypeAny }> = {
  dnd5e: { oneshot: dnd5e.oneShotSchema, character: dnd5e.characterSchema, variant: dnd5e.variantCharacterSchema },
  tencandles: { oneshot: tencandles.oneShotSchema, character: tencandles.characterSchema },
  daggerheart: { oneshot: daggerheart.oneShotSchema, character: daggerheart.characterSchema },
};

export interface SchemaNode {
  /** The schema with optional/default/nullable peeled off. */
  schema: z.ZodTypeAny;
  optional: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  description?: string;
}

export function unwrap(s: z.ZodTypeAny): SchemaNode {
  let cur = s;
  let optional = false;
  let hasDefault = false;
  let defaultValue: unknown;
  let description = s.description;
  for (;;) {
    description ??= cur.description;
    if (cur instanceof z.ZodOptional || cur instanceof z.ZodNullable) {
      optional = true;
      cur = cur.unwrap();
    } else if (cur instanceof z.ZodDefault) {
      hasDefault = true;
      defaultValue = cur._def.defaultValue();
      cur = cur.removeDefault();
    } else if (cur instanceof z.ZodEffects) {
      cur = cur.innerType();
    } else break;
  }
  return { schema: cur, optional, hasDefault, defaultValue, description };
}

/** Which document a path is in, and the path inside it. */
export function scopeOf(path: DocPath): { scope: Scope; rel: DocPath; base: DocPath; kind: "oneshot" | "character" | "variant" } | null {
  if (path[0] === "oneshot") return { scope: "oneshot", rel: path.slice(1), base: ["oneshot"], kind: "oneshot" };
  if (path[0] === "cast" && path.length >= 2) return { scope: "character", rel: path.slice(2), base: path.slice(0, 2), kind: "character" };
  if (path[0] === "variants" && path[2] === "cast" && path.length >= 4)
    return { scope: "character", rel: path.slice(4), base: path.slice(0, 4), kind: "variant" };
  return null;
}

/** The schema node at a path; `doc` picks the branch of a discriminated union from its current value. */
export function schemaAt(system: SystemId, path: DocPath, doc?: unknown): SchemaNode | null {
  const where = scopeOf(path);
  const set = SCHEMAS[system];
  if (!where || !set) return null;
  const root = where.kind === "oneshot" ? set.oneshot : where.kind === "character" ? set.character : set.variant;
  if (!root) return null;
  let node = unwrap(root);
  for (let i = 0; i < where.rel.length; i++) {
    const key = where.rel[i];
    const s = node.schema;
    let next: z.ZodTypeAny | undefined;
    if (s instanceof z.ZodObject) next = (s.shape as Record<string, z.ZodTypeAny>)[key as string];
    else if (s instanceof z.ZodArray) next = typeof key === "number" ? s.element : undefined;
    else if (s instanceof z.ZodRecord) next = s.valueSchema;
    else if (s instanceof z.ZodDiscriminatedUnion) {
      const branch = unionBranch(s, getAt(doc, [...where.base, ...where.rel.slice(0, i)]));
      next = (branch.shape as Record<string, z.ZodTypeAny>)[key as string];
    }
    if (!next) return null;
    node = unwrap(next);
  }
  return node;
}

/** The branch of a discriminated union matching a value (the first one if nothing matches yet). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unionBranch(s: z.ZodDiscriminatedUnion<string, any>, value: unknown): z.AnyZodObject {
  const tag = value && typeof value === "object" ? (value as Record<string, unknown>)[s.discriminator] : undefined;
  return (s.optionsMap.get(tag as never) ?? s.options[0]) as z.AnyZodObject;
}

/** The `.max()` on a string, for the character counter. */
export function maxLength(s: z.ZodTypeAny): number | undefined {
  if (!(s instanceof z.ZodString)) return undefined;
  const check = s._def.checks.find((c) => c.kind === "max");
  return check && "value" in check ? (check.value as number) : undefined;
}

/** The `.min()` on an array (so "add at least one" can be said up front). */
export function minItems(s: z.ZodTypeAny): number | undefined {
  return s instanceof z.ZodArray ? (s._def.minLength?.value ?? undefined) : undefined;
}

/** "durationHrs" → "Duration hrs". */
export function humanize(key: string | number): string {
  const s = String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A path with list indexes as `*`, the way hints are keyed: ["cast", 2, "story", "ties", 0, "to"] → "story.ties.*.to". */
export function hintPattern(rel: DocPath): string {
  return rel.map((k) => (typeof k === "number" ? "*" : k)).join(".");
}

export function hintFor(editor: SystemEditor, path: DocPath): FieldHint {
  const where = scopeOf(path);
  if (!where) return {};
  const pattern = hintPattern(where.rel);
  return editor.hints[`${where.scope}:${pattern}`] ?? editor.hints[pattern] ?? {};
}

/** Keys of an object schema in order, minus the ones the builder handles itself. */
export function objectKeys(s: z.ZodTypeAny): string[] {
  return s instanceof z.ZodObject ? Object.keys(s.shape as object) : [];
}

/**
 * Fields of a scope that no section lists, for the catch-all "Other fields":
 * top-level keys nobody mentions, and the remaining keys of an object whose
 * other keys are listed one by one ("story.concept" listed, "story.newThing"
 * not). So a field added to the schema shows up before anyone files it.
 */
export function unlistedKeys(system: SystemId, scope: Scope, listed: string[], skip: string[]): string[] {
  const set = SCHEMAS[system];
  const root = unwrap(scope === "oneshot" ? set.oneshot : set.character).schema;
  const has = new Set(listed);
  const out: string[] = [];
  for (const k of objectKeys(root)) {
    if (skip.includes(k) || has.has(k)) continue;
    const children = listed.filter((p) => p.startsWith(`${k}.`));
    if (!children.length) {
      out.push(k);
      continue;
    }
    const inner = unwrap((root as z.AnyZodObject).shape[k]).schema;
    for (const c of objectKeys(inner)) if (!has.has(`${k}.${c}`) && !children.some((p) => p.startsWith(`${k}.${c}.`))) out.push(`${k}.${c}`);
  }
  return out;
}

export const schemasFor = (system: SystemId) => SCHEMAS[system];
