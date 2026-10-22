import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { canMove, canRepin, isOver, STATUS_LABEL, type GameDetail, type GamePatch, type GameStatus } from "@/lib/games";
import s from "@/components/board/Board.module.css";
import { ProfileLink } from "@/components/profile/ProfileLink";

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;
const field = {
  "& .MuiInputBase-root": { color: "var(--ink)", fontFamily: "var(--font-print)" },
  "& .MuiInputLabel-root": { color: "var(--ink-soft)" },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--ink-soft)" },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--wax)", borderWidth: 3 },
  "& .MuiInputLabel-root.Mui-focused": { color: "var(--wax)" },
};
const quiet = { color: "var(--ink)", borderColor: "var(--ink-soft)" } as const;

/** The GM's moves, in the order a night goes. */
const MOVE_LABEL: Partial<Record<GameStatus, string>> = { open: "Open the seats", planned: "Back to planned", live: "Start the game", finished: "End the game" };

/** A datetime-local value for a stored ISO time, in this browser's zone. */
const localInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Running one game: where it stands and the GM's moves (open the seats,
 * start, end), its date and seat count, moving it to the latest version
 * before it starts, handing it to someone else or bringing in co-GMs, and
 * an invite for each guest seat so its guest can keep it. An admin looking
 * in sees it all and changes nothing.
 */
