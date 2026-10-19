import fs from "node:fs";
import path from "node:path";
import { spellBookSchema, spellInfoSchema, type SpellInfo } from "@/systems/dnd5e/schema";
import type { OneShotDoc, SpellBook } from "@/lib/oneShotCheck";
import { contentWriteGate, FileStore, writeFileAtomic } from "./fileStore";
import { formatJson, jsonEqual } from "./json";
import { StoreError, type WriteGate, type WriteResult } from "./types";
import { spellNameProblem } from "./spellName";

/**
 * The spell book, content/rules/spells.json: paraphrased card text for every
 * 5e spell a one-shot may use, keyed by name. The builder edits one entry at
 * a time, behind the same write gate as the one-shots, and the file is
 * rewritten atomically with its keys in alphabetical order.
 */

/** Every spell name a one-shot doc mentions, at any level and in any option. Lenient: drafts may be half-written. */
export function spellsInDoc(doc: OneShotDoc): Set<string> {
  const names = new Set<string>();
  const rec = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  const walk = (c: unknown) => {
    for (const s of list(rec(rec(rec(c).mech).spellcasting).spells)) if (typeof rec(s).name === "string") names.add(rec(s).name as string);
    for (const o of list(rec(c).options))
      if (rec(o).kind === "spell")
        for (const ch of list(rec(o).choices)) {
          const n = rec(rec(ch).value).name;
          if (typeof n === "string") names.add(n);
        }
  };
  doc.cast.forEach(walk);
  for (const v of doc.variants) list(v.cast).forEach(walk);
  return names;
}

const byName = (a: string, b: string) => a.localeCompare(b, "en");

export interface SpellBookStoreOptions {
  /** The content folder (holds rules/spells.json and the one-shots that use it). */
  root?: string;
  /** Defaults to contentWriteGate() on process.env. */
  gate?: () => WriteGate;
}

export class SpellBookStore {
  readonly root: string;
  readonly file: string;
  private readonly gateFn: () => WriteGate;

  constructor(opts: SpellBookStoreOptions = {}) {
    this.root = opts.root ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "content");
    this.file = path.join(this.root, "rules", "spells.json");
    this.gateFn = opts.gate ?? (() => contentWriteGate());
  }

  gate(): WriteGate {
    return this.gateFn();
  }

  private assertWritable() {
    const g = this.gate();
    if (!g.writable) throw new StoreError(g.reason ?? "writing is turned off", 403);
  }

  private get rel() {
    return "content/rules/spells.json";
  }

  /** The book as it is on disk, checked against the schema. */
  list(): SpellBook {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (e) {
      throw new StoreError(`spells.json isn't readable JSON: ${(e as Error).message}`, 500);
    }
    const res = spellBookSchema.safeParse(raw);
    if (!res.success) throw new StoreError(`spells.json is invalid: ${res.error.issues[0]?.message ?? "?"}`, 500);
    return res.data;
  }

  get(name: string): SpellInfo | null {
    const book = this.list();
    return Object.hasOwn(book, name) ? book[name] : null;
  }

  /** Which one-shots (published or draft) use this spell. */
  async usedBy(name: string): Promise<string[]> {
    const store = new FileStore({ root: this.root, gate: this.gateFn, spells: () => ({}) });
    const out: string[] = [];
    for (const { slug } of await store.list()) {
      const got = await store.get(slug);
      if ([got?.draft, got?.published].some((d) => d && spellsInDoc(d).has(name))) out.push(slug);
    }
    return out;
  }

  private write(book: SpellBook): WriteResult {
    const sorted = Object.fromEntries(Object.keys(book).sort(byName).map((k) => [k, book[k]]));
    spellBookSchema.parse(sorted);
    let current: unknown = null;
    try {
      current = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      /* missing or unreadable: write it */
    }
    if (jsonEqual(current, sorted)) return { changed: [] };
    writeFileAtomic(this.file, formatJson(sorted));
    return { changed: [this.rel] };
  }

  /**
   * Adds or replaces one entry. `create` refuses a name that's already taken,
   * so adding never silently overwrites an existing spell.
   */
  put(name: string, info: unknown, opts: { create?: boolean } = {}): WriteResult {
    this.assertWritable();
    const problem = spellNameProblem(name);
    if (problem) throw new StoreError(`spell name: ${problem}`);
    const parsed = spellInfoSchema.safeParse(info);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "entry"}: ${i.message}`).join("; ");
      throw new StoreError(`"${name}" isn't a valid spell: ${issues}`);
    }
    // An empty base `higher` says nothing, so it's left out. (In an edition block it means "no upcasting" and stays.)
    const { higher, ...rest } = parsed.data;
    const entry: SpellInfo = higher ? { ...rest, higher } : rest;
    const book = this.list();
    if (opts.create && Object.hasOwn(book, name)) throw new StoreError(`"${name}" is already in the spell book`, 409);
    return this.write({ ...book, [name]: entry });
  }

  /** Removes one entry, unless a one-shot still uses it (the build would fail). */
  async delete(name: string): Promise<WriteResult> {
    this.assertWritable();
    const book = this.list();
    if (!Object.hasOwn(book, name)) throw new StoreError(`"${name}" isn't in the spell book`, 404);
    const users = await this.usedBy(name);
    if (users.length) throw new StoreError(`"${name}" is used by ${users.join(", ")}; take it out of ${users.length === 1 ? "that one-shot" : "those one-shots"} first`, 409);
    const rest = { ...book };
    delete rest[name];
    return this.write(rest);
  }
}

let spellStore: SpellBookStore | null = null;

/** The spell book the builder edits (server-only). */
export function getSpellStore(): SpellBookStore {
  spellStore ??= new SpellBookStore();
  return spellStore;
}
