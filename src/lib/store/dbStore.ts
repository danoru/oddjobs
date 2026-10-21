import { Prisma, type OneShot, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/prisma";
import { checkDoc, type OneShotDoc, type SpellBook } from "@/lib/oneShotCheck";
import { coerceDoc, docToFiles, isSafeId, normalizeDoc, slugProblem } from "./doc";
import { readSpellBook } from "./dbSpellStore";
import { jsonEqual } from "./json";
import {
  PublishError,
  StoreError,
  type OneShotStatus,
  type OneShotStore,
  type OneShotSummary,
  type RevisionAction,
  type RevisionSummary,
  type StoredOneShot,
  type WriteGate,
  type WriteResult,
} from "./types";

/**
 * One-shots in Postgres (TEAROFF_STORE=db): one `OneShot` row per slug with
 * the builder's whole document as JSON, `draft` and `published`, plus a
 * history in `OneShotRevision`. Same behaviour as the FileStore: drafts may
 * be invalid, publishing runs the same checks (Zod, crossCheck, the rules,
 * level variants and the spell book, here the database's) and writes nothing
 * unless they all pass. It's writable wherever the database is, the deployed
 * site included; the GM-only check stays in adminGuard.
 *
 * Every write that changes a document leaves a revision. Autosaves within a
 * minute of the last one share it, and each one-shot keeps its newest
 * KEEP_REVISIONS.
 */

/** Autosaves this close to the newest revision (a save) update it instead of adding one. */
const COALESCE_MS = 60_000;
export const KEEP_REVISIONS = 50;

const json = (doc: OneShotDoc) => doc as unknown as Prisma.InputJsonValue;
const titleOf = (doc: OneShotDoc, slug: string) =>
  typeof doc.oneshot.title === "string" && doc.oneshot.title ? doc.oneshot.title : slug;
const statusOf = (draft: unknown, published: unknown): OneShotStatus =>
  draft !== null ? (published !== null ? "changed" : "draft") : "published";

export interface DbStoreOptions {
  /** Defaults to the app's shared client. */
  client?: PrismaClient;
  /** Defaults to the spell book in the same database. */
  spells?: () => Promise<SpellBook>;
  /** For tests: what time it is. */
  now?: () => Date;
}

export class DbStore implements OneShotStore {
  private readonly client: () => PrismaClient;
  private readonly spellsFn: () => Promise<SpellBook>;
  private readonly now: () => Date;

  constructor(opts: DbStoreOptions = {}) {
    this.client = opts.client ? () => opts.client! : db;
    this.spellsFn = opts.spells ?? (() => readSpellBook(this.client()));
    this.now = opts.now ?? (() => new Date());
  }

  gate(): WriteGate {
    return { writable: true, kind: "db" };
  }

  private slug(slug: string): string {
    if (!isSafeId(slug)) throw new StoreError(`"${slug}" isn't a valid one-shot slug`);
    return slug;
  }

  private async row(slug: string): Promise<OneShot | null> {
    return this.client().oneShot.findUnique({ where: { slug: this.slug(slug) } });
  }

  private stored(row: OneShot): StoredOneShot {
    const draft = row.draft === null ? null : coerceDoc(row.draft);
    const published = row.published === null ? null : coerceDoc(row.published);
    return { slug: row.slug, status: statusOf(row.draft, row.published), draft, published, updatedAt: row.updatedAt.toISOString() };
  }

  // ---- Reading ----

  async get(slug: string): Promise<StoredOneShot | null> {
    const row = await this.row(slug);
    return row ? this.stored(row) : null;
  }

  async list(): Promise<OneShotSummary[]> {
    const rows = await this.client().oneShot.findMany({ orderBy: { slug: "asc" } });
    if (!rows.length) return [];
    const spells = await this.spellsFn();
    return rows.map((row) => {
      const got = this.stored(row);
      const doc = got.draft ?? got.published!;
      return {
        slug: row.slug,
        title: titleOf(doc, row.slug),
        system: String(doc.oneshot.system ?? "?"),
        status: got.status,
        castCount: doc.cast.length,
        updatedAt: got.updatedAt,
        issueCount: checkDoc(doc, spells).issues.length,
      };
    });
  }

  async export(slug: string): Promise<OneShotDoc | null> {
    const got = await this.get(slug);
    return got ? (got.draft ?? got.published) : null;
  }

  async history(slug: string): Promise<RevisionSummary[]> {
    const rows = await this.client().oneShotRevision.findMany({
      where: { slug: this.slug(slug) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((r) => {
      const doc = coerceDoc(r.doc);
      return {
        id: r.id,
        action: r.action,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        title: titleOf(doc, slug),
        castCount: doc.cast.length,
      };
    });
  }

  // ---- Writing ----

  /** The row's new state plus its revision, written together. */
  private async write(
    slug: string,
    data: { draft: OneShotDoc | null; published: OneShotDoc | null; create?: boolean },
    revision: { action: RevisionAction; doc: OneShotDoc },
  ): Promise<WriteResult> {
    const client = this.client();
    const doc = data.draft ?? data.published!;
    const fields = {
      system: String(doc.oneshot.system ?? "?"),
      status: statusOf(data.draft, data.published),
      draft: data.draft === null ? Prisma.DbNull : json(data.draft),
      published: data.published === null ? Prisma.DbNull : json(data.published),
    };
    const row = data.create
      ? client.oneShot.create({ data: { slug, ...fields } })
      : client.oneShot.update({ where: { slug }, data: fields });

    // An autosave a moment after the last one updates that revision.
    const newest = await client.oneShotRevision.findFirst({ where: { slug }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const now = this.now();
    const coalesce =
      !data.create && revision.action === "save" && newest?.action === "save" && now.getTime() - newest.createdAt.getTime() < COALESCE_MS;
    const rev = coalesce
      ? client.oneShotRevision.update({ where: { id: newest!.id }, data: { doc: json(revision.doc), updatedAt: now } })
      : client.oneShotRevision.create({ data: { slug, action: revision.action, doc: json(revision.doc), createdAt: now, updatedAt: now } });
    await client.$transaction([row, rev]);
    if (!coalesce) await this.prune(slug);
    return { changed: [] };
  }

  private async prune(slug: string) {
    const client = this.client();
    const old = await client.oneShotRevision.findMany({
      where: { slug },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: KEEP_REVISIONS,
      select: { id: true },
    });
    if (old.length) await client.oneShotRevision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  }

  async saveDraft(slug: string, doc: OneShotDoc): Promise<WriteResult> {
    const row = await this.row(slug);
    const next = normalizeDoc(coerceDoc(doc), slug);
    if (row?.draft != null && jsonEqual(row.draft, next)) return { changed: [] };
    const published = row?.published == null ? null : coerceDoc(row.published);
    return this.write(slug, { draft: next, published, create: !row }, { action: "save", doc: next });
  }

  async publish(slug: string): Promise<WriteResult> {
    const row = await this.row(slug);
    if (row?.draft == null) throw new StoreError(`"${slug}" has no draft to publish`, 409);
    const problem = slugProblem(slug);
    if (problem) throw new StoreError(`can't publish as "${slug}": ${problem}`);
    const doc = normalizeDoc(coerceDoc(row.draft), slug);
    const { issues, parsed } = checkDoc(doc, await this.spellsFn());
    if (issues.length) throw new PublishError(issues);
    // The same last word the FileStore gets from laying out the files: ids that
    // can't be a file name can't be a URL either.
    try {
      docToFiles(doc, slug);
      if (!parsed) throw new Error("it doesn't parse");
    } catch (e) {
      throw new PublishError([{ path: [], message: (e as Error).message, kind: "check" }]);
    }
    return this.write(slug, { draft: null, published: doc }, { action: "publish", doc });
  }

  async unpublish(slug: string): Promise<WriteResult> {
    const row = await this.row(slug);
    if (row?.published == null) throw new StoreError(`"${slug}" isn't published`, 404);
    const published = coerceDoc(row.published);
    // A newer draft wins; otherwise the published version becomes the draft.
    const draft = row.draft == null ? published : coerceDoc(row.draft);
    return this.write(slug, { draft, published: null }, { action: "unpublish", doc: published });
  }

  async discardDraft(slug: string): Promise<WriteResult> {
    const row = await this.row(slug);
    if (row?.published == null) throw new StoreError(`"${slug}" was never published; delete it instead`, 409);
    if (row.draft == null) return { changed: [] };
    // The thrown-away draft stays in the history, so it can be restored.
    return this.write(slug, { draft: null, published: coerceDoc(row.published) }, { action: "discard", doc: coerceDoc(row.draft) });
  }

  private async assertFree(slug: string) {
    const problem = slugProblem(slug);
    if (problem) throw new StoreError(`can't use "${slug}": ${problem}`);
    if (await this.row(slug)) throw new StoreError(`"${slug}" already exists`, 409);
  }

  async duplicate(from: string, to: string): Promise<WriteResult> {
    const doc = await this.export(from);
    if (!doc) throw new StoreError(`"${from}" doesn't exist`, 404);
    await this.assertFree(to);
    const title = typeof doc.oneshot.title === "string" ? doc.oneshot.title : from;
    const copy = normalizeDoc({ ...doc, oneshot: { ...doc.oneshot, title: `${title} (copy)` } }, to);
    return this.write(to, { draft: copy, published: null, create: true }, { action: "import", doc: copy });
  }

  async delete(slug: string): Promise<WriteResult> {
    if (!(await this.row(slug))) throw new StoreError(`"${slug}" doesn't exist`, 404);
    // Its history goes with it (onDelete: Cascade).
    await this.client().oneShot.delete({ where: { slug } });
    return { changed: [] };
  }

  async import(slug: string, doc: OneShotDoc): Promise<WriteResult> {
    await this.assertFree(slug);
    const next = normalizeDoc(coerceDoc(doc), slug);
    return this.write(slug, { draft: next, published: null, create: true }, { action: "import", doc: next });
  }

  async restore(slug: string, revisionId: string): Promise<WriteResult> {
    const row = await this.row(slug);
    if (!row) throw new StoreError(`"${slug}" doesn't exist`, 404);
    const rev = await this.client().oneShotRevision.findFirst({ where: { id: revisionId, slug } });
    if (!rev) throw new StoreError("That revision isn't in this one-shot's history", 404);
    const doc = normalizeDoc(coerceDoc(rev.doc), slug);
    const published = row.published == null ? null : coerceDoc(row.published);
    return this.write(slug, { draft: doc, published }, { action: "restore", doc });
  }
}
