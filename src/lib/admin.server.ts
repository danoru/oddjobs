import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "./auth";
import { getStore, PublishError, StoreError, type OneShotStore, type WriteGate } from "./store";

/**
 * Every /api/admin route starts here: GM only (the proxy lets any signed-in
 * player through to /api, so the role is checked again on the server), and
 * mutating calls only when the store may write. Answers the request itself
 * and returns null when it shouldn't go on.
 */
export async function adminGuard(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { write: boolean; store?: OneShotStore },
): Promise<OneShotStore | null>;
/** The same, for another store behind the content write gate (the spell book). */
export async function adminGuard<S extends { gate(): WriteGate }>(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { write: boolean; store: S },
): Promise<S | null>;
export async function adminGuard(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { write: boolean; store?: { gate(): WriteGate } },
): Promise<{ gate(): WriteGate } | null> {
  res.setHeader("Cache-Control", "private, no-store");
  if ((await requestRole(req)) !== "gm") {
    res.status(403).json({ error: "Only the GM can use the builder" });
    return null;
  }
  const store = opts.store ?? getStore();
  if (opts.write) {
    const gate = store.gate();
    if (!gate.writable) {
      res.status(403).json({ error: gate.reason ?? "The builder is read-only here", readOnly: true });
      return null;
    }
  }
  return store;
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
