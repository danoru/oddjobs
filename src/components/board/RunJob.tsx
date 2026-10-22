import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import { STATUS_LABEL, type JobRecord } from "@/lib/games";
import { fullLoad } from "@/lib/fullLoad";
import s from "./Board.module.css";
import { ProfileLink } from "@/components/profile/ProfileLink";

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;

/**
 * "Run this job": anyone signed in can run any one-shot on the board, as its
 * GM. Shows the games of it you're in, which members have already played it
 * (so you can pick a table that hasn't), and, gently, that you know its
 * secrets if you've run it before. Guests don't see it.
 */
export function RunJob({ slug, runJob }: { slug: string; runJob: () => Promise<{ code: string } | { error: string }> }) {
  const router = useRouter();
  const [record, setRecord] = useState<JobRecord | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = router.query.run === "1";

  useEffect(() => {
    let alive = true;
    void fetch(`/api/games?oneshot=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<JobRecord>) : null))
      .then((j) => alive && setRecord(j))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug]);

  if (!record) return null;

  async function run() {
    setBusy(true);
    const r = await runJob();
    if ("error" in r) {
      setProblem(r.error);
      setBusy(false);
    } else fullLoad(`/${slug}/gm?game=${r.code}`);
  }

  const gms = record.played.filter((p) => p.as === "gm");
  const players = record.played.filter((p) => p.as === "player");
  const names = (people: typeof gms) =>
    people.map((p, i) => (
      <span key={p.username}>
        {i > 0 && ", "}
        <ProfileLink person={p} />
      </span>
    ));

  return (
    <div className={`${s.note} no-print`} data-part="note" style={{ ["--tilt" as string]: "-0.3deg", marginBottom: 32 }} aria-label="Run this job">
      <span className={s.brassPin} data-part="pin" aria-hidden="true" />
      <Box sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 16px" }}>
        <p className={s.noteTitle} data-part="noteTitle" style={{ margin: 0 }}>
          Run this job
        </p>
        <Button variant="contained" color="secondary" onClick={run} disabled={busy} autoFocus={asked} sx={{ ml: "auto" }}>
          Run this job
        </Button>
      </Box>
      <Typography sx={{ ...mono, mt: 1 }}>
        You GM: you get a table code to read out, the GM&apos;s view with every secret, and the night&apos;s tools.
      </Typography>
      {record.youKnow && <Typography sx={{ ...small, mt: 1 }}>You&apos;ve run this one before, so you know its secrets.</Typography>}
      <Typography sx={{ ...small, mt: 1 }} data-testid="played-by">
        {record.played.length === 0 ? (
          "Nobody on the board has played it yet: everyone's fresh."
        ) : (
          <>
            {gms.length > 0 && <>Run by {names(gms)}</>}
            {gms.length > 0 && players.length > 0 && "; "}
            {players.length > 0 && <>{gms.length ? "played" : "Played"} by {names(players)}</>}. They know how it ends.
          </>
        )}
      </Typography>
      {record.games.length > 0 && (
        <ul className={s.yarnList} style={{ marginTop: 8 }} aria-label="Your games of it">
          {record.games.map((g) => (
            <li key={g.code}>
              <span className={s.yarn}>{g.code}</span> · {STATUS_LABEL[g.status]}
              {g.scheduledAt && <> · {new Date(g.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</>}{" "}
              {g.you === "gm" || g.you === "cogm" ? (
                <Link href={`/${g.oneshot}/gm?game=${g.code}`} prefetch={false}>
                  GM&apos;s view
                </Link>
              ) : (
                <Link href={`/${g.oneshot}?table=${g.code}`}>your seat</Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {problem}
        </Alert>
      )}
    </div>
  );
}
