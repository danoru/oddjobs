import type { DocIssue, OneShotDoc } from "@/lib/oneShotCheck";
import type { SystemId } from "@/lib/schema";

/**
 * Where one-shots live, as the builder sees them. The builder (pages, API)
 * only ever talks to this interface, so the FileStore that writes JSON into
 * content/ today can be swapped for a DbStore (one JSON document per
 * one-shot in Postgres) without touching the UI. docs/PLAN.md has that plan.
 *
 * A one-shot is published (what the board shows), a draft (only the
 * builder sees it), or both: published, with edits not yet published.
 * Drafts may be invalid; publishing requires every check to pass.
 *
 * Two stores implement it: the FileStore (JSON in content/, committed by
 * hand) and the DbStore (one row per one-shot in Postgres, live at once).
 * TEAROFF_STORE=db picks the DbStore (./index.ts).
 */

export type OneShotStatus = "draft" | "published" | "changed";

export interface OneShotSummary {
  slug: string;
  title: string;
  system: SystemId | string;
  status: OneShotStatus;
  castCount: number;
  /** ISO time of the newest draft or publish. */
  updatedAt: string;
  /** Problems in the version the builder would open (the draft if there is one). */
  issueCount: number;
  /** Who owns it (a user id), or null: admins only (everything from before accounts). */
  ownerId: string | null;
}

export interface StoredOneShot {
  slug: string;
  status: OneShotStatus;
  draft: OneShotDoc | null;
  published: OneShotDoc | null;
  updatedAt: string;
}

/** What a write touched, for the "files changed, remember to commit" note. Paths are repo-relative; the DbStore has none. */
export interface WriteResult {
  changed: string[];
}

export interface WriteGate {
  writable: boolean;
  /** Why writes are off, in words for the builder's banner. */
  reason?: string;
  /** Where writes land: files to commit, or the database (live as soon as they're published). */
  kind?: "files" | "db";
}

/** "save" | "publish" | "unpublish" | "import" | "discard" | "restore" */
export type RevisionAction = "save" | "publish" | "unpublish" | "import" | "discard" | "restore";

/** One entry in a one-shot's history, without its document. */
export interface RevisionSummary {
  id: string;
  action: RevisionAction | string;
  /** ISO time it was first written; autosaves within a minute share an entry, and `updatedAt` is the last of them. */
  createdAt: string;
  updatedAt: string;
  title: string;
  castCount: number;
}

/**
 * Ownership (phase 10): every one-shot has an owner, or none (admins only).
 * The stores only keep it; who may do what is decided by OwnedStore
 * (./owned.ts), which the builder always goes through. Writes that create a
 * one-shot take its owner, so the one-shot and its owner land together.
 */
export interface OneShotStore {
  /** Whether this store may write right now, and if not why. */
  gate(): WriteGate;
  list(): Promise<OneShotSummary[]>;
  get(slug: string): Promise<StoredOneShot | null>;
  /** The one-shot's owner, or null for none (or no such one-shot). */
  owner(slug: string): Promise<string | null>;
  /** Hands a one-shot to someone, or back to the admins (null). */
  setOwner(slug: string, ownerId: string | null): Promise<void>;
  /** Creates or replaces the draft. The doc's slug is forced to `slug`. `owner` owns it if this creates the one-shot. */
  saveDraft(slug: string, doc: OneShotDoc, owner?: string | null): Promise<WriteResult>;
  /** Fails with PublishError, writing nothing, unless the draft passes every check. */
  publish(slug: string): Promise<WriteResult>;
  /** Takes it off the board and keeps it as a draft. */
  unpublish(slug: string): Promise<WriteResult>;
  /** Drops the draft, keeping the published version. */
  discardDraft(slug: string): Promise<WriteResult>;
  /** Copies the newest version of `from` to a new draft `to`, owned by `owner`. */
  duplicate(from: string, to: string, owner?: string | null): Promise<WriteResult>;
  /** Removes draft and published version. */
  delete(slug: string): Promise<WriteResult>;
  /** Saves an exported doc as a new draft, owned by `owner`. */
  import(slug: string, doc: OneShotDoc, owner?: string | null): Promise<WriteResult>;
  /** The newest version (draft, else published) as one JSON document. */
  export(slug: string): Promise<OneShotDoc | null>;
  /** Saves and publishes, newest first. Only stores that keep a history have it (the FileStore's is git). */
  history?(slug: string): Promise<RevisionSummary[]>;
  /** Makes an earlier revision the draft again. Publishing it is a separate step. */
  restore?(slug: string, revisionId: string): Promise<WriteResult>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    /** HTTP status the API answers with. */
    readonly status: number = 400,
  ) {
    super(message);
  }
}

export class PublishError extends StoreError {
  constructor(readonly issues: DocIssue[]) {
    super(`fix ${issues.length} problem${issues.length === 1 ? "" : "s"} before publishing`, 422);
  }
}
