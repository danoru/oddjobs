import Link from "next/link";
import { Button, Typography } from "@mui/material";
import TvIcon from "@mui/icons-material/Tv";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import type { OneShotWithCast } from "@/lib/schema";
import { availableLetters } from "@/lib/letters";
import { useFlashbacks, useLetters } from "@/lib/tableExtras";
import { TonightCard } from "./TonightCard";
import s from "@/components/board/Board.module.css";

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;

/**
 * The GM's live table tools: what changes with tonight's headcount, sealed
 * letters to hand out, and the session-zero answers to read before play.
 */
export function GmTablePanels({ os, table, present }: { os: OneShotWithCast; table: string | null; present: string[] }) {
  const { letters: sent, deliver, takeBack, error: letterError } = useLetters(table, null);
  const { flashbacks } = useFlashbacks(table, null);
  const nameOf = (id: string) => os.cast.find((c) => c.id === id)?.name ?? id;
  const offer = availableLetters(os, present);

  return (
    <>
      <div className={s.grid} style={{ marginTop: 32, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <TonightCard cast={os.cast} present={present} />

        <div className={s.note} style={{ ["--tilt" as string]: "-0.6deg" }}>
          <span className={s.brassPin} aria-hidden="true" />
          <p className={s.noteTitle}>Sealed letters</p>
          {!table ? (
            <Typography sx={mono}>Open a table to send letters to players&apos; phones.</Typography>
          ) : offer.length === 0 ? (
            <Typography sx={mono}>No letters for anyone at the table yet. They appear as posters are torn.</Typography>
          ) : (
            <ul className={s.yarnList}>
              {offer.map((l) => {
                const d = sent.find((x) => x.id === l.id);
                return (
                  <li key={l.id}>
                    <span className={s.yarn}>
                      {l.title} → {nameOf(l.to)}
                    </span>
                    {l.kind === "letter" && (
                      <span style={{ display: "block", ...small }}>
                        {os.letters.find((x) => x.id === l.id)?.when}
                      </span>
                    )}
                    {l.kind === "beat" && <span style={{ display: "block", ...small }}>Inherited: their player isn&apos;t here.</span>}
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      {d ? (
                        <>
                          <span style={small}>{d.openedAt ? "Opened ✓" : "Delivered, still sealed"}</span>
                          <Button size="small" onClick={() => takeBack(l.id)} sx={{ color: "var(--ink-soft)" }}>
                            take back
                          </Button>
                        </>
                      ) : (
                        <Button size="small" variant="outlined" onClick={() => deliver(l.id)} sx={{ color: "var(--wax)", borderColor: "var(--wax)" }}>
                          Deliver
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {letterError && <Typography sx={{ ...small, color: "var(--wax)", mt: 1 }}>{letterError}</Typography>}
        </div>

        <div className={s.note} style={{ ["--tilt" as string]: "0.9deg" }}>
          <span className={s.pin} aria-hidden="true" />
          <p className={s.noteTitle}>Previously on…</p>
          {!table || flashbacks.length === 0 ? (
            <Typography sx={mono}>
              Players answer one flashback question on their sheet after tearing a poster. Read the answers out before
              the first scene.
            </Typography>
          ) : (
            <ul className={s.yarnList}>
              {flashbacks.map((f) => {
                const c = os.cast.find((x) => x.id === f.characterId);
                return (
                  <li key={f.characterId}>
                    <span className={s.yarn}>{c?.name ?? f.characterId}:</span> <i>{c?.flashback}</i>
                    <span style={{ display: "block", ...mono }}>&ldquo;{f.answer}&rdquo;</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 24 }}>
        <Button component={Link} href={`/${os.slug}/tv`} variant="contained" startIcon={<TvIcon />}>
          Board on the TV
        </Button>
        <Button component={Link} href={`/${os.slug}/sounds`} variant="contained" startIcon={<MusicNoteIcon />}>
          Soundboard
        </Button>
        <Button component={Link} href={`/${os.slug}/epilogue`} variant="contained" startIcon={<HistoryEduIcon />}>
          The morning after
        </Button>
      </div>
    </>
  );
}
