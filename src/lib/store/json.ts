/**
 * JSON the way the hand-written content files look: objects open up one key
 * per line, but short values, lists of words and the objects inside lists
 * (ties, features, attacks) stay on one line. Keeps the files the builder
 * writes readable in a git diff.
 */

const WIDTH = 100;

function inline(v: unknown): string {
  if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(", ")}]` : "[]";
  if (v && typeof v === "object") {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

/** Holds a list of objects (which then go one per line) rather than plain values. */
const hasObjectList = (v: unknown): boolean =>
  Array.isArray(v)
    ? v.some((x) => x !== null && typeof x === "object")
    : v !== null && typeof v === "object" && Object.values(v).some(hasObjectList);

function format(v: unknown, indent: string, inList: boolean): string {
  const flat = inline(v);
  if (v === null || typeof v !== "object") return flat;
  // Objects inside lists stay on one line unless they hold lists of objects themselves.
  if (indent.length + flat.length <= WIDTH || (inList && !Array.isArray(v) && !hasObjectList(v))) return flat;
  const inner = indent + "  ";
  if (Array.isArray(v)) {
    if (!v.some((x) => x !== null && typeof x === "object")) return flat;
    return `[\n${v.map((x) => inner + format(x, inner, true)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner, false)}`).join(",\n")}\n${indent}}`;
}

export function formatJson(value: unknown): string {
  return format(value, "", false) + "\n";
}

/** Same JSON value (key order ignored), so unchanged files aren't rewritten. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => jsonEqual(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => jsonEqual(ao[k], bo[k]));
}
