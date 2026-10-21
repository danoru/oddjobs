import { SYSTEMS } from "@/systems/registry";
import type { SystemId } from "./schema";
import { isSafeId } from "./store/doc";

/**
 * On-demand revalidation: the player pages are static (ISR), so whatever
 * changes what they show (publishing, unpublishing or deleting a one-shot, a
 * spell edit, survivors saved to the shared world) asks Next to rebuild those
 * pages at once with `res.revalidate(path)`. A page whose one-shot is gone
 * rebuilds as a 404. Only a production server caches pages; `next dev`
 * renders every request fresh, so there it's skipped.
 */

/** Just what's needed to list a one-shot's pages: a published doc, or a parsed one-shot. */
type Shape = { slug?: unknown; system?: unknown; cast: { id?: unknown }[] };

/** What lists the one-shots: the public landing page's strip of posters and the members' board. */
export const BOARD_PAGES = ["/", "/board"];

/** The one-shot's static player pages (GM pages render per request and aren't listed). */
export function pagesOf(os: Shape): string[] {
  const slug = os.slug;
  const system = SYSTEMS[os.system as SystemId];
  if (!isSafeId(slug) || !system) return [];
  const r = system.routes;
  const ids = os.cast.map((c) => c.id).filter(isSafeId);
  const base = `/${slug}`;
  return [
    base,
    ...["flyer", "tv", "sounds", "epilogue", "tapestry"].map((p) => `${base}/${p}`),
    ...(r.print ? [`${base}/print`] : []),
    ...(r.cards ? [`${base}/cards`] : []),
    ...(r.tents ? [`${base}/tents`] : []),
    ...(r.play ? [`${base}/play`] : []),
    ...ids.flatMap((id) => [`${base}/${id}`, ...(r.cards ? [`${base}/${id}/cards`] : []), ...(r.tents ? [`${base}/${id}/tent`] : [])]),
  ];
}

/** A published doc's pages, as an object with `oneshot` and `cast` (or nothing). */
export function pagesOfDoc(doc: { oneshot: Record<string, unknown>; cast: Record<string, unknown>[] } | null | undefined): string[] {
  return doc ? pagesOf({ slug: doc.oneshot.slug, system: doc.oneshot.system, cast: doc.cast }) : [];
}

/** Cards pages only: what a spell edit changes. */
export function cardPagesOf(os: Shape): string[] {
  return pagesOf(os).filter((p) => /\/cards$/.test(p));
}

export interface Revalidator {
  revalidate?: (path: string) => Promise<void>;
}

export interface RevalidateResult {
  done: string[];
  failed: { path: string; error: string }[];
}

/**
 * Rebuilds each path, a few at a time, in order. Never throws: a page that
 * won't rebuild is logged and reported, and the safety net (`revalidate: 60`)
 * catches it up. A page now gone answers
 * 404 to the rebuild, which Next reports as an error but does cache.
 */
export async function revalidatePages(
  res: Revalidator,
  paths: Iterable<string>,
  opts: { enabled?: boolean } = {},
): Promise<RevalidateResult> {
  const out: RevalidateResult = { done: [], failed: [] };
  const enabled = opts.enabled ?? process.env.NODE_ENV === "production";
  const list = [...new Set(paths)];
  if (!enabled || !res.revalidate || !list.length) return out;
  const queue = [...list];
  const worker = async () => {
    for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
      try {
        await res.revalidate!(p);
        out.done.push(p);
      } catch (e) {
        const error = (e as Error).message ?? String(e);
        // Rebuilding a page that's now a 404 is the point of unpublishing.
        if (/\b404\b/.test(error)) out.done.push(p);
        else {
          out.failed.push({ path: p, error });
          console.warn(`[revalidate] ${p}: ${error}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
  return out;
}
