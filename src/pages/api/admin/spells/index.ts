import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { adminGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
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
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: SpellStore) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method ?? "")) return methodNotAllowed(res, ["GET", "POST", "PUT", "DELETE"]);
  const store = await adminGuard(req, res, { write: req.method !== "GET", store: injected ?? getSpellStore() });
  if (!store) return;
  try {
    if (req.method === "GET") return res.status(200).json({ spells: await store.list(), gate: store.gate() });
    if (req.method === "DELETE") {
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
