import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkDoc, type OneShotDoc, type SpellBook } from "@/lib/oneShotCheck";
import { loadOneShot, loadSpellBook } from "@/lib/content";
import { coerceDoc, docFromFiles, docToFiles, isSafeId, normalizeDoc, slugProblem } from "./doc";
import { formatJson, jsonEqual } from "./json";
import {
  PublishError,
  StoreError,
  type OneShotStatus,
  type OneShotStore,
  type OneShotSummary,
  type StoredOneShot,
  type WriteGate,
  type WriteResult,
} from "./types";

/**
 * One-shots as JSON files in git, exactly where the build reads them:
 *
 *   content/oneshots/<slug>/oneshot.json, characters/<id>.json, variants/<level>/<id>.json
 *   content/drafts/<slug>/draft.json      (the whole doc in one file; may be invalid)
 *
 * The build (publishedSlugs) only looks in content/oneshots, so drafts never
 * reach the board. Every file is written to a temp file and renamed into
 * place. Slugs and ids are checked before they go anywhere near a path.
 * Writing only happens when the gate allows it: a local dev server, or
 * TEAROFF_CONTENT_WRITE=1. You commit the files yourself.
 */

const DRAFT_FILE = "draft.json";

/** When the builder may write content files. */
export function contentWriteGate(env: Partial<Record<string, string>> = process.env): WriteGate {
  const kind = "files" as const;
  if (env.VERCEL)
    return {
      writable: false,
      kind,
      reason:
        "This is the deployed site, and its one-shots are files baked into the build (its disk is read-only). To edit here, move the content into the database: set TEAROFF_STORE=db in Vercel and run the import (see the README). Or edit on your own machine (pnpm dev), commit the files and push.",
    };
  if (env.TEAROFF_CONTENT_WRITE === "1") return { writable: true, kind };
  if (env.TEAROFF_CONTENT_WRITE === "0") return { writable: false, kind, reason: "TEAROFF_CONTENT_WRITE=0 turns writing off." };
  if (env.NODE_ENV === "development") return { writable: true, kind };
  return {
    writable: false,
    kind,
    reason:
      "This is a production build, so the builder is read-only: one-shots are files in git (content/). Run the builder locally with pnpm dev (or set TEAROFF_CONTENT_WRITE=1 for a local production build), then commit and push the files. With TEAROFF_STORE=db they live in the database instead, and the builder can write anywhere.",
  };
}

const retryable = (e: unknown) => ["EPERM", "EBUSY", "EACCES"].includes((e as NodeJS.ErrnoException).code ?? "");

/** Write to a temp file beside the target, then rename over it, so a reader never sees half a file. */
export function writeFileAtomic(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, data, "utf8");
  // Windows refuses a rename while something (an editor, a file watcher) holds the target for a moment.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (!retryable(e) || attempt >= 8) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      const until = Date.now() + 25 * (attempt + 1);
      while (Date.now() < until) {
        /* brief wait */
      }
    }
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new StoreError(`${path.basename(file)} isn't readable JSON: ${(e as Error).message}`, 500);
  }
}

const jsonFiles = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes(".tmp-")) : [];

export interface FileStoreOptions {
  /** The content folder (holds oneshots/, drafts/ and rules/spells.json). */
  root?: string;
  /** Defaults to contentWriteGate() on process.env. */
  gate?: () => WriteGate;
  /** Defaults to <root>/rules/spells.json, else the repo's. */
  spells?: () => SpellBook;
}

export class FileStore implements OneShotStore {
  readonly root: string;
  private readonly gateFn: () => WriteGate;
  private readonly spellsFn: () => SpellBook;

