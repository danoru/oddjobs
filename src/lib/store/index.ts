import { DbSpellStore } from "./dbSpellStore";
import { DbStore } from "./dbStore";
import { FileStore } from "./fileStore";
import { storeKind } from "./kind";
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
  store ??= storeKind() === "db" ? new DbStore() : new FileStore();
  return store;
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
export { DbSpellStore } from "./dbSpellStore";
export { SpellBookStore, type SpellStore } from "./spellStore";
export { spellNameProblem } from "./spellName";
