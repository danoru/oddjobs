import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/prisma";
import { spellBookSchema, type SpellInfo } from "@/systems/dnd5e/schema";
import { coerceDoc } from "./doc";
import { checkSpellEntry, inUseError, spellsInDoc, type SpellStore } from "./spellStore";
import { jsonEqual } from "./json";
import { StoreError, type WriteGate, type WriteResult } from "./types";
import type { SpellBook } from "@/lib/oneShotCheck";

/**
 * The spell book in Postgres (TEAROFF_STORE=db): one `Spell` row per entry,
 * keyed by name. Same rules as the file: every entry passes the schema, a new
 * spell can't take a name that's in use, and a spell a one-shot still uses
 * (published or draft) can't be deleted. Writable wherever the database is;
 * the GM check stays in adminGuard.
 */

const byName = (a: string, b: string) => a.localeCompare(b, "en");

/** Every spell row as one book, in name order, checked against the schema. */
export async function readSpellBook(client: PrismaClient = db()): Promise<SpellBook> {
  const rows = await client.spell.findMany();
  rows.sort((a, b) => byName(a.name, b.name));
  const res = spellBookSchema.safeParse(Object.fromEntries(rows.map((r) => [r.name, r.info])));
  if (!res.success) {
    const i = res.error.issues[0];
    throw new StoreError(`the spell book in the database is invalid: ${i?.path.join(".") ?? "?"}: ${i?.message ?? "?"}`, 500);
  }
  return res.data;
}

export class DbSpellStore implements SpellStore {
  private readonly client: () => PrismaClient;

  constructor(opts: { client?: PrismaClient } = {}) {
    this.client = opts.client ? () => opts.client! : db;
  }

  gate(): WriteGate {
    return { writable: true, kind: "db" };
  }

  list(): Promise<SpellBook> {
    return readSpellBook(this.client());
  }

  async get(name: string): Promise<SpellInfo | null> {
    const book = await this.list();
    return Object.hasOwn(book, name) ? book[name] : null;
  }

  async usedBy(name: string): Promise<string[]> {
    const rows = await this.client().oneShot.findMany({ select: { slug: true, draft: true, published: true }, orderBy: { slug: "asc" } });
    return rows
      .filter((r) => [r.draft, r.published].some((d) => d !== null && spellsInDoc(coerceDoc(d)).has(name)))
      .map((r) => r.slug);
  }

  async put(name: string, info: unknown, opts: { create?: boolean } = {}): Promise<WriteResult> {
    const entry = checkSpellEntry(name, info);
    const spell = this.client().spell;
    const current = await spell.findUnique({ where: { name } });
    if (current && opts.create) throw new StoreError(`"${name}" is already in the spell book`, 409);
    if (current && jsonEqual(current.info, entry)) return { changed: [] };
    const json = entry as unknown as Prisma.InputJsonValue;
    await spell.upsert({ where: { name }, create: { name, info: json }, update: { info: json } });
    return { changed: [] };
  }

  async delete(name: string): Promise<WriteResult> {
    const spell = this.client().spell;
    if (!(await spell.findUnique({ where: { name } }))) throw new StoreError(`"${name}" isn't in the spell book`, 404);
    const users = await this.usedBy(name);
    if (users.length) throw inUseError(name, users);
    await spell.delete({ where: { name } });
    return { changed: [] };
  }
}
