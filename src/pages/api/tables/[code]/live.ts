import type { NextApiRequest, NextApiResponse } from "next";
import { cryptoRng } from "@/lib/game";
import { asStatus, userKey } from "@/lib/games";
import { actorOf, CO_GMS, gameAccess, gameOneShot, viewerOf } from "@/lib/games.server";
import { applyLive, liveAction, redactedFor, toPublicPerson, viewEvents, type LiveRow } from "@/lib/live";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { appendEvents, peopleAt, toLiveRow } from "@/lib/tables.server";
import { readGuestPass } from "@/lib/guestPass";
import { cookieHeaderOf, readClaims } from "@/lib/session";
import { coinFor, SYSTEMS } from "@/systems/registry";
import { sheetLimits } from "@/systems/daggerheart/derive";
import { sheetLimits as paranoiaSheets } from "@/systems/paranoia/derive";

/**
 * The game's event log (src/lib/live.ts): dice, notes, the bell, act cards,
 * the spotlight, rumors, the town board and coins (and Daggerheart's duality
 * dice, Hope, Fear and slots; Paranoia's NODE dice, records, treason reports
 * and Friend Computer).
 * GET ?after=<id>[&as=table|player] — events after the cursor, as the asker
 *   may see them, plus who's at the table (by handle) and which rolls are
 *   hidden from the asker right now. `?as=table` is the TV's view (even in the
 *   GM's browser); `?as=player` the phone's.
 * POST { action } — act; answered like a GET.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const code = normalizeCode(req.query.code);
  const after = Math.max(0, Number(req.query.after) || 0);
  // Who's asking decides which of their own rows the poll needs; who they are at this game is checked below.
  const asker = await askerKey(req);
  // A poll only needs the rows after its cursor, plus whatever decides which rolls are hidden; acting needs the whole log.
  const events =
    req.method === "GET" && after > 0
      ? {
          where: {
            OR: [
              { id: { gt: after } },
              { kind: "hide" },
              { hidden: true },
              // The asker's own rolls, so a roll the GM hid stays visible to whoever made it.
              ...(asker ? [{ kind: "roll", byPlayer: asker }] : []),
            ],
          },
          orderBy: { id: "asc" as const },
        }
      : { orderBy: { id: "asc" as const } };
  const table = code ? await db().game.findUnique({ where: { code }, omit: { content: true }, include: { ...CO_GMS, claims: true, state: true, events } }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  let os;
  try {
    os = await gameOneShot(table);
  } catch {
    return res.status(404).json({ error: "That one-shot is gone" });
  }

  const access = await gameAccess(req, table);
  const as = req.query.as;
  const viewer = viewerOf(access, as);
  const people = peopleAt(table, os);

  const reply = (rows: LiveRow[], status = 200, error?: string) => {
    const you = viewer.role === "player" ? (people.find((p) => p.playerId === viewer.playerId)?.handle ?? null) : null;
    return res.status(status).json({
      ...(error ? { error } : {}),
      you,
      people: people.map(toPublicPerson),
      events: viewEvents(rows, viewer, { people, rumors: os.rumors }, after),
      redacted: redactedFor(rows, viewer),
      cursor: rows.at(-1)?.id ?? 0,
    });
  };

  const rows = table.events.map(toLiveRow);
  if (req.method === "GET") return reply(rows);

  const who = actorOf(access, as, asStatus(table.status));
  if ("error" in who) return res.status(who.status).json({ error: who.error });
  const parsed = liveAction.safeParse(req.body?.action);
  if (!parsed.success) return res.status(400).json({ error: "That's not something you can do here" });

  const result = applyLive(parsed.data, who.actor, {
    people,
    rows,
    acts: os.acts,
    rumors: os.rumors,
    notices: os.notices,
    coin: coinFor(os),
    dice: SYSTEMS[os.system].dice,
    ...(os.system === "daggerheart" ? { sheets: sheetLimits(os.cast) } : {}),
    ...(os.system === "paranoia" ? { paranoia: { sheets: paranoiaSheets(os.cast), houseRules: os.houseRules } } : {}),
    rng: cryptoRng,
  });
  if (!result.ok) return reply(rows, 409, result.error);
  const added = await appendEvents(table.id, result.rows);
  return reply([...rows, ...added], 201);
}

/** The asker's key, as their session or guest pass says, before the game is known (only to narrow the poll). */
async function askerKey(req: NextApiRequest): Promise<string | null> {
  const cookie = cookieHeaderOf(req);
  const claims = await readClaims(cookie);
  if (claims) return userKey(claims.sub);
  return (await readGuestPass(cookie))?.key ?? null;
}
