import type { DocPath, OneShotDoc } from "@/lib/oneShotCheck";

/**
 * How a game system describes its builder. Sections list fields as paths;
 * the editor finds each path in the system's Zod schema and picks the input
 * from the type (text, number, select, list…), the label from `.describe()`
 * and the counter from `.max()`. So adding a field to the builder is: add it
 * to the schema with `.describe("Label")`, then add its path to a section.
 * A field no section lists still shows up under "Other fields".
 *
 * `panel` names a hand-built panel (src/components/admin/panels) for things
 * a plain form can't do, like the 5e mechanics with live rules help.
 */

export type Scope = "oneshot" | "character";

export interface EditorSection {
  id: string;
  title: string;
  scope: Scope;
  /** Paths under doc.oneshot or the character, e.g. "poster.hook". */
  fields?: string[];
  /** A hand-built panel shown after the fields. */
  panel?: string;
  /** A line under the section title. */
  help?: string;
}

export type Widget =
  /** One line. */
  | "text"
  /** Grows as you type (the default for strings). */
  | "multiline"
  /** A list of short words as chips (tone, languages). */
  | "tags"
  /** Pick another cast member. */
  | "castRef"
  /** Pick cast members, in order. */
  | "castRefs"
  /** Pick one of the one-shot's act cards (or none). */
  | "actRef"
  /** The poster icon grid. */
  | "icon"
  /** The keepsake drawings grid. */
  | "keepsake"
  /** A sound preset with a play button. */
  | "sound"
  /** Free text with suggestions (`options`). */
  | "suggest"
  /** A 5e spell name from the spell book; picking one fills in its level. */
  | "spell"
  /** Shown, not editable. */
  | "readonly"
  | "hidden";

export interface FieldHint {
  label?: string;
  help?: string;
  widget?: Widget;
  placeholder?: string;
  /** Suggestions for "suggest" and "tags". */
  options?: string[];
  /** For lists of objects: what one item is called ("area", "letter"). */
  itemLabel?: string;
  /** For lists of objects and objects: the sub-fields to show, in order (default: all). */
  fields?: string[];
  /** For lists: a new item to add. */
  newItem?: (doc: OneShotDoc) => unknown;
  /** A soft warning under the field (doesn't block publishing), or null. */
  warn?: (value: unknown, doc: OneShotDoc, path: DocPath) => string | null;
  /** For items of a list: a one-line summary next to the item's title (e.g. an attack's to-hit). */
  summary?: (item: unknown, doc: OneShotDoc, path: DocPath) => string | null;
}

export interface SystemEditor {
  oneshotSections: EditorSection[];
  characterSections: EditorSection[];
  /**
   * Field hints by path pattern. Patterns start at the scope root, with `*`
   * for any list index: "story.ties.*.to", "letters.*.to". Prefix
   * "oneshot:" or "character:" to pin a scope; otherwise both are tried.
   */
  hints: Record<string, FieldHint>;
  /** A starting oneshot.json for a new one-shot. Leaves required words out so the checks ask for them. */
  newOneShot(slug: string, title: string): Record<string, unknown>;
  /** A starting character. */
  newCharacter(doc: OneShotDoc, id: string, name: string): Record<string, unknown>;
}
