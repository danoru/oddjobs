import { FileStore } from "./fileStore";
import type { OneShotStore } from "./types";

/**
 * The store the builder uses. Today that's always the FileStore (JSON in
 * content/, committed by hand). A DbStore implementing the same interface
 * can be chosen here later, e.g. by an env var; docs/PLAN.md has the plan.
 * Server-only: it reads and writes files.
 */
let store: OneShotStore | null = null;

export function getStore(): OneShotStore {
  store ??= new FileStore();
  return store;
}

export * from "./types";
export { contentWriteGate, FileStore } from "./fileStore";
export { getSpellStore, SpellBookStore } from "./spellStore";
export { spellNameProblem } from "./spellName";
