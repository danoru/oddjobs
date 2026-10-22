import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Container, Typography } from "@mui/material";
import { pageViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/accounts";
import { isOver, STATUS_LABEL, type GameSummary } from "@/lib/games";
import { listGames } from "@/lib/games.server";
import { SiteHeader } from "@/components/SiteHeader";
import s from "@/components/board/Board.module.css";

type Props = { games: GameSummary[]; all: boolean; admin: boolean };

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;

/**
 * Your games: the ones you run or co-run and the ones you hold a seat in,
 * coming up first, then what's done. Admins can see every game (`?all=1`).
 * To start one, pick a job on the board and run it.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl, query }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "member");
  if (gate.redirect) return { redirect: gate.redirect };
  res.setHeader("Cache-Control", "private, no-store");
  const admin = isAdmin(gate.viewer);
  const all = admin && query.all === "1";
  return { props: { games: await listGames(gate.viewer, { all }), all, admin } };
};

const ROLE: Record<NonNullable<GameSummary["you"]>, string> = { gm: "you GM", cogm: "you co-GM", player: "you play", admin: "looking in" };

function Row({ g }: { g: GameSummary }) {
  const runs = g.you === "gm" || g.you === "cogm" || g.you === "admin";
  return (
    <li style={{ marginBottom: 10 }}>
      <span className={s.yarn}>{g.title}</span> <span style={small}>· {g.code}</span>
      <span style={{ display: "block", ...small }}>
        {STATUS_LABEL[g.status]} · {g.you ? ROLE[g.you] : ""}
        {g.gm && g.you !== "gm" && <> · run by {g.gm.displayName}</>}
        {g.scheduledAt && <> · {new Date(g.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</>}
        {g.finishedAt && isOver(g.status) && <> · {new Date(g.finishedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</>}
        {" · "}
        {g.seats !== null ? `${g.taken} of ${g.seats} seats` : `${g.taken} seated`}
      </span>
      <span style={{ display: "flex", gap: 12, flexWrap: "wrap", ...mono, fontSize: 15 }}>
        {runs && (
          <Link href={`/${g.oneshot}/gm?game=${g.code}`} prefetch={false}>
            GM&apos;s view
          </Link>
        )}
        {g.yours.length > 0 && <Link href={`/${g.oneshot}?table=${g.code}`}>your seat</Link>}
        {isOver(g.status) && <Link href={`/${g.oneshot}/epilogue?table=${g.code}`}>the morning after</Link>}
      </span>
    </li>
  );
}

export default function GamesPage({ games, all, admin }: Props) {
  const coming = games.filter((g) => !isOver(g.status));
  const done = games.filter((g) => isOver(g.status));
  return (
    <>
      <Head>
        <title>Your games · Oddjobs</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/board", label: "the board" }} />
        <main id="main" tabIndex={-1}>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            {all ? "Every game" : "Your games"}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Pick a job on <Link href="/board">the board</Link> and run it to start one.{" "}
            {admin && (all ? <Link href="/games">Just yours</Link> : <Link href="/games?all=1">Every game</Link>)}
          </Typography>
          <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
            <section className={s.note} style={{ ["--tilt" as string]: "-0.5deg" }} aria-labelledby="coming">
              <span className={s.brassPin} aria-hidden="true" />
              <h2 id="coming" className={s.noteTitle}>
                On the table
              </h2>
              {coming.length === 0 ? (
                <Typography sx={mono}>Nothing running. The board has work.</Typography>
              ) : (
                <ul className={s.yarnList}>
                  {coming.map((g) => (
                    <Row key={g.code} g={g} />
                  ))}
                </ul>
              )}
            </section>
            <section className={s.note} style={{ ["--tilt" as string]: "0.7deg" }} aria-labelledby="done">
              <span className={s.pin} aria-hidden="true" />
              <h2 id="done" className={s.noteTitle}>
                Jobs done
              </h2>
              {done.length === 0 ? (
                <Typography sx={mono}>None yet.</Typography>
              ) : (
                <ul className={s.yarnList}>
                  {done.map((g) => (
                    <Row key={g.code} g={g} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>
      </Container>
    </>
  );
}
