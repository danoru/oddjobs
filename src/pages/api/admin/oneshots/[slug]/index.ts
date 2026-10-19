import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { adminGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { coerceDoc, looksLikeDoc } from "@/lib/store/doc";
import type { OneShotStore } from "@/lib/store";

const deleteBody = z.object({ confirm: z.string() });

/**
 * GET — the draft and published versions.
 * PUT { doc } — save the draft (autosave). Drafts may be invalid.
 * DELETE { confirm: "<slug>" } — remove draft and published version; the slug must be typed back.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: OneShotStore) {
  if (!["GET", "PUT", "DELETE"].includes(req.method ?? "")) return methodNotAllowed(res, ["GET", "PUT", "DELETE"]);
  const store = await adminGuard(req, res, { write: req.method !== "GET", store: injected });
  if (!store) return;
  const slug = String(req.query.slug ?? "");
  try {
    if (req.method === "GET") {
      const got = await store.get(slug);
      return got ? res.status(200).json(got) : res.status(404).json({ error: "No such one-shot" });
    }
    if (req.method === "PUT") {
      const doc = (req.body as { doc?: unknown } | undefined)?.doc;
      if (!looksLikeDoc(doc)) return res.status(400).json({ error: "Expected { doc: { oneshot, cast, variants } }" });
      return res.status(200).json(await store.saveDraft(slug, coerceDoc(doc)));
    }
    const b = deleteBody.safeParse(req.body);
    if (!b.success || b.data.confirm !== slug) return res.status(400).json({ error: `Type "${slug}" to confirm` });
    return res.status(200).json(await store.delete(slug));
  } catch (e) {
    return sendStoreError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };
