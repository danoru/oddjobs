import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Alert, Button, Container } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { pageViewer } from "@/lib/auth";
import { survivors } from "@/lib/source";
import { gameOneShot } from "@/lib/games.server";
import { db } from "@/lib/prisma";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { hasContent } from "@/lib/epilogueSchema";
import { applyEdits, type Panel } from "@/lib/tapestry";
import { NIGHT_INCLUDE, nightOf } from "@/lib/tapestry.server";
import { FATE_LABEL, type Survivor } from "@/lib/legacy";
import { survivorsFrom } from "@/lib/epilogue";
import { SiteHeader } from "@/components/SiteHeader";
import { Gazette, type Epilogue } from "@/components/gazette/Gazette";
import { Frieze } from "@/components/tapestry/Tapestry";
import c from "@/components/chronicle/Chronicle.module.css";

type Night = { code: string; os: PublicAnyOneShot; epilogue: Epilogue; panels: Panel[]; survivors: Survivor[] };
type Props = { nights: Night[]; error: string | null };

/**
 * The chronicle: every game night that has a morning-after front page, bound
 * into one printable book. A title page, then a chapter per night in date
 * order: its broadsheet, its tapestry and who survived (the shared world's
 * records in content/legacy, or the night's own fates). Read per request from
 * the games' saved epilogues.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "member");
  if (gate.redirect) return { redirect: gate.redirect };
  res.setHeader("Cache-Control", "private, no-store");
  let tables;
  try {
    tables = await db().game.findMany({ where: { epilogue: { isNot: null } }, include: NIGHT_INCLUDE });
  } catch {
    return { props: { nights: [], error: "The chronicle needs the table database, and it can't be reached." } };
  }
  const legacy = await survivors();
  const nights: Night[] = [];
  for (const t of tables) {
    let os;
    try {
      os = await gameOneShot(t);
    } catch {
      continue;
    }
    const { panels, edits, epilogue } = nightOf(t, os);
    if (!epilogue || !hasContent(epilogue)) continue;
    const pub = toPublic(os);
    const recorded = legacy.filter((s) => s.oneshot === os.slug && s.date === epilogue.date);
    nights.push({
      code: t.code,
      os: pub,
      epilogue,
      panels: applyEdits(panels, edits).map(({ dropped: _, ...p }) => p), // eslint-disable-line @typescript-eslint/no-unused-vars
      survivors: recorded.length ? recorded : survivorsFrom(pub, epilogue),
    });
  }
  nights.sort((a, b) => a.epilogue.date.localeCompare(b.epilogue.date) || a.code.localeCompare(b.code));
  return { props: JSON.parse(JSON.stringify({ nights, error: null })) as Props };
};

const nice = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export default function ChroniclePage({ nights, error }: Props) {
  const span = nights.length ? `${nice(nights[0].epilogue.date)} to ${nice(nights.at(-1)!.epilogue.date)}` : "";
  return (
    <>
      <Head>
        <title>The chronicle · Oddjobs</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/board", label: "the board" }} />
        <main id="main" tabIndex={-1}>
          <div className={`${c.toolbar} no-print`}>
            <span style={{ flex: 1 }}>
              Every night with a morning-after front page, bound in date order: the broadsheet, the tapestry and the survivors. Print it at 100% with
              background graphics on.
            </span>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!nights.length}>
              Print the chronicle
            </Button>
          </div>
          {error && <Alert severity="warning">{error}</Alert>}
          {!error && nights.length === 0 && (
            <Alert severity="info">No nights to bind yet. Fill in the morning after (the epilogue page) at a table, and it lands here.</Alert>
          )}
          {nights.length > 0 && (
            <article className={c.book}>
              <section className={c.titlePage} data-testid="chronicle-title">
                <div className={c.ornament} aria-hidden="true">
                  ❦
                </div>
                <h1 className={c.bookTitle}>The Chronicle</h1>
                <p className={c.bookSub}>being a true account of {nights.length} {nights.length === 1 ? "night" : "nights"} at the table</p>
                <p className={c.bookSpan}>{span}</p>
                <ol className={c.toc}>
                  {nights.map((n, i) => (
                    <li key={n.code}>
                      <span>
                        Chapter {i + 1}: {n.epilogue.headline || n.os.title}
                      </span>
                      <span className={c.tocDots} aria-hidden="true" />
                      <span>{nice(n.epilogue.date)}</span>
                    </li>
                  ))}
                </ol>
              </section>
              {nights.map((n, i) => (
                <section key={n.code} className={c.chapter} data-testid="chronicle-chapter" aria-labelledby={`ch-${n.code}`}>
                  <h2 id={`ch-${n.code}`} className={c.chapterTitle}>
                    <span className={c.chapterNo}>Chapter {i + 1}</span>
                    {n.os.title}
                    <span className={c.chapterDate}>{nice(n.epilogue.date)}</span>
                  </h2>
                  <Gazette os={n.os} ep={n.epilogue} />
                  {n.panels.length > 0 && (
                    <div className={c.tapestry}>
                      <Frieze title={`The tapestry of ${n.os.title}`} label={`Chapter ${i + 1}: the tapestry of ${n.os.title}, ${nice(n.epilogue.date)}`} panels={n.panels} icons={Object.fromEntries(n.os.cast.map((x) => [x.id, x.poster.icon]))} layout="poster" />
                    </div>
                  )}
                  {n.survivors.length > 0 && (
                    <div className={c.survivors}>
                      <h3 className={c.survivorsTitle}>What became of them</h3>
                      <ul>
                        {n.survivors.map((s) => (
                          <li key={s.id}>
                            <b>{s.name}</b>
                            {s.title ? `, the ${s.title}` : `, ${s.epithet}`} · {FATE_LABEL[s.fate]}
                            {s.scar ? ` · ${s.scar}` : ""}
                            {s.playedBy ? ` · played by ${s.playedBy}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </article>
          )}
        </main>
      </Container>
    </>
  );
}
