import { createContext, useContext } from "react";
import type { DocIssue, DocPath, OneShotDoc, SpellBook } from "@/lib/oneShotCheck";
import type { SystemId } from "@/lib/schema";
import type { SystemEditor } from "@/lib/editor/types";

/** What every field in the builder can reach: the draft, how to change it, and what's wrong with it. */
export interface EditorCtx {
  doc: OneShotDoc;
  system: SystemId;
  editor: SystemEditor;
  readOnly: boolean;
  /** Sets one value; `undefined` removes the key (or the list item). */
  set: (path: DocPath, value: unknown) => void;
  update: (fn: (doc: OneShotDoc) => OneShotDoc) => void;
  /** Issues by exact path key ("cast.2.mech.hp"). */
  issues: Map<string, DocIssue[]>;
  spells: SpellBook;
}

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor(): EditorCtx {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor outside the builder");
  return ctx;
}
