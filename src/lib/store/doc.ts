import type { DocPath, OneShotDoc } from "@/lib/oneShotCheck";

/**
 * Pure helpers on the builder's document (no file I/O, safe in the browser):
 * how a OneShotDoc maps to the files the build reads, and the edits the
 * editor makes to it.
 */

export type { OneShotDoc, DocPath } from "@/lib/oneShotCheck";

/** Lowercase kebab, like every id in content. Also what keeps a slug or id from leaving its folder. */
export const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** First path segments the site already uses, so no one-shot can be published over them ("spells" is /admin/spells). */
export const RESERVED_SLUGS = ["admin", "api", "login", "logout", "fonts", "textures", "pdf", "favicon.ico", "_next", "404", "500", "spells"];

export function isSafeId(x: unknown): x is string {
  return typeof x === "string" && x.length <= 64 && SAFE_ID.test(x);
}

/** Why a slug can't be used for a one-shot, or null if it can. */
export function slugProblem(slug: unknown): string | null {
  if (!isSafeId(slug)) return "use lowercase letters, digits and single hyphens (at most 64)";
  if (RESERVED_SLUGS.includes(slug)) return `"${slug}" is already a page on the site`;
  return null;
}

/** "The Drowned Bell" → "the-drowned-bell". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A fresh, well-formed doc from anything (an import, an old draft). Unknown keys are kept. */
export function coerceDoc(x: unknown): OneShotDoc {
  const d = isObj(x) ? x : {};
  return {
    oneshot: isObj(d.oneshot) ? d.oneshot : {},
    cast: Array.isArray(d.cast) ? d.cast.filter(isObj) : [],
    variants: Array.isArray(d.variants)
      ? d.variants
          .filter(isObj)
          .map((v) => ({ level: Number(v.level), cast: Array.isArray(v.cast) ? v.cast.filter(isObj) : [] }))
          .filter((v) => Number.isInteger(v.level))
      : [],
  };
}

/** Does this look like an exported one-shot (as opposed to some other JSON)? */
export function looksLikeDoc(x: unknown): x is OneShotDoc {
  return isObj(x) && isObj(x.oneshot) && Array.isArray(x.cast);
}

/**
 * The doc as the build stores it: keeps the slug in step with the folder and
 * board order in step with the cast list. Doesn't touch anything else.
 */
export function normalizeDoc(doc: OneShotDoc, slug: string): OneShotDoc {
  return {
    oneshot: { ...doc.oneshot, slug },
    cast: doc.cast.map((c, i) => ({ ...c, order: i + 1 })),
    variants: doc.variants,
  };
}

/**
 * The files a doc becomes, relative to content/oneshots/<slug>/:
 * oneshot.json, characters/<id>.json and variants/<level>/<id>.json. Throws
 * on an id or level that isn't safe to use as a file name (validation
 * catches those first, with a friendlier message).
 */
export function docToFiles(doc: OneShotDoc, slug: string): Map<string, unknown> {
  if (!isSafeId(slug)) throw new Error(`unsafe slug "${slug}"`);
  const d = normalizeDoc(doc, slug);
  const files = new Map<string, unknown>([["oneshot.json", d.oneshot]]);
  for (const c of d.cast) {
    if (!isSafeId(c.id)) throw new Error(`character id "${String(c.id)}" can't be a file name`);
    const file = `characters/${c.id}.json`;
    if (files.has(file)) throw new Error(`two characters have the id "${c.id}"`);
    files.set(file, c);
  }
  for (const v of d.variants) {
    if (!Number.isInteger(v.level) || v.level < 1 || v.level > 20) throw new Error(`bad variant level "${v.level}"`);
    for (const c of v.cast) {
      if (!isSafeId(c.id)) throw new Error(`level ${v.level}: id "${String(c.id)}" can't be a file name`);
      files.set(`variants/${v.level}/${c.id}.json`, c);
    }
  }
  return files;
}

/** The reverse of docToFiles: cast in board order, variants in the order oneshot.json declares them. */
export function docFromFiles(files: Map<string, unknown>): OneShotDoc {
  const oneshot = files.get("oneshot.json");
  const cast: Record<string, unknown>[] = [];
  const byLevel = new Map<number, Record<string, unknown>[]>();
  for (const [file, value] of files) {
    if (!isObj(value)) continue;
    const ch = file.match(/^characters\/[^/]+\.json$/);
    const vr = file.match(/^variants\/(\d+)\/[^/]+\.json$/);
    if (ch) cast.push(value);
    else if (vr) byLevel.set(Number(vr[1]), [...(byLevel.get(Number(vr[1])) ?? []), value]);
  }
  const ord = (c: Record<string, unknown>) => (typeof c.order === "number" ? c.order : Number.MAX_SAFE_INTEGER);
  cast.sort((a, b) => ord(a) - ord(b) || String(a.id).localeCompare(String(b.id)));
  const declared = isObj(oneshot) && Array.isArray(oneshot.variants) ? (oneshot.variants as { level?: unknown }[]) : [];
  const rank = (level: number) => {
    const i = declared.findIndex((v) => v?.level === level);
    return i < 0 ? 1000 + level : i;
  };
  const castOrder = (id: unknown) => cast.findIndex((c) => c.id === id);
  const variants = [...byLevel.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([level, vc]) => ({ level, cast: vc.sort((a, b) => castOrder(a.id) - castOrder(b.id)) }));
  return { oneshot: isObj(oneshot) ? oneshot : {}, cast, variants };
}

