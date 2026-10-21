import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/prisma";
import { loadSurvivors } from "@/lib/legacy.server";
import { DbSpellStore } from "./dbSpellStore";
import { DbStore } from "./dbStore";
import { FileStore } from "./fileStore";
import { jsonEqual } from "./json";
import { PublishError } from "./types";
import { SpellBookStore } from "./spellStore";
import { saveSurvivors } from "./survivorStore";

/**
 * Copying the content in git into the database (scripts/import-*.ts): the
 * spell book, the shared world's survivors and the one-shots, in that order
 * (publishing a one-shot checks its spells against the database's book).
 * Each skips what's already there unless `overwrite` is set, so running it
 * twice changes nothing. content/ stays in git as the seed and the backup.
 */

export interface ImportOptions {
  /** The content folder; defaults to the repo's. */
  root?: string;
  client?: PrismaClient;
  /** Replace what's already in the database with git's version. */
  overwrite?: boolean;
}

export interface ImportReport {
  written: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
}

const contentRoot = (o: ImportOptions) => o.root ?? path.join(process.cwd(), "content");
const empty = (): ImportReport => ({ written: [], skipped: [], failed: [] });

export async function importSpells(o: ImportOptions = {}): Promise<ImportReport> {
  const out = empty();
  const book = await new SpellBookStore({ root: contentRoot(o), gate: () => ({ writable: false }) }).list();
  const target = new DbSpellStore({ client: o.client });
  const have = await target.list();
  for (const [name, info] of Object.entries(book)) {
    if (Object.hasOwn(have, name) && (!o.overwrite || jsonEqual(have[name], info))) {
      out.skipped.push(name);
      continue;
    }
    try {
      await target.put(name, info);
      out.written.push(name);
    } catch (e) {
      out.failed.push({ name, error: (e as Error).message });
    }
  }
  return out;
}

export async function importSurvivors(o: ImportOptions = {}): Promise<ImportReport> {
  const records = loadSurvivors(path.join(contentRoot(o), "legacy"));
  if (!records.length) return empty();
  const { saved, skipped } = await saveSurvivors(records, { client: o.client ?? db(), overwrite: o.overwrite ?? false });
  return { written: saved, skipped, failed: [] };
}

/**
 * Every one-shot in content/oneshots (published) and content/drafts (drafts).
 * A published one goes in as an import and is then published, so it passes
 * the same checks as one written in the builder.
 */
export async function importOneShots(o: ImportOptions = {}): Promise<ImportReport> {
  const out = empty();
  const files = new FileStore({ root: contentRoot(o), gate: () => ({ writable: false }), spells: () => ({}) });
  const target = new DbStore({ client: o.client });
  for (const { slug } of await files.list()) {
    const git = (await files.get(slug))!;
    try {
      const have = await target.get(slug);
      if (have) {
        const same = jsonEqual(have.published, git.published) && jsonEqual(have.draft, git.draft);
        if (!o.overwrite || same) {
          out.skipped.push(slug);
          continue;
        }
        if (git.published) {
          await target.saveDraft(slug, git.published);
          await target.publish(slug);
        }
        if (git.draft) await target.saveDraft(slug, git.draft);
      } else {
        await target.import(slug, (git.published ?? git.draft)!);
        if (git.published) await target.publish(slug);
        if (git.published && git.draft) await target.saveDraft(slug, git.draft);
      }
      out.written.push(slug);
    } catch (e) {
      const error = e instanceof PublishError ? `${e.message}: ${e.issues.map((i) => i.message).join("; ")}` : (e as Error).message;
      out.failed.push({ name: slug, error });
    }
  }
  return out;
}

/** One line per kind for the scripts. */
export function describe(kind: string, r: ImportReport): string {
  const lines = [`${kind}: ${r.written.length} written, ${r.skipped.length} already there${r.failed.length ? `, ${r.failed.length} failed` : ""}`];
  for (const w of r.written) lines.push(`  + ${w}`);
  for (const f of r.failed) lines.push(`  ! ${f.name}: ${f.error}`);
  return lines.join("\n");
}
