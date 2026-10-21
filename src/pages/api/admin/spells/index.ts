import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { contentGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { isAdmin } from "@/lib/accounts";
import { getSpellStore, type SpellStore } from "@/lib/store";
import { cardPagesOf, revalidatePages } from "@/lib/revalidate";
import { publishedOneShot } from "@/lib/source";

const putBody = z.object({ name: z.string(), info: z.unknown() });
const deleteBody = z.object({ name: z.string() });

/**
 * The spell book (content/rules/spells.json). Names travel in the body, not
 * the URL, since they hold spaces and apostrophes.
 *
 * GET — every entry, plus whether the builder may write.
 * POST { name, info } — add a new spell; refuses a name that's taken.
 * PUT { name, info } — add or replace one entry.
 * DELETE { name } — remove one entry, unless a one-shot still uses it.
 *
 * A change revalidates the cards pages of every published one-shot that uses the spell.
 *
 * Authors and admins: the spell book is shared, and an author needs to add
 * the spells their casts use. Only admins delete.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: SpellStore) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method ?? "")) return methodNotAllowed(res, ["GET", "POST", "PUT", "DELETE"]);
  const guard = await contentGuard(req, res, { write: req.method !== "GET", store: injected ?? getSpellStore(), need: "author" });
  if (!guard) return;
  const { store, viewer } = guard;
  try {
    if (req.method === "GET") return res.status(200).json({ spells: await store.list(), gate: store.gate(), canDelete: isAdmin(viewer) });
    if (req.method === "DELETE") {
      if (!isAdmin(viewer)) return res.status(403).json({ error: "Only an admin can take a spell out of the book" });
      const b = deleteBody.safeParse(req.body);
      if (!b.success) return res.status(400).json({ error: "Expected { name }" });
      return res.status(200).json(await store.delete(b.data.name));
    }
    const b = putBody.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "Expected { name, info }" });
    const result = await store.put(b.data.name, b.data.info, { create: req.method === "POST" });
    await revalidateCards(res, store, b.data.name);
    return res.status(req.method === "POST" ? 201 : 200).json({ name: b.data.name, ...result });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

/** The cards pages that print this spell. */
async function revalidateCards(res: NextApiResponse, store: SpellStore, name: string) {
  const paths: string[] = [];
  for (const slug of await store.usedBy(name)) {
    const os = await publishedOneShot(slug).catch(() => null);
    if (os) paths.push(...cardPagesOf(os));
  }
  await revalidatePages(res, paths);
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}

// Publishing waits while every page it touches is rebuilt (src/lib/revalidate.ts), which can outlast the default limit on Vercel.
export const config = { maxDuration: 60 };
