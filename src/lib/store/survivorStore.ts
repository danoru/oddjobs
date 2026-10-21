import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/prisma";
import { survivorFileSchema, survivorSchema, type Survivor } from "@/lib/legacy";
import { jsonEqual } from "./json";
import { StoreError } from "./types";

/**
 * The shared world in Postgres (TEAROFF_STORE=db): one `Survivor` row per
 * record, keyed by `<oneshot>/<character>/<date>`, as the epilogue makes
 * them. Saving the same night again updates its records, like re-downloading
 * the file did. content/legacy/*.json is the seed.
 */

/** Every record, oldest id first. A row that no longer passes the schema is skipped (and logged). */
export async function readSurvivors(client: PrismaClient = db()): Promise<Survivor[]> {
  const rows = await client.survivor.findMany({ orderBy: { id: "asc" } });
  const out: Survivor[] = [];
  for (const r of rows) {
    const parsed = survivorSchema.safeParse(r.data);
    if (parsed.success) out.push(parsed.data);
    else console.warn(`[legacy] skipping survivor ${r.id}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return out;
}

/**
 * Adds or updates records. Throws a StoreError (400) unless every one passes
 * the schema, writing nothing. With `overwrite: false` existing ids are left
 * alone (the import). Returns how many rows were written and skipped.
 */
export async function saveSurvivors(
  records: unknown,
  opts: { client?: PrismaClient; overwrite?: boolean } = {},
): Promise<{ saved: string[]; skipped: string[] }> {
  const parsed = survivorFileSchema.max(200).safeParse(records);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new StoreError(`Those aren't survivor records: ${i?.path.join(".") || "(list)"}: ${i?.message ?? "?"}`);
  }
  const client = opts.client ?? db();
  const overwrite = opts.overwrite ?? true;
  const existing = new Map(
    (await client.survivor.findMany({ where: { id: { in: parsed.data.map((s) => s.id) } } })).map((r) => [r.id, r.data]),
  );
  const saved: string[] = [];
  const skipped: string[] = [];
  const writes = [];
  for (const s of parsed.data) {
    const data = s as unknown as Prisma.InputJsonValue;
    if (existing.has(s.id) && (!overwrite || jsonEqual(existing.get(s.id), s))) {
      skipped.push(s.id);
      continue;
    }
    saved.push(s.id);
    writes.push(client.survivor.upsert({ where: { id: s.id }, create: { id: s.id, oneshot: s.oneshot, data }, update: { oneshot: s.oneshot, data } }));
  }
  if (writes.length) await client.$transaction(writes);
  return { saved, skipped };
}

/** Takes records out of the shared world (a night saved by mistake). Returns the ids that were there. */
export async function deleteSurvivors(ids: string[], client: PrismaClient = db()): Promise<string[]> {
  const there = await client.survivor.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (there.length) await client.survivor.deleteMany({ where: { id: { in: there.map((r) => r.id) } } });
  return there.map((r) => r.id);
}
