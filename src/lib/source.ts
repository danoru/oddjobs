import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT, loadAll, loadOneShot, loadSpellBook, publishedSlugs, spellBookFrom } from "./content";
import { checkDoc, type SpellBook } from "./oneShotCheck";
import { loadSurvivors } from "./legacy.server";
import type { Survivor } from "./legacy";
import { db } from "./prisma";
import type { OneShotWithCast } from "./schema";
import type * as dnd5e from "@/systems/dnd5e/schema";
import { coerceDoc, isSafeId } from "./store/doc";
import { readSpellBook } from "./store/dbSpellStore";
import { readSurvivors } from "./store/survivorStore";
import { storeKind } from "./store/kind";

/**
 * What players (and the GM's table pages) see: the *published* one-shots, the
 * spell book and the shared world, from wherever TEAROFF_STORE keeps them.
 * Files (the default) read content/ exactly as the build always has. The
 * database reads the `published` rows and parses each through the same checks
 * as the builder (`checkDoc`), so a row that somehow fails them is a 404,
 * never a broken page. Drafts never come out of here. Server-only.
 *
 * Every read is fresh, because pages regenerate from it (ISR) right after a
 * publish. The table APIs, polled every couple of seconds, use `tableOneShot`,
 * which keeps a parsed copy for a few seconds per server instance.
 */

const LIVE = ["published", "changed"];

async function dbOneShot(slug: string): Promise<OneShotWithCast | null> {
  const row = await db().oneShot.findUnique({ where: { slug }, select: { published: true } });
  if (row?.published == null) return null;
  // The spell book was checked when it was published (and a spell in use can't be deleted).
  const { issues, parsed } = checkDoc(coerceDoc(row.published), null);
  if (!parsed) console.warn(`[content] ${slug}'s published row fails its checks, so it's hidden: ${issues[0]?.message ?? "?"}`);
  return parsed;
}

/** Slugs on the board, in order. */
export async function publishedSlugList(): Promise<string[]> {
  if (storeKind() === "files") return publishedSlugs();
  const rows = await db().oneShot.findMany({ where: { status: { in: LIVE } }, select: { slug: true }, orderBy: { slug: "asc" } });
  return rows.map((r) => r.slug);
}

/** The published one-shot, or null if there's none (or it's only a draft). Files throw on a broken one, as the build does. */
export async function publishedOneShot(slug: string): Promise<OneShotWithCast | null> {
  if (!isSafeId(slug)) return null;
  if (storeKind() === "files") return fs.existsSync(path.join(CONTENT_ROOT, slug, "oneshot.json")) ? loadOneShot(slug) : null;
  return dbOneShot(slug);
}

/** Every published one-shot, in slug order. */
export async function publishedOneShots(): Promise<OneShotWithCast[]> {
  if (storeKind() === "files") return loadAll();
  const rows = await db().oneShot.findMany({ where: { status: { in: LIVE } }, select: { slug: true, published: true }, orderBy: { slug: "asc" } });
  return rows.flatMap((r) => {
    if (r.published == null) return [];
    const { parsed } = checkDoc(coerceDoc(r.published), null);
    if (!parsed) console.warn(`[content] ${r.slug}'s published row fails its checks, so it's hidden`);
    return parsed ? [parsed] : [];
  });
}

/** The published one-shot, or an Error (the table APIs answer 404 on it, as they did for a missing file). */
export async function requireOneShot(slug: string): Promise<OneShotWithCast> {
  const os = await publishedOneShot(slug);
  if (!os) throw new Error(`no published one-shot "${slug}"`);
  return os;
}

const TABLE_TTL_MS = 10_000;
const memo = new Map<string, { at: number; os: Promise<OneShotWithCast> }>();

/** `requireOneShot` for the polled table APIs: a parsed copy is kept for ten seconds per server instance. */
export function tableOneShot(slug: string): Promise<OneShotWithCast> {
  if (storeKind() === "files") return requireOneShot(slug);
  const hit = memo.get(slug);
  if (hit && Date.now() - hit.at < TABLE_TTL_MS) return hit.os;
  const os = requireOneShot(slug);
  memo.set(slug, { at: Date.now(), os });
  os.catch(() => memo.delete(slug));
  return os;
}

/** The whole spell book. */
export async function spellBook(): Promise<SpellBook> {
  return storeKind() === "db" ? readSpellBook() : loadSpellBook();
}

/** Just the spells a 5e one-shot uses at any level, for its cards. */
export async function spellBookFor(os: dnd5e.OneShotWithCast): Promise<Record<string, dnd5e.SpellInfo>> {
  return spellBookFrom(os, await spellBook());
}

/** The shared world's survivor records. */
export async function survivors(): Promise<Survivor[]> {
  return storeKind() === "db" ? readSurvivors() : loadSurvivors();
}

/**
 * How long a player page may be served before it's rebuilt in the background,
 * as getStaticProps' `revalidate`. Publishing revalidates the pages it touches
 * at once (src/lib/revalidate.ts); this is the safety net. Files only change
 * with a deploy, so their pages never need it.
 */
export function revalidateSeconds(): number | false {
  return storeKind() === "db" ? 60 : false;
}
