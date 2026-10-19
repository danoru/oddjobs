import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { adminGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { getSpellStore, type SpellBookStore } from "@/lib/store";

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
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: SpellBookStore) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method ?? "")) return methodNotAllowed(res, ["GET", "POST", "PUT", "DELETE"]);
  const store = await adminGuard(req, res, { write: req.method !== "GET", store: injected ?? getSpellStore() });
  if (!store) return;
  try {
    if (req.method === "GET") return res.status(200).json({ spells: store.list(), gate: store.gate() });
    if (req.method === "DELETE") {
      const b = deleteBody.safeParse(req.body);
      if (!b.success) return res.status(400).json({ error: "Expected { name }" });
      return res.status(200).json(await store.delete(b.data.name));
    }
    const b = putBody.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "Expected { name, info }" });
    const result = store.put(b.data.name, b.data.info, { create: req.method === "POST" });
    return res.status(req.method === "POST" ? 201 : 200).json({ name: b.data.name, ...result });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}
