import type { NextApiRequest, NextApiResponse } from "next";
import type { Viewer } from "./accounts";
import { apiViewer, type Need } from "./auth";
import { PublishError, StoreError, storeFor, type OneShotStore, type OwnedStore, type WriteGate } from "./store";

/**
 * Every /api/admin/oneshots route starts here: authors and admins only, read
 * from the database on every request (the proxy only checks that someone is
 * signed in), and mutating calls only when the store may write. The store
 * comes back wrapped for this person (OwnedStore): an author only ever
 * reaches their own one-shots. Answers the request itself and returns null
 * when it shouldn't go on.
 */
export async function adminGuard(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { write: boolean; store?: OneShotStore },
): Promise<OwnedStore | null> {
  const viewer = await apiViewer(req, res, "author", "Only authors and admins can use the builder");
  if (!viewer) return null;
  const store = storeFor(viewer, opts.store);
  return writeGate(res, store, opts.write) ? store : null;
}

/** The same for another store behind the content write gate: the spell book (authors) or the shared world (admins). */
export async function contentGuard<S extends { gate(): WriteGate }>(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { write: boolean; store: S; need: Need },
): Promise<{ store: S; viewer: Viewer } | null> {
  const viewer = await apiViewer(req, res, opts.need);
  if (!viewer) return null;
  return writeGate(res, opts.store, opts.write) ? { store: opts.store, viewer } : null;
}

function writeGate(res: NextApiResponse, store: { gate(): WriteGate }, write: boolean): boolean {
  if (!write) return true;
  const gate = store.gate();
  if (gate.writable) return true;
  res.status(403).json({ error: gate.reason ?? "The builder is read-only here", readOnly: true });
  return false;
}

/** Store errors become their HTTP answer; anything else is a 500. */
export function sendStoreError(res: NextApiResponse, e: unknown) {
  if (e instanceof PublishError) return res.status(e.status).json({ error: e.message, issues: e.issues });
  if (e instanceof StoreError) return res.status(e.status).json({ error: e.message });
  console.error("[admin]", e);
  return res.status(500).json({ error: (e as Error).message ?? "Something went wrong" });
}

export function methodNotAllowed(res: NextApiResponse, allow: string[]) {
  res.setHeader("Allow", allow.join(", "));
  return res.status(405).json({ error: "Method not allowed" });
}
