import type { NextApiRequest, NextApiResponse } from "next";
import { requestRole } from "@/lib/auth";
import { seatOf, type Viewer } from "@/lib/game";
import { db } from "@/lib/prisma";
import { normalizeCode } from "@/lib/tables";
import { playerIdOf } from "@/lib/tables.server";
import { audible, initialState, type TcState } from "@/systems/tencandles/game";
import { MAX_AUDIO_BYTES, uploadBody, type RecordingInfo } from "@/systems/tencandles/recording";

export const config = { api: { bodyParser: { sizeLimit: "700kb" } } };

/**
 * Ten Candles final recordings kept on the server (only when the GM keeps them).
 * GET — the kept recordings this asker may hear: their own, all for the GM,
 *       everyone's once the rules make them public (see `audible`).
 * GET ?seat=N — that seat's clip as audio, if the asker may hear it.
 * POST { kind: "audio", mime, data } | { kind: "text", text } — keep your own.
 * DELETE [?seat=N] — remove your own (or, as the GM, anyone's).
 * `?as=player` / `?as=table` ask as less than the cookie allows, as in /game.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  const code = normalizeCode(req.query.code);
  const table = code ? await db().table.findUnique({ where: { code }, include: { game: true } }) : null;
  if (!table) return res.status(404).json({ error: "No table with that code" });
  const state = (table.game?.system === "tencandles" ? table.game.state : initialState()) as unknown as TcState;

  const isGm = (await requestRole(req)) === "gm";
  const playerId = playerIdOf(req);
  const as = req.query.as;
  const viewer: Viewer =
    as === "table" ? { role: "table" } : isGm && as !== "player" ? { role: "gm" } : playerId ? { role: "player", playerId } : { role: "table" };
  const you = viewer.role === "player" ? seatOf(state.players, viewer.playerId) : -1;
  const hear = new Set(audible(state, viewer, you >= 0 ? you : null));
  const seatFor = (pid: string) => seatOf(state.players, pid);

  if (req.method === "GET") {
    const rows = await db().recording.findMany({ where: { tableId: table.id } });
    const wanted = typeof req.query.seat === "string" ? Number(req.query.seat) : null;
    if (wanted !== null) {
      const row = rows.find((r) => seatFor(r.playerId) === wanted);
      if (!row || !hear.has(wanted)) return res.status(404).json({ error: "Nothing to hear there" });
      if (!row.audio) return res.status(200).json({ text: row.text });
      res.setHeader("Content-Type", row.mime);
      res.setHeader("Content-Length", String(row.audio.length));
      return res.status(200).send(Buffer.from(row.audio));
    }
    const list: RecordingInfo[] = rows
      .map((r) => ({ r, seat: seatFor(r.playerId) }))
      .filter(({ seat }) => seat >= 0 && hear.has(seat))
      .map(({ r, seat }) => ({ seat, kind: r.audio ? "audio" : "text", mime: r.mime, size: r.size, ...(r.text ? { text: r.text } : {}) }));
    return res.status(200).json({ recordings: list.sort((a, b) => a.seat - b.seat), kept: state.settings.keepRecordings });
  }

  if (req.method === "DELETE") {
    const seat = isGm && as !== "player" && typeof req.query.seat === "string" ? Number(req.query.seat) : you;
    const pid = state.players[seat]?.playerId;
    if (!pid) return res.status(400).json({ error: "Whose recording?" });
    await db().recording.deleteMany({ where: { tableId: table.id, playerId: pid } });
    return res.status(200).json({ ok: true });
  }

  // POST: keep your own final words.
  if (viewer.role !== "player" || you < 0) return res.status(403).json({ error: "Take a seat first" });
  if (!state.settings.keepRecordings) return res.status(403).json({ error: "This table keeps recordings on each phone only" });
  if (state.phase === "ended") return res.status(409).json({ error: "It's over" });
  const body = uploadBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "That recording is too long or in a format we can't keep" });
  const audio = body.data.kind === "audio" ? Buffer.from(body.data.data, "base64") : null;
  if (audio && (audio.length === 0 || audio.length > MAX_AUDIO_BYTES))
    return res.status(413).json({ error: `Recordings are kept up to ${Math.round(MAX_AUDIO_BYTES / 1024)} KB` });
  const data = {
    mime: body.data.kind === "audio" ? body.data.mime : "text/plain",
    audio,
    text: body.data.kind === "text" ? body.data.text : null,
    size: audio ? audio.length : body.data.kind === "text" ? body.data.text.length : 0,
  };
  await db().recording.upsert({
    where: { tableId_playerId: { tableId: table.id, playerId: viewer.playerId } },
    create: { tableId: table.id, playerId: viewer.playerId, ...data },
    update: data,
  });
  return res.status(201).json({ ok: true });
}
