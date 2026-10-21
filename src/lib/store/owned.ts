import { isAdmin, mayEdit, type Viewer } from "@/lib/accounts";
import type { OneShotDoc } from "@/lib/oneShotCheck";
import { StoreError, type OneShotStore, type OneShotSummary, type StoredOneShot, type WriteGate, type WriteResult } from "./types";

/**
 * A store as one person may use it: the only way the builder (its pages and
 * every /api/admin/oneshots route) reaches the FileStore or the DbStore.
 *
 * - Admins see and change everything.
 * - Authors see only the one-shots they own, and only they can save, publish,
 *   unpublish, discard, restore, duplicate or delete them. Someone else's
 *   one-shot reads as missing; writing to it is refused (403).
 * - A one-shot with no owner (everything from before accounts) is the
 *   admins' alone.
 * - Whoever creates a one-shot (new, import, duplicate) owns it.
 */
export class OwnedStore implements OneShotStore {
  constructor(
    private readonly inner: OneShotStore,
    readonly viewer: Viewer,
  ) {}

  gate(): WriteGate {
    return this.inner.gate();
  }

  private async may(slug: string): Promise<boolean> {
    return isAdmin(this.viewer) || mayEdit(this.viewer, await this.inner.owner(slug));
  }

  /** Writes to an existing one-shot: refused unless it's theirs (a missing one is the store's own 404). */
  private async mustOwn(slug: string): Promise<void> {
    if (await this.may(slug)) return;
    if (await this.inner.get(slug)) throw new StoreError("That one-shot belongs to someone else", 403);
    throw new StoreError(`"${slug}" doesn't exist`, 404);
  }

  async list(): Promise<OneShotSummary[]> {
    const all = await this.inner.list();
    return isAdmin(this.viewer) ? all : all.filter((s) => mayEdit(this.viewer, s.ownerId));
  }

  async get(slug: string): Promise<StoredOneShot | null> {
    return (await this.may(slug)) ? this.inner.get(slug) : null;
  }

  async owner(slug: string): Promise<string | null> {
    return (await this.may(slug)) ? this.inner.owner(slug) : null;
  }

  /** Only admins hand one-shots around. */
  async setOwner(slug: string, ownerId: string | null): Promise<void> {
    if (!isAdmin(this.viewer)) throw new StoreError("Only an admin can hand a one-shot to someone", 403);
    return this.inner.setOwner(slug, ownerId);
  }

  async saveDraft(slug: string, doc: OneShotDoc): Promise<WriteResult> {
    // Saving a draft under a slug nobody has yet creates it, owned by whoever saved it.
    if (await this.inner.get(slug)) await this.mustOwn(slug);
    return this.inner.saveDraft(slug, doc, this.viewer.id);
  }

  async publish(slug: string): Promise<WriteResult> {
    await this.mustOwn(slug);
    return this.inner.publish(slug);
  }

  async unpublish(slug: string): Promise<WriteResult> {
    await this.mustOwn(slug);
    return this.inner.unpublish(slug);
  }

  async discardDraft(slug: string): Promise<WriteResult> {
    await this.mustOwn(slug);
    return this.inner.discardDraft(slug);
  }

  async duplicate(from: string, to: string): Promise<WriteResult> {
    // Copying needs reading: only what they could open themselves.
    await this.mustOwn(from);
    return this.inner.duplicate(from, to, this.viewer.id);
  }

  async delete(slug: string): Promise<WriteResult> {
    await this.mustOwn(slug);
    return this.inner.delete(slug);
  }

  async import(slug: string, doc: OneShotDoc): Promise<WriteResult> {
    return this.inner.import(slug, doc, this.viewer.id);
  }

  async export(slug: string): Promise<OneShotDoc | null> {
    return (await this.may(slug)) ? this.inner.export(slug) : null;
  }

  get history(): OneShotStore["history"] {
    const h = this.inner.history?.bind(this.inner);
    return (
      h &&
      (async (slug: string) => {
        if (!(await this.may(slug))) throw new StoreError(`"${slug}" doesn't exist`, 404);
        return h(slug);
      })
    );
  }

  get restore(): OneShotStore["restore"] {
    const r = this.inner.restore?.bind(this.inner);
    return (
      r &&
      (async (slug: string, revisionId: string) => {
        await this.mustOwn(slug);
        return r(slug, revisionId);
      })
    );
  }
}
