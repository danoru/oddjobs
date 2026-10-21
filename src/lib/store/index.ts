import { DbSpellStore } from "./dbSpellStore";
import { DbStore } from "./dbStore";
import { FileStore } from "./fileStore";
import { storeKind } from "./kind";
import { OwnedStore } from "./owned";
import { DbOwnerBook } from "./owners";
import type { Viewer } from "@/lib/accounts";
import { SpellBookStore, type SpellStore } from "./spellStore";
import type { OneShotStore } from "./types";

/**
 * The stores the builder uses, picked by TEAROFF_STORE: the FileStore by
 * default (JSON in content/, committed by hand), or with TEAROFF_STORE=db the
 * DbStore (Postgres, live as soon as it's published). The spell book follows
 * the same switch. Server-only.
 */
let store: OneShotStore | null = null;
let spellStore: SpellStore | null = null;

export function getStore(): OneShotStore {
  store ??= storeKind() === "db" ? new DbStore() : new FileStore({ owners: new DbOwnerBook() });
  return store;
}

/** The store as this person may use it (./owned.ts): what the builder always goes through. */
export function storeFor(viewer: Viewer, inner: OneShotStore = getStore()): OwnedStore {
  return new OwnedStore(inner, viewer);
}

/** The spell book the builder edits. */
export function getSpellStore(): SpellStore {
  spellStore ??= storeKind() === "db" ? new DbSpellStore() : new SpellBookStore();
  return spellStore;
}

export * from "./types";
export { storeKind, type StoreKind } from "./kind";
export { contentWriteGate, FileStore } from "./fileStore";
export { DbStore } from "./dbStore";
export { OwnedStore } from "./owned";
export { DbOwnerBook, MemoryOwnerBook, type OwnerBook } from "./owners";
export { DbSpellStore } from "./dbSpellStore";
export { SpellBookStore, type SpellStore } from "./spellStore";
export { spellNameProblem } from "./spellName";
