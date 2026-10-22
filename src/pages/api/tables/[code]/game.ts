import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { cryptoRng } from "@/lib/game";
import { asStatus } from "@/lib/games";
import { actorOf, findGame, gameAccess, gameOneShot, viewerOf } from "@/lib/games.server";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { appendEvents, currentActOf, isUniqueViolation } from "@/lib/tables.server";
import { GAMES } from "@/systems/games";

/**
 * Live play in a system's own state (Ten Candles today).
 * GET [?as=table|player] — the state as the asker may see it. The GM sees
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
  // One query per poll: the game with its state.
  const table = code ? await findGame(code, { state: true }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });

  let os;
  try {
    os = await gameOneShot(table);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }
  const game = GAMES[os.system];
  if (!game) return res.status(404).json({ error: "This one-shot has no table play" });

  const access = await gameAccess(req, table);
  const as = req.query.as;
  const viewer = viewerOf(access, as);
  const reply = (state: unknown, status = 200, error?: string) =>
    res.status(status).json({ ...(error ? { error } : {}), game: game.rules.view(state, viewer), ...game.extras(os, state) });

  const read = () => db().gameState.findUnique({ where: { gameId: table.id } });

  if (req.method === "GET") return reply(table.state?.state ?? game.rules.init());

  const parsed = game.rules.action.safeParse(req.body?.action);
  if (!parsed.success) return res.status(400).json({ error: "That's not something you can do here" });
  const who = actorOf(access, as, asStatus(table.status));
  if ("error" in who) return res.status(who.status).json({ error: who.error });
  const actor = who.actor;

  for (let attempt = 0; attempt < 6; attempt++) {
    const row = attempt === 0 ? table.state : await read();
    const state = row?.state ?? game.rules.init();
    const result = game.rules.apply(state, parsed.data, actor, cryptoRng, Date.now());
    if (!result.ok) return reply(state, 409, result.error);
    const json = result.state as Prisma.InputJsonValue;
    try {
      if (row) {
        const { count } = await db().gameState.updateMany({
          where: { id: row.id, version: row.version },
          data: { state: json, version: row.version + 1 },
        });
        if (count === 0) continue; // someone else got there first; try again on the new state
      } else {
        await db().gameState.create({ data: { gameId: table.id, system: os.system, state: json } });
      }
      // What the move adds to the game's event log (rolls, deaths, candles out).
      const lastAct = game.mirror ? await currentActOf(table.id) : -1;
      const mirrored = game.mirror?.(row ? state : null, result.state, os, lastAct) ?? [];
      if (mirrored.length) await appendEvents(table.id, mirrored);
      return reply(result.state);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return res.status(503).json({ error: "The table is busy; try again" });
}
