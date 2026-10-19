import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { adminGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { coerceDoc, looksLikeDoc, slugify, slugProblem } from "@/lib/store/doc";
import { SYSTEM_IDS } from "@/lib/schema";
import { SYSTEMS } from "@/systems/registry";
import type { OneShotStore } from "@/lib/store";

const createBody = z.object({
  action: z.literal("create"),
  system: z.enum(SYSTEM_IDS),
  title: z.string().trim().min(1).max(120),
  slug: z.string().optional(),
});
const importBody = z.object({ action: z.literal("import"), doc: z.unknown(), slug: z.string().optional() });
const body = z.discriminatedUnion("action", [createBody, importBody]);

/**
 * GET — every one-shot, published and draft, plus whether the builder may write.
 * POST { action: "create", system, title, slug? } — a new draft from the system's template.
 * POST { action: "import", doc, slug? } — an exported one-shot as a new draft.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: OneShotStore) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  const store = await adminGuard(req, res, { write: req.method === "POST", store: injected });
  if (!store) return;
  try {
    if (req.method === "GET") return res.status(200).json({ oneshots: await store.list(), gate: store.gate() });

    const parsed = body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Expected a create or import request" });
    const b = parsed.data;
    if (b.action === "create") {
      const slug = b.slug || slugify(b.title);
      const problem = slugProblem(slug);
      if (problem) return res.status(400).json({ error: `Slug "${slug}": ${problem}` });
      const doc = { oneshot: SYSTEMS[b.system].editor.newOneShot(slug, b.title), cast: [], variants: [] };
      const result = await store.import(slug, doc);
      return res.status(201).json({ slug, ...result });
    }
    if (!looksLikeDoc(b.doc)) return res.status(400).json({ error: "That file isn't an exported one-shot (it needs oneshot and cast)" });
    const doc = coerceDoc(b.doc);
    const slug = b.slug || (typeof doc.oneshot.slug === "string" ? doc.oneshot.slug : slugify(String(doc.oneshot.title ?? "")));
    const problem = slugProblem(slug);
    if (problem) return res.status(400).json({ error: `Slug "${slug}": ${problem}` });
    const result = await store.import(slug, doc);
    return res.status(201).json({ slug, ...result });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };
