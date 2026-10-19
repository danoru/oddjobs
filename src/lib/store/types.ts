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
}

export interface StoredOneShot {
  slug: string;
  status: OneShotStatus;
  draft: OneShotDoc | null;
  published: OneShotDoc | null;
  updatedAt: string;
}

/** What a write touched, for the "files changed, remember to commit" note. Paths are repo-relative. */
export interface WriteResult {
  changed: string[];
}

export interface WriteGate {
  writable: boolean;
  /** Why writes are off, in words for the builder's banner. */
  reason?: string;
}

export interface OneShotStore {
  /** Whether this store may write right now, and if not why. */
  gate(): WriteGate;
  list(): Promise<OneShotSummary[]>;
  get(slug: string): Promise<StoredOneShot | null>;
  /** Creates or replaces the draft. The doc's slug is forced to `slug`. */
  saveDraft(slug: string, doc: OneShotDoc): Promise<WriteResult>;
  /** Fails with PublishError, writing nothing, unless the draft passes every check. */
  publish(slug: string): Promise<WriteResult>;
  /** Takes it off the board and keeps it as a draft. */
  unpublish(slug: string): Promise<WriteResult>;
  /** Drops the draft, keeping the published version. */
  discardDraft(slug: string): Promise<WriteResult>;
  /** Copies the newest version of `from` to a new draft `to`. */
  duplicate(from: string, to: string): Promise<WriteResult>;
  /** Removes draft and published version. */
  delete(slug: string): Promise<WriteResult>;
  /** Saves an exported doc as a new draft. */
  import(slug: string, doc: OneShotDoc): Promise<WriteResult>;
  /** The newest version (draft, else published) as one JSON document. */
  export(slug: string): Promise<OneShotDoc | null>;
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
