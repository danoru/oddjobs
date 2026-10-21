import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/prisma";

/**
 * Who owns which one-shot, for the FileStore: content/ is in a public git
 * repo and accounts live in the database, so the owners do too
 * (`OneShotOwner`). No entry = admins only, which is everything that was in
 * git before accounts. (The DbStore keeps the owner on the row itself.)
 */
export interface OwnerBook {
  all(): Promise<Map<string, string>>;
  get(slug: string): Promise<string | null>;
  /** null forgets the owner (admins only). */
  set(slug: string, ownerId: string | null): Promise<void>;
}

export class DbOwnerBook implements OwnerBook {
  constructor(private readonly client: () => PrismaClient = db) {}

  async all() {
    const rows = await this.client().oneShotOwner.findMany();
    return new Map(rows.map((r) => [r.slug, r.ownerId]));
  }

  async get(slug: string) {
    return (await this.client().oneShotOwner.findUnique({ where: { slug } }))?.ownerId ?? null;
  }

  async set(slug: string, ownerId: string | null) {
    if (ownerId) await this.client().oneShotOwner.upsert({ where: { slug }, create: { slug, ownerId }, update: { ownerId } });
    else await this.client().oneShotOwner.deleteMany({ where: { slug } });
  }
}

/** For tests, and a FileStore made without the database. */
export class MemoryOwnerBook implements OwnerBook {
  private readonly owners = new Map<string, string>();

  async all() {
    return new Map(this.owners);
  }

  async get(slug: string) {
    return this.owners.get(slug) ?? null;
  }

  async set(slug: string, ownerId: string | null) {
    if (ownerId) this.owners.set(slug, ownerId);
    else this.owners.delete(slug);
  }
}