export function GameControls({ code, cast }: { code: string; cast: { id: string; name: string }[] }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState<string | null>(null);
  const [seats, setSeats] = useState<string | null>(null);
  const [heir, setHeir] = useState("");
  const [stay, setStay] = useState(true);
  const [cogm, setCogm] = useState("");
  const [invites, setInvites] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void fetch(`/api/games/${code}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<GameDetail>) : null))
      .then((g) => alive && g && setGame(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [code]);

  async function patch(op: GamePatch, after?: (json: GameDetail & { invite?: { code: string } }) => void) {
    setBusy(true);
    setProblem(null);
    const res = await fetch(`/api/games/${code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) {
      setGame(json as GameDetail);
      after?.(json);
    } else setProblem(json?.error ?? "That didn't work — try again.");
    setBusy(false);
  }

  if (!game) return null;
  const gm = game.you === "gm" || (game.you === "admin" && !game.gm);
  const runs = gm || game.you === "cogm";
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const moves = (["open", "live", "finished", "planned"] as GameStatus[]).filter((to) => canMove(game.status, to));
  const others = game.members.filter((m) => m.username !== game.gm?.username && !game.coGms.some((c) => c.username === m.username));

  return (
    <div className={s.note} style={{ ["--tilt" as string]: "0.5deg" }} aria-label="This game">
      <span className={s.pin} aria-hidden="true" />
      <h2 className={s.noteTitle}>This game</h2>
      <Typography sx={mono}>
        <b>{STATUS_LABEL[game.status]}</b> · run by {game.gm ? <ProfileLink person={game.gm} /> : "the admins"}
        {game.coGms.length > 0 && (
          <>
            {" "}
            with{" "}
            {game.coGms.map((c, i) => (
              <span key={c.username}>
                {i > 0 && ", "}
                <ProfileLink person={c} />
              </span>
            ))}
          </>
        )}
        {game.seats !== null && <> · {game.taken} of {game.seats} seats taken</>}
      </Typography>
      {game.you === "admin" && !runs && (
        <Alert severity="info" sx={{ mt: 1 }}>
          You&apos;re looking in as an admin. Only {game.gm?.displayName ?? "its GM"} and their co-GMs can change anything.
        </Alert>
      )}

      {runs && moves.length > 0 && (
        <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
          {moves.map((to, i) => (
            <Button
              key={to}
              size="small"
              variant={i === 0 ? "contained" : "outlined"}
              color={i === 0 ? "secondary" : undefined}
              sx={i === 0 ? undefined : quiet}
              disabled={busy}
              onClick={() => void patch({ op: "status", status: to })}
            >
              {game.status === "finished" && to === "live" ? "Reopen the game" : MOVE_LABEL[to]}
            </Button>
          ))}
        </Box>
      )}

      {runs && !isOver(game.status) && (
        <Box component="form" sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap", alignItems: "center" }} onSubmit={(e) => {
          e.preventDefault();
          const at = when ?? localInput(game.scheduledAt);
          const n = seats ?? (game.seats === null ? "" : String(game.seats));
          void patch({ op: "schedule", scheduledAt: at ? new Date(at).toISOString() : null, seats: n ? Number(n) : null });
        }}>
          <TextField size="small" type="datetime-local" label="When" value={when ?? localInput(game.scheduledAt)} onChange={(e) => setWhen(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ ...field, width: 230 }} />
          <TextField size="small" type="number" label="Seats" value={seats ?? (game.seats === null ? "" : String(game.seats))} onChange={(e) => setSeats(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 20 } }} sx={{ ...field, width: 100 }} />
          <Button type="submit" size="small" variant="outlined" sx={quiet} disabled={busy}>
            Save
          </Button>
        </Box>
      )}

      {game.pinnedAt && (
        <Typography sx={{ ...small, mt: 1.5 }}>
          Plays the version published by {new Date(game.pinnedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}, so edits in the builder don&apos;t change it.
        </Typography>
      )}
      {runs && game.newer && canRepin(game.status) && (
        <Alert
          severity="info"
          sx={{ mt: 1 }}
          action={
            <Button size="small" onClick={() => void patch({ op: "repin" })} disabled={busy}>
              Update
            </Button>
          }
        >
          A newer version has been published. Update to it before the game starts?
        </Alert>
      )}

      {gm && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ ...mono, fontWeight: 700 }}>Hand the reins</Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" label="To" value={heir} onChange={(e) => setHeir(e.target.value)} sx={{ ...field, minWidth: 180 }}>
              {game.members.filter((m) => m.username !== game.gm?.username).map((m) => (
                <MenuItem key={m.username} value={m.username}>
                  {m.displayName}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel control={<Checkbox checked={stay} onChange={(e) => setStay(e.target.checked)} size="small" />} label="Stay on as co-GM" sx={{ ...small, "& .MuiTypography-root": small }} />
            <Button size="small" variant="outlined" sx={quiet} disabled={busy || !heir} onClick={() => void patch({ op: "transfer", to: heir, stay }, () => setHeir(""))}>
              Hand it over
            </Button>
            {heir && <PosterOf username={heir} members={game.members} />}
          </Box>
          <Typography sx={{ ...mono, fontWeight: 700, mt: 2 }}>Co-GMs</Typography>
          {game.coGms.length > 0 && (
            <ul className={s.yarnList}>
              {game.coGms.map((c) => (
                <li key={c.username} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1 }}>
                    <ProfileLink person={c} />
                  </span>
                  <Button size="small" sx={{ color: "var(--ink-soft)" }} disabled={busy} onClick={() => void patch({ op: "removeCoGm", username: c.username })}>
                    remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" label="Add" value={cogm} onChange={(e) => setCogm(e.target.value)} sx={{ ...field, minWidth: 180 }}>
              {others.map((m) => (
                <MenuItem key={m.username} value={m.username}>
                  {m.displayName}
                </MenuItem>
              ))}
            </TextField>
            <Button size="small" variant="outlined" sx={quiet} disabled={busy || !cogm} onClick={() => void patch({ op: "addCoGm", username: cogm }, () => setCogm(""))}>
              Add co-GM
            </Button>
            {cogm && <PosterOf username={cogm} members={game.members} />}
          </Box>
        </Box>
      )}

      {runs && game.guests.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ ...mono, fontWeight: 700 }}>Guest seats</Typography>
          <Typography sx={small}>A guest has no profile. An invite lets them make an account and keep the seat, and this night, on it.</Typography>
          <ul className={s.yarnList}>
            {game.guests.map((g) => (
              <li key={g.characterId}>
                <span className={s.yarn}>{nameOf(g.characterId)}</span> — {g.name}{" "}
                {invites[g.characterId] ? (
                  <span style={{ display: "block", ...small, wordBreak: "break-all" }} data-testid={`guest-invite-${g.characterId}`}>
                    {invites[g.characterId]}
                  </span>
                ) : (
                  <Button
                    size="small"
                    sx={{ color: "var(--ink-soft)" }}
                    disabled={busy}
                    onClick={() =>
                      void patch({ op: "inviteGuest", characterId: g.characterId }, (j) => {
                        if (j.invite) setInvites((v) => ({ ...v, [g.characterId]: `${window.location.origin}/join/${j.invite!.code}` }));
                      })
                    }
                  >
                    invite to keep it
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Box>
      )}

      {problem && (
        <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
    </div>
  );
}

/** Who's picked in a member list, with a link to their poster, before the GM hands anything over. */
function PosterOf({ username, members }: { username: string; members: GameDetail["members"] }) {
  const m = members.find((x) => x.username === username);
  return m ? (
    <ProfileLink person={m} className={s.yarn}>
      {m.displayName}&apos;s poster
    </ProfileLink>
  ) : null;
}
