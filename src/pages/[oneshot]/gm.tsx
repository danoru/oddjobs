import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GetServerSideProps } from "next";
import { Alert, Box, Button, Container, Typography } from "@mui/material";
import { gmPage } from "@/lib/games.server";
import type { OneShotWithCast } from "@/lib/schema";
import { rememberTable, useClaims, useLevel } from "@/lib/storage";
import { fullLoad } from "@/lib/fullLoad";
import { posterTag } from "@/systems/registry";
import { GmTable } from "@/systems/tencandles/components/GmTable";
import { Adversaries } from "@/systems/daggerheart/components/GmPanels";
import { LevelPicker } from "@/components/board/LevelPicker";
import { SiteHeader } from "@/components/SiteHeader";
import { ProfileLink } from "@/components/profile/ProfileLink";
import { GmTablePanels } from "@/components/gm/GmTablePanels";
import { GameControls } from "@/components/gm/GameControls";
import s from "@/components/board/Board.module.css";

type Props = { os: OneShotWithCast; code: string };

/**
 * The GM's view of one game (`?game=<code>`): notes, every secret, the full
 * ties and the live table, from the content the game is pinned to. Rendered
 * per request for the game's GM and co-GMs (and an admin looking in), so
 * `gmNotes` only ever leaves the server in a response that already passed
 * that check: there's no static page or data file for it.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, resolvedUrl, query }) => {
  const slug = String(params?.oneshot ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) return { notFound: true };
  const page = await gmPage({ req, resolvedUrl, query }, slug);
  if (!("game" in page)) return page;
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { os: JSON.parse(JSON.stringify(page.os)) as OneShotWithCast, code: page.game.code } };
};

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;

export default function GmPage({ os: base, code }: Props) {
  const { os, level, setLevel, levels } = useLevel(base);
  const levelQuery = base.system !== "dnd5e" || level === base.level ? "" : `&level=${level}`;
  const claims = useClaims(os.slug, code);
  const { table, claimedBy, loading, error, runJob, release } = claims;
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => os.cast.find((c) => c.id === id)?.name ?? id;
  const joinPath = `/${os.slug}${os.system === "tencandles" ? "/play" : ""}?table=${table}${levelQuery}`;
  const guestPath = `/t/${table}`;
  // The TV and the phone in this browser follow the game being run here.
  useEffect(() => rememberTable(os.slug, code), [os.slug, code]);

  async function another() {
    setBusy(true);
    const r = await runJob();
    if ("error" in r) setProblem(r.error);
    else fullLoad(`/${os.slug}/gm?game=${r.code}`);
    setBusy(false);
  }

  return (
    <>
      <Head>
        <title>{`GM · ${os.title} · Oddjobs`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/games", label: "your games" }} />

        <main id="main" className={s.frame}>
          <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
            <div className={s.note} style={{ ["--tilt" as string]: "-0.6deg" }}>
              <span className={s.brassPin} aria-hidden="true" />
              <div className={s.postingHeader}>Behind the screen</div>
              <h1 className={s.postingTitle} style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>
                {os.title}
              </h1>
              <LevelPicker levels={levels} level={level} onChange={setLevel} />
              <Button component={Link} href={`/admin/${os.slug}`} size="small" className="no-print" sx={{ color: "var(--ink-soft)", px: 0 }}>
                Edit in the builder
              </Button>
              {table && (
                <>
                  <Typography sx={{ ...mono, mt: 1 }}>
                    Read this out — players join with it on {os.system === "tencandles" ? "their phones, at the table page" : "the job page"}:
                  </Typography>
                  <Typography
                    aria-label={`Table code ${table.split("").join(" ")}`}
                    sx={{ fontFamily: "var(--font-poster)", fontSize: 52, letterSpacing: "0.18em", color: "var(--wax)" }}
                  >
                    {table}
                  </Typography>
                  <Typography sx={{ ...mono, fontSize: 14, color: "var(--ink-soft)" }}>
                    Or share{" "}
                    <Link href={joinPath}>{joinPath}</Link>
                    {". "}No account? <Link href={guestPath}>{guestPath}</Link> sits them down as a guest.
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                    <Button size="small" variant="outlined" onClick={another} disabled={busy} sx={{ color: "var(--ink)", borderColor: "var(--ink-soft)" }}>
                      Run another game of it
                    </Button>
                  </Box>
                </>
              )}
              {(problem || error) && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  {problem ?? error}
                </Alert>
              )}
            </div>

            <div className={s.note} style={{ ["--tilt" as string]: "0.8deg" }}>
              <span className={s.pin} aria-hidden="true" />
              <h2 className={s.noteTitle}>Who&apos;s playing whom</h2>
              {table && loading && <Typography sx={mono}>Asking the table…</Typography>}
              {table && !loading && (
                <ul className={s.yarnList} aria-live="polite">
                  {os.cast.map((c) => {
                    const claim = claimedBy[c.id];
                    return (
                      <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1 }}>
                          <span className={s.yarn}>{c.name}</span>{" "}
                          {claim ? (
                            <>
                              —{" "}
                              {claim.username ? <ProfileLink person={{ username: claim.username, displayName: claim.name ?? claim.username }} /> : (claim.name ?? "someone")}
                            </>
                          ) : (
                            <i>still on the board (NPC tonight?)</i>
                          )}
                          {os.coreRoles.includes(c.id) && !claim && <b> · needed</b>}
                        </span>
                        {claim && (
                          <Button size="small" onClick={() => release(c.id)} sx={{ color: "var(--ink-soft)" }}>
                            pin back up
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className={s.grid} style={{ marginTop: 32 }}>
            <GameControls code={code} cast={os.cast} />
          </div>

          {os.system === "tencandles" && <GmTable os={os} code={table} />}

          <GmTablePanels os={os} table={table} present={Object.keys(claimedBy)} />

          {/* At a table they're with the live tools, where their attacks roll. */}
          {os.system === "daggerheart" && !table && os.adversaries.length > 0 && (
            <div className={s.grid} style={{ marginTop: 32 }}>
              <Adversaries os={os} live={null} />
            </div>
          )}

          {os.system === "paranoia" && (
            <div className={s.note} style={{ ["--tilt" as string]: "0.3deg", marginTop: 32 }} aria-label="The briefing">
              <span className={s.brassPin} aria-hidden="true" />
              <h2 className={s.noteTitle}>The briefing</h2>
              <Typography sx={{ ...mono, whiteSpace: "pre-wrap" }}>{os.briefing}</Typography>
              <Typography sx={{ ...mono, mt: 1.5 }}>
                <b>Mission objectives ({os.team}):</b>
              </Typography>
              <ul className={s.yarnList}>
                {os.objectives.map((o) => (
                  <li key={o} style={mono}>
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {os.gmNotes && (
            <div className={s.note} style={{ ["--tilt" as string]: "-0.3deg", marginTop: 32 }}>
              <span className={s.pin} aria-hidden="true" />
              <h2 className={s.noteTitle}>GM notes</h2>
              <Typography sx={{ ...mono, whiteSpace: "pre-wrap" }}>{os.gmNotes}</Typography>
            </div>
          )}

          <div
            className={s.grid}
            style={{ marginTop: 32, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}
          >
            {os.cast.map((c, i) => (
              <div key={c.id} className={s.note} style={{ ["--tilt" as string]: `${i % 2 ? 0.7 : -0.7}deg` }}>
                <span className={s.pin} aria-hidden="true" />
                <h3 className={s.noteTitle} style={{ marginBottom: 0 }}>
                  {c.name}
                  {c.poster.alias && <span style={{ fontSize: 15 }}> (board: {c.poster.alias})</span>}
                </h3>
                <div className={s.meta} style={{ marginBottom: 8 }}>
                  <span>{c.poster.epithet}</span>
                  <span>{posterTag(c)}</span>
                  {claimedBy[c.id]?.name && (
                    <span>
                      played by{" "}
                      {claimedBy[c.id].username ? (
                        <ProfileLink person={{ username: claimedBy[c.id].username!, displayName: claimedBy[c.id].name! }} />
                      ) : (
                        claimedBy[c.id].name
                      )}
                    </span>
                  )}
                </div>
                {"naughty" in c ? (
                  <>
                    <Typography sx={mono}>
                      <b>Tonight:</b> {c.story.stake}
                    </Typography>
                    <Typography sx={{ ...mono, mt: 1, color: "var(--wax)" }} data-testid={`gm-naughty-${c.id}`}>
                      <b>{c.naughty.society}</b> · mutant power <b>{c.naughty.mutantPower.name}</b>
                    </Typography>
                    <ul className={s.yarnList} style={{ marginTop: 4 }}>
                      {[c.naughty.societyObjective, ...c.naughty.objectives].filter(Boolean).map((o) => (
                        <li key={o} style={mono}>
                          {o}
                        </li>
                      ))}
                    </ul>
                    {c.naughty.secret && (
                      <Typography sx={{ ...mono, mt: 1, color: "var(--wax)" }}>
                        <b>Secret:</b> {c.naughty.secret}
                      </Typography>
                    )}
                  </>
                ) : "secret" in c.story ? (
                  <>
                    <Typography sx={mono}>
                      <b>Tonight:</b> {c.story.stake}
                    </Typography>
                    <Typography sx={{ ...mono, mt: 1, color: "var(--wax)" }}>
                      <b>Secret:</b> {c.story.secret}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={mono}>{c.story.concept}</Typography>
                    <Typography sx={{ ...mono, mt: 1 }}>
                      <b>Look:</b> {c.story.look}
                    </Typography>
                    {c.story.stake && (
                      <Typography sx={{ ...mono, mt: 1 }}>
                        <b>Out here because:</b> {c.story.stake}
                      </Typography>
                    )}
                  </>
                )}
                <ul className={s.yarnList} style={{ marginTop: 8 }}>
                  {c.story.ties.map((t) => (
                    <li key={t.to}>
                      <span className={s.yarn}>→ {nameOf(t.to)}</span> {t.text}
                      {t.public && (
                        <span style={{ display: "block", fontSize: 13, color: "var(--ink-soft)" }}>
                          board says: {t.public}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <Button
                  component={Link}
                  href={`/${os.slug}/${c.id}`}
                  size="small"
                  aria-label={`Open sheet: ${c.name}`}
                  sx={{ color: "var(--ink-soft)", mt: 1 }}
                >
                  Open sheet
                </Button>
              </div>
            ))}
          </div>
        </main>
      </Container>
    </>
  );
}