// ---- Editing --------------------------------------------------------------

export function getAt(root: unknown, path: DocPath): unknown {
  let cur = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/**
 * A copy of `root` with `value` at `path`, creating objects and arrays on
 * the way. `undefined` removes the key (so an emptied optional field leaves
 * the JSON instead of being saved as "").
 */
export function setAt<T>(root: T, path: DocPath, value: unknown): T {
  if (path.length === 0) return value as T;
  const [k, ...rest] = path;
  const base: unknown = root ?? (typeof k === "number" ? [] : {});
  if (Array.isArray(base)) {
    const next = [...base];
    const i = Number(k);
    if (rest.length === 0 && value === undefined) next.splice(i, 1);
    else next[i] = setAt(next[i] ?? (typeof rest[0] === "number" ? [] : {}), rest, value);
    return next as T;
  }
  const obj = { ...(base as Record<string, unknown>) };
  if (rest.length === 0 && value === undefined) delete obj[k as string];
  else obj[k as string] = setAt(obj[k as string] ?? (typeof rest[0] === "number" ? [] : {}), rest, value);
  return obj as T;
}

/** Moves an array item; out-of-range moves are ignored. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Renames a character and every reference to them: ties, NPC fallbacks,
 * letters, core roles and their level-variant files.
 */
export function renameCharacterId(doc: OneShotDoc, from: string, to: string): OneShotDoc {
  if (from === to) return doc;
  const swap = (x: unknown) => (x === from ? to : x);
  const cast = doc.cast.map((c) => {
    const story = isObj(c.story) ? c.story : undefined;
    const ifu = isObj(c.ifUnclaimed) ? c.ifUnclaimed : undefined;
    return {
      ...c,
      id: swap(c.id),
      ...(story && {
        story: {
          ...story,
          ...(Array.isArray(story.ties) && { ties: story.ties.map((t) => (isObj(t) ? { ...t, to: swap(t.to) } : t)) }),
        },
      }),
      ...(ifu && {
        ifUnclaimed: {
          ...ifu,
          ...(Array.isArray(ifu.reassign) && {
            reassign: ifu.reassign.map((r) => (isObj(r) && Array.isArray(r.to) ? { ...r, to: r.to.map(swap) } : r)),
          }),
        },
      }),
    };
  });
  const os = doc.oneshot;
  const oneshot = {
    ...os,
    ...(Array.isArray(os.coreRoles) && { coreRoles: os.coreRoles.map(swap) }),
    ...(Array.isArray(os.letters) && { letters: os.letters.map((l) => (isObj(l) ? { ...l, to: swap(l.to) } : l)) }),
  };
  const variants = doc.variants.map((v) => ({ ...v, cast: v.cast.map((c) => ({ ...c, id: swap(c.id) })) }));
  return { oneshot, cast, variants };
}

/** Removes a character and the references that would now dangle (ties, letters, core roles, variant files). */
export function removeCharacter(doc: OneShotDoc, id: string): OneShotDoc {
  const keep = (x: unknown) => x !== id;
  const os = doc.oneshot;
  return {
    oneshot: {
      ...os,
      ...(Array.isArray(os.coreRoles) && { coreRoles: os.coreRoles.filter(keep) }),
      ...(Array.isArray(os.letters) && { letters: os.letters.filter((l) => !isObj(l) || l.to !== id) }),
    },
    cast: doc.cast
      .filter((c) => c.id !== id)
      .map((c) => {
        const story = isObj(c.story) ? c.story : undefined;
        const ifu = isObj(c.ifUnclaimed) ? c.ifUnclaimed : undefined;
        return {
          ...c,
          ...(story &&
            Array.isArray(story.ties) && { story: { ...story, ties: story.ties.filter((t) => !isObj(t) || t.to !== id) } }),
          // Heirs lose them; a beat with no heirs left goes.
          ...(ifu &&
            Array.isArray(ifu.reassign) && {
              ifUnclaimed: {
                ...ifu,
                reassign: ifu.reassign
                  .map((r) => (isObj(r) && Array.isArray(r.to) ? { ...r, to: r.to.filter(keep) } : r))
                  .filter((r) => !isObj(r) || !Array.isArray(r.to) || r.to.length > 0),
              },
            }),
        };
      }),
    variants: doc.variants.map((v) => ({ ...v, cast: v.cast.filter((c) => c.id !== id) })),
  };
}

/** A path as a DOM id / lookup key: ["cast", 2, "mech", "hp"] → "cast.2.mech.hp". */
export const pathKey = (path: DocPath) => path.join(".");