  constructor(opts: FileStoreOptions = {}) {
    this.root = opts.root ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "content");
    this.gateFn = opts.gate ?? (() => contentWriteGate());
    const own = path.join(this.root, "rules", "spells.json");
    this.spellsFn = opts.spells ?? (() => (fs.existsSync(own) ? loadSpellBook(own) : loadSpellBook()));
  }

  gate(): WriteGate {
    return this.gateFn();
  }

  // ---- Paths ----

  private get publishedRoot() {
    return path.join(this.root, "oneshots");
  }
  private get draftsRoot() {
    return path.join(this.root, "drafts");
  }
  /** The folder for a slug, after making sure the slug can't climb out of it. */
  private dir(kind: "published" | "draft", slug: string): string {
    if (!isSafeId(slug)) throw new StoreError(`"${slug}" isn't a valid one-shot slug`);
    const base = kind === "published" ? this.publishedRoot : this.draftsRoot;
    const dir = path.join(base, slug);
    if (path.dirname(dir) !== base) throw new StoreError(`"${slug}" isn't a valid one-shot slug`);
    return dir;
  }
  /** As the repo sees it, forward slashes: "content/oneshots/x/oneshot.json". */
  private rel(file: string): string {
    return ["content", ...path.relative(this.root, file).split(path.sep)].join("/");
  }

  private assertWritable() {
    const g = this.gate();
    if (!g.writable) throw new StoreError(g.reason ?? "writing is turned off", 403);
  }

  // ---- Reading ----

  private readPublished(slug: string): OneShotDoc | null {
    const dir = this.dir("published", slug);
    if (!fs.existsSync(path.join(dir, "oneshot.json"))) return null;
    const files = new Map<string, unknown>([["oneshot.json", readJson(path.join(dir, "oneshot.json"))]]);
    for (const f of jsonFiles(path.join(dir, "characters"))) files.set(`characters/${f}`, readJson(path.join(dir, "characters", f)));
    const vroot = path.join(dir, "variants");
    if (fs.existsSync(vroot))
      for (const level of fs.readdirSync(vroot).filter((d) => /^\d+$/.test(d)))
        for (const f of jsonFiles(path.join(vroot, level)))
          files.set(`variants/${level}/${f}`, readJson(path.join(vroot, level, f)));
    return docFromFiles(files);
  }

  private readDraft(slug: string): OneShotDoc | null {
    const file = path.join(this.dir("draft", slug), DRAFT_FILE);
    return fs.existsSync(file) ? coerceDoc(readJson(file)) : null;
  }

  private mtime(file: string): number {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  }

  private slugs(): string[] {
    const under = (base: string, marker: string) =>
      fs.existsSync(base)
        ? fs
            .readdirSync(base, { withFileTypes: true })
            .filter((d) => d.isDirectory() && isSafeId(d.name) && fs.existsSync(path.join(base, d.name, marker)))
            .map((d) => d.name)
        : [];
    return [...new Set([...under(this.publishedRoot, "oneshot.json"), ...under(this.draftsRoot, DRAFT_FILE)])].sort();
  }

  async get(slug: string): Promise<StoredOneShot | null> {
    const draft = this.readDraft(slug);
    const published = this.readPublished(slug);
    if (!draft && !published) return null;
    const status: OneShotStatus = draft ? (published ? "changed" : "draft") : "published";
    const t = Math.max(
      this.mtime(path.join(this.dir("draft", slug), DRAFT_FILE)),
      this.mtime(path.join(this.dir("published", slug), "oneshot.json")),
    );
    return { slug, status, draft, published, updatedAt: new Date(t || Date.now()).toISOString() };
  }

  async list(): Promise<OneShotSummary[]> {
    const spells = this.spellsFn();
    const out: OneShotSummary[] = [];
    for (const slug of this.slugs()) {
      const got = await this.get(slug);
      if (!got) continue;
      const doc = got.draft ?? got.published!;
      out.push({
        slug,
        title: typeof doc.oneshot.title === "string" && doc.oneshot.title ? doc.oneshot.title : slug,
        system: String(doc.oneshot.system ?? "?"),
        status: got.status,
        castCount: doc.cast.length,
        updatedAt: got.updatedAt,
        issueCount: checkDoc(doc, spells).issues.length,
      });
    }
    return out;
  }

  async export(slug: string): Promise<OneShotDoc | null> {
    const got = await this.get(slug);
    return got ? (got.draft ?? got.published) : null;
  }

  // ---- Writing ----

  private writeDraft(slug: string, doc: OneShotDoc): string {
    const file = path.join(this.dir("draft", slug), DRAFT_FILE);
    const next = normalizeDoc(coerceDoc(doc), slug);
    if (fs.existsSync(file) && jsonEqual(readJson(file), next)) return this.rel(file);
    writeFileAtomic(file, formatJson(next));
    return this.rel(file);
  }

  private removeDir(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const gone: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else gone.push(this.rel(p));
      }
    };
    walk(dir);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    // Don't leave an empty content/drafts behind.
    const parent = path.dirname(dir);
    if (parent === this.draftsRoot && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    return gone;
  }

  async saveDraft(slug: string, doc: OneShotDoc): Promise<WriteResult> {
    this.assertWritable();
    this.dir("draft", slug);
    return { changed: [this.writeDraft(slug, doc)] };
  }

  async publish(slug: string): Promise<WriteResult> {
    this.assertWritable();
    const draft = this.readDraft(slug);
    if (!draft) throw new StoreError(`"${slug}" has no draft to publish`, 409);
    const problem = slugProblem(slug);
    if (problem) throw new StoreError(`can't publish as "${slug}": ${problem}`);
    const spells = this.spellsFn();
    const doc = normalizeDoc(draft, slug);
    const { issues } = checkDoc(doc, spells);
    if (issues.length) throw new PublishError(issues);
    const files = docToFiles(doc, slug);

    // The build's own loader has the last word: lay the files out in a scratch
    // folder and load them exactly as `next build` will.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-publish-"));
    try {
      for (const [rel, value] of files) writeFileAtomic(path.join(staging, slug, ...rel.split("/")), formatJson(value));
      try {
        loadOneShot(slug, staging, spells);
      } catch (e) {
        throw new PublishError([{ path: [], message: (e as Error).message, kind: "check" }]);
      }
    } finally {
      fs.rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
    }

    // Then sync into content/oneshots/<slug>, touching only files that changed.
    const dir = this.dir("published", slug);
    const changed: string[] = [];
    for (const [rel, value] of files) {
      const file = path.join(dir, ...rel.split("/"));
      if (fs.existsSync(file)) {
        let same = false;
        try {
          same = jsonEqual(JSON.parse(fs.readFileSync(file, "utf8")), value);
        } catch {
          /* unreadable: overwrite it */
        }
        if (same) continue;
      }
      writeFileAtomic(file, formatJson(value));
      changed.push(this.rel(file));
    }
    // Characters and variant levels that were removed in the draft.
    const stale = (sub: string, keep: (f: string) => boolean) => {
      for (const f of jsonFiles(path.join(dir, sub)))
        if (!keep(`${sub}/${f}`)) {
          fs.rmSync(path.join(dir, sub, f), { force: true });
          changed.push(this.rel(path.join(dir, sub, f)));
        }
    };
    stale("characters", (f) => files.has(f));
    const vroot = path.join(dir, "variants");
    if (fs.existsSync(vroot)) {
      for (const level of fs.readdirSync(vroot)) {
        stale(`variants/${level}`, (f) => files.has(f));
        const ldir = path.join(vroot, level);
        if (fs.existsSync(ldir) && fs.readdirSync(ldir).length === 0) fs.rmdirSync(ldir);
      }
      if (fs.readdirSync(vroot).length === 0) fs.rmdirSync(vroot);
    }
    changed.push(...this.removeDir(this.dir("draft", slug)));
    return { changed };
  }

  async unpublish(slug: string): Promise<WriteResult> {
    this.assertWritable();
    const published = this.readPublished(slug);
    if (!published) throw new StoreError(`"${slug}" isn't published`, 404);
    const changed: string[] = [];
    // A newer draft wins; otherwise the published version becomes the draft.
    if (!this.readDraft(slug)) changed.push(this.writeDraft(slug, published));
    changed.push(...this.removeDir(this.dir("published", slug)));
    return { changed };
  }

  async discardDraft(slug: string): Promise<WriteResult> {
    this.assertWritable();
    if (!this.readPublished(slug)) throw new StoreError(`"${slug}" was never published; delete it instead`, 409);
    return { changed: this.removeDir(this.dir("draft", slug)) };
  }

  private assertFree(slug: string) {
    const problem = slugProblem(slug);
    if (problem) throw new StoreError(`can't use "${slug}": ${problem}`);
    if (this.readDraft(slug) || this.readPublished(slug)) throw new StoreError(`"${slug}" already exists`, 409);
  }

  async duplicate(from: string, to: string): Promise<WriteResult> {
    this.assertWritable();
    const doc = await this.export(from);
    if (!doc) throw new StoreError(`"${from}" doesn't exist`, 404);
    this.assertFree(to);
    const title = typeof doc.oneshot.title === "string" ? doc.oneshot.title : from;
    return { changed: [this.writeDraft(to, { ...doc, oneshot: { ...doc.oneshot, title: `${title} (copy)` } })] };
  }

  async delete(slug: string): Promise<WriteResult> {
    this.assertWritable();
    if (!(await this.get(slug))) throw new StoreError(`"${slug}" doesn't exist`, 404);
    return { changed: [...this.removeDir(this.dir("draft", slug)), ...this.removeDir(this.dir("published", slug))] };
  }

  async import(slug: string, doc: OneShotDoc): Promise<WriteResult> {
    this.assertWritable();
    this.assertFree(slug);
    return { changed: [this.writeDraft(slug, doc)] };
  }
}
