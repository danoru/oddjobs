import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { makeTableCode, openTableBody } from "@/lib/tables";
import { isUniqueViolation } from "@/lib/tables.server";

/** POST { oneshot } — the GM opens a table and gets its code. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if ((await requestRole(req)) !== "gm") {
    return res.status(403).json({ error: "Only the GM can open a table" });
  }
  const body = openTableBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Which one-shot?" });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const table = await db().table.create({ data: { code: makeTableCode(), oneshot: body.data.oneshot } });
      return res.status(201).json({ code: table.code, oneshot: table.oneshot, claims: [] });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return res.status(503).json({ error: "Couldn't find a free table code; try again" });
}
