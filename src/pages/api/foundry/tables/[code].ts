import type { NextApiRequest, NextApiResponse } from "next";
import { checkFoundryToken, shapeFoundryTable } from "@/systems/dnd5e/foundry-sync";
import { loadOneShot } from "@/lib/content";
import { normalizeCode } from "@/lib/tables";
import { tableState } from "@/lib/tables.server";

/**
 * GET /api/foundry/tables/<code> — read-only table board for the Foundry
 * module (tools/foundry/tearoff-sync). Called cross-origin from Foundry with
 * `Authorization: Bearer <FOUNDRY_TOKEN>`; no cookies, so `*` CORS is safe.
 * src/proxy.ts lets /api/foundry/ through the site gate; the token check here
 * is the gate for this route.
 */
function cors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  cors(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkFoundryToken(req.headers.authorization, process.env.FOUNDRY_TOKEN);
  if (auth === "unconfigured") return res.status(503).json({ error: "FOUNDRY_TOKEN is not set on the server" });
  if (auth === "unauthorized") return res.status(401).json({ error: "Bad or missing bearer token" });

  const code = normalizeCode(req.query.code);
  const state = code ? await tableState(code, null) : null;
  if (!state) return res.status(404).json({ error: "No table with that code" });

  try {
    const os = loadOneShot(state.oneshot);
    if (os.system !== "dnd5e") return res.status(404).json({ error: "Foundry sync is for 5e one-shots" });
    return res.status(200).json(shapeFoundryTable(os, state));
  } catch (e) {
    console.error(`[foundry] could not load one-shot "${state.oneshot}":`, e);
    return res.status(500).json({ error: "Could not load the table's one-shot" });
  }
}
