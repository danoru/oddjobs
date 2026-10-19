import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { requestRole } from "@/lib/auth";
import { loadOneShot } from "@/lib/content";
import { cryptoRng, type Actor, type Viewer } from "@/lib/game";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { isUniqueViolation, playerIdOf } from "@/lib/tables.server";
import { GAMES } from "@/systems/games";

/**
 * Live table play (Ten Candles today).
 * GET [?as=table|player] — the game as the asker may see it. The GM sees
 *   everything, a player what the rules let them; `?as=table` asks for the
 *   public view only (the TV uses it, even in the GM's browser) and
 *   `?as=player` for the player's view (the phone page).
 * POST { action } — act. The system's reducer decides whether it's allowed;
 *   writes only land if nobody else wrote since this request read the state.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  // One query per poll: the table with its game.
  const table = code ? await db().table.findUnique({ where: { code }, include: { game: true } }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });

  let os;
  try {
    os = loadOneShot(table.oneshot);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  const game = GAMES[os.system];
  if (!game) return res.status(404).json({ error: "This one-shot has no table play" });

  const isGm = (await requestRole(req)) === "gm";
  const playerId = playerIdOf(req);
  // A browser can always ask to be less than it is: the TV asks as the table,
  // and the phone page asks as a player even when the GM's cookie is set.
  const as = req.query.as;
  const viewer: Viewer =
    as === "table"
      ? { role: "table" }
      : isGm && as !== "player"
        ? { role: "gm" }
        : playerId
          ? { role: "player", playerId }
          : { role: "table" };
  const reply = (state: unknown, status = 200, error?: string) =>
    res.status(status).json({ ...(error ? { error } : {}), game: game.rules.view(state, viewer), ...game.extras(os, state) });

  const read = () => db().game.findUnique({ where: { tableId: table.id } });

  if (req.method === "GET") return reply(table.game?.state ?? game.rules.init());

  const parsed = game.rules.action.safeParse(req.body?.action);
  if (!parsed.success) return res.status(400).json({ error: "That's not something you can do here" });
  if (as === "table") return res.status(403).json({ error: "The TV only watches" });
  const actor: Actor | null = isGm && as !== "player" ? { role: "gm" } : playerId ? { role: "player", playerId } : null;
  if (!actor) return res.status(400).json({ error: "Join the table with your name first" });

  for (let attempt = 0; attempt < 6; attempt++) {
    const row = attempt === 0 ? table.game : await read();
    const state = row?.state ?? game.rules.init();
    const result = game.rules.apply(state, parsed.data, actor, cryptoRng);
    if (!result.ok) return reply(state, 409, result.error);
    const json = result.state as Prisma.InputJsonValue;
    try {
      if (row) {
        const { count } = await db().game.updateMany({
          where: { id: row.id, version: row.version },
          data: { state: json, version: row.version + 1 },
        });
        if (count === 0) continue; // someone else got there first; try again on the new state
      } else {
        await db().game.create({ data: { tableId: table.id, system: os.system, state: json } });
      }
      return reply(result.state);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return res.status(503).json({ error: "The table is busy; try again" });
}
