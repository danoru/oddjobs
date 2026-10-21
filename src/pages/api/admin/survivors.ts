import type { NextApiRequest, NextApiResponse } from "next";
import { contentGuard, methodNotAllowed, sendStoreError } from "@/lib/admin.server";
import { storeKind } from "@/lib/store";
import { deleteSurvivors, saveSurvivors } from "@/lib/store/survivorStore";
import type { WriteGate } from "@/lib/store/types";
import { publishedSlugList } from "@/lib/source";
import { BOARD_PAGES, revalidatePages } from "@/lib/revalidate";

/** Who may write the shared world: the GM, and only when it lives in the database. */
export interface SurvivorWriter {
  gate(): WriteGate;
  save(records: unknown): Promise<{ saved: string[]; skipped: string[] }>;
  remove(ids: string[]): Promise<string[]>;
}

const dbWriter: SurvivorWriter = {
  gate: () =>
    storeKind() === "db"
      ? { writable: true, kind: "db" }
      : { writable: false, kind: "files", reason: "The shared world is files in content/legacy here: download the records and commit them." },
  save: (records) => saveSurvivors(records),
  remove: (ids) => deleteSurvivors(ids),
};

/**
 * POST { records } — the epilogue's "save to the shared world": adds or
 * updates survivor records (TEAROFF_STORE=db only; with files the page
 * downloads them instead).
 * DELETE { ids } — takes records out again.
 *
 * Admins only (the GM, until games arrive). Revalidates the board and every job page, where survivors turn up as cameos.
 */
export async function handler(req: NextApiRequest, res: NextApiResponse, injected?: SurvivorWriter) {
  if (req.method !== "POST" && req.method !== "DELETE") return methodNotAllowed(res, ["POST", "DELETE"]);
  const guard = await contentGuard(req, res, { write: true, store: injected ?? dbWriter, need: "admin" });
  if (!guard) return;
  const writer = guard.store;
  const pages = async () => revalidatePages(res, [...BOARD_PAGES, ...(await publishedSlugList()).map((s) => `/${s}`)]);
  try {
    if (req.method === "DELETE") {
      const ids = (req.body as { ids?: unknown } | undefined)?.ids;
      if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return res.status(400).json({ error: "Expected { ids: [...] }" });
      const removed = await writer.remove(ids);
      if (removed.length) await pages();
      return res.status(200).json({ removed });
    }
    const result = await writer.save((req.body as { records?: unknown } | undefined)?.records);
    if (result.saved.length) await pages();
    return res.status(200).json(result);
  } catch (e) {
    return sendStoreError(res, e);
  }
}

export default function route(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}

// Publishing waits while every page it touches is rebuilt (src/lib/revalidate.ts), which can outlast the default limit on Vercel.
export const config = { maxDuration: 60 };
