import type { NextApiRequest, NextApiResponse } from "next";
import { adminGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { formatJson } from "@/lib/store/json";
import type { OneShotStore } from "@/lib/store";

/**
 * POST publish | unpublish | discard | duplicate { to } — move a one-shot between draft and published.
 * GET export — the newest version as one JSON file to download.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: OneShotStore) {
  const slug = String(req.query.slug ?? "");
  const action = String(req.query.action ?? "");
  if (action === "export") {
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    const store = await adminGuard(req, res, { write: false, store: injected });
    if (!store) return;
    try {
      const doc = await store.export(slug);
      if (!doc) return res.status(404).json({ error: "No such one-shot" });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}.tearoff.json"`);
      return res.status(200).send(formatJson(doc));
    } catch (e) {
      return sendStoreError(res, e);
    }
  }
  if (!["publish", "unpublish", "discard", "duplicate"].includes(action)) return res.status(404).json({ error: "Unknown action" });
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const store = await adminGuard(req, res, { write: true, store: injected });
  if (!store) return;
  try {
    if (action === "publish") return res.status(200).json(await store.publish(slug));
    if (action === "unpublish") return res.status(200).json(await store.unpublish(slug));
    if (action === "discard") return res.status(200).json(await store.discardDraft(slug));
    const to = String((req.body as { to?: unknown } | undefined)?.to ?? "");
    return res.status(201).json({ slug: to, ...(await store.duplicate(slug, to)) });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}
