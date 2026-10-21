import type { NextApiRequest, NextApiResponse } from "next";
import { adminGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { formatJson } from "@/lib/store/json";
import { BOARD_PAGES, pagesOfDoc, revalidatePages } from "@/lib/revalidate";
import type { OneShotStore } from "@/lib/store";
import { db } from "@/lib/prisma";
import { isAdmin } from "@/lib/accounts";

/**
 * POST publish | unpublish | discard | duplicate { to } — move a one-shot between draft and published.
 * POST restore { revision } — make an earlier revision the draft (stores with a history).
 * POST owner { ownerId } — hand the one-shot to someone (null: back to the admins). Admins only.
 * GET export — the newest version as one JSON file to download.
 * GET history — the saves and publishes, newest first (stores with a history).
 *
 * Publishing and unpublishing revalidate every player page the one-shot had
 * before and has after, so the board changes at once.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: OneShotStore) {
  const slug = String(req.query.slug ?? "");
  const action = String(req.query.action ?? "");
  if (action === "history") {
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    const store = await adminGuard(req, res, { write: false, store: injected });
    if (!store) return;
    if (!store.history) return res.status(404).json({ error: "This store keeps no history (with files, git is the history)" });
    try {
      return res.status(200).json({ revisions: await store.history(slug) });
    } catch (e) {
      return sendStoreError(res, e);
    }
  }
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
  if (!["publish", "unpublish", "discard", "duplicate", "restore", "owner"].includes(action)) return res.status(404).json({ error: "Unknown action" });
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const store = await adminGuard(req, res, { write: true, store: injected });
  if (!store) return;
  try {
    if (action === "publish" || action === "unpublish") {
      const before = await store.get(slug);
      const result = action === "publish" ? await store.publish(slug) : await store.unpublish(slug);
      const after = await store.get(slug);
      const revalidated = await revalidatePages(res, [...BOARD_PAGES, ...pagesOfDoc(before?.published), ...pagesOfDoc(after?.published)]);
      return res.status(200).json({ ...result, revalidated: revalidated.done.length, notRevalidated: revalidated.failed.map((f) => f.path) });
    }
    if (action === "discard") return res.status(200).json(await store.discardDraft(slug));
    if (action === "owner") {
      if (!isAdmin(store.viewer)) return res.status(403).json({ error: "Only an admin can hand a one-shot to someone" });
      const ownerId = (req.body as { ownerId?: unknown } | undefined)?.ownerId;
      if (ownerId !== null && typeof ownerId !== "string") return res.status(400).json({ error: "Expected { ownerId }" });
      if (ownerId && !(await ownerExists(ownerId))) return res.status(400).json({ error: "No such author" });
      await store.setOwner(slug, ownerId || null);
      return res.status(200).json({ ownerId: ownerId || null, changed: [] });
    }
    if (action === "restore") {
      if (!store.restore) return res.status(404).json({ error: "This store keeps no history (with files, git is the history)" });
      const revision = String((req.body as { revision?: unknown } | undefined)?.revision ?? "");
      if (!revision) return res.status(400).json({ error: "Expected { revision }" });
      return res.status(200).json(await store.restore(slug, revision));
    }
    const to = String((req.body as { to?: unknown } | undefined)?.to ?? "");
    return res.status(201).json({ slug: to, ...(await store.duplicate(slug, to)) });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

/** A new owner must be an enabled account that may write: an author or an admin. */
async function ownerExists(id: string): Promise<boolean> {
  const u = await db().user.findUnique({ where: { id } });
  return !!u && !u.disabledAt && (u.role === "admin" || u.author);
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}

// Publishing waits while every page it touches is rebuilt (src/lib/revalidate.ts), which can outlast the default limit on Vercel.
export const config = { maxDuration: 60 };
