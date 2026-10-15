import type { NextApiRequest, NextApiResponse } from "next";
import { normalizeCode } from "@/lib/tables";
import { playerIdOf, tableState } from "@/lib/tables.server";

/** GET — the table's one-shot and who has torn what. Polled by every player. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeCode(req.query.code);
  const state = code ? await tableState(code, playerIdOf(req)) : null;
  if (!state) return res.status(404).json({ error: "No table with that code" });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(state);
}
