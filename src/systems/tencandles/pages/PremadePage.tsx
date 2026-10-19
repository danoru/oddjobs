import Head from "next/head";
import Link from "next/link";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import type { PublicTcOneShot } from "@/lib/public";
import { useClaims } from "@/lib/storage";
import { playRip } from "@/lib/rip";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import b from "@/components/board/Board.module.css";
import k from "@/components/board/Skins.module.css";

const text = { fontFamily: "var(--font-print)", fontSize: 18, lineHeight: 1.45 } as const;

/**
 * A Ten Candles pre-made: a name, a look and who they were before the dark.
 * Players still write their traits, Moment and Brink at the table; taking a
 * pre-made only fills in the concept on their phone.
 */
export function PremadePage({ os, id }: { os: PublicTcOneShot; id: string }) {
  const c = os.cast.find((x) => x.id === id)!;
  const { claimedBy, toggle, table, player } = useClaims(os.slug);
  const claim = claimedBy[id];
  const nameOf = (to: string) => os.cast.find((x) => x.id === to)?.name ?? to;

  return (
    <>
      <Head>
        <title>{`${c.name} · ${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" }, gap: { xs: 3, md: 4 }, alignItems: "start" }}>
          <Box component="aside" aria-label="Poster and actions" className="no-print">
            <div className={k.skinned} data-skin={os.skin}>
              <Poster slug={os.slug} character={c} claim={claim} skin={os.skin} linked={false} revealName tilt={-1.2} />
            </div>
            <Stack spacing={1} sx={{ mt: 3 }}>
              {!claim && (!table || player) && (
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<ContentCutIcon />}
                  onClick={() => {
                    playRip();
                    toggle(id);
                  }}
                >
                  Take this one
                </Button>
              )}
              {claim?.mine && (
                <Button size="small" sx={{ color: "text.secondary" }} onClick={() => toggle(id)}>
                  Put them back on the board
                </Button>
              )}
              <Button variant="contained" startIcon={<LocalFireDepartmentIcon />} component={Link} href={`/${os.slug}/play`}>
                At the table
              </Button>
            </Stack>
            {claim && !claim.mine && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {claim.name ?? "Someone"} has taken this one.
              </Typography>
            )}
          </Box>

          <main id="main" tabIndex={-1} className={b.note} style={{ ["--tilt" as string]: "0deg" }}>
            <span className={b.pin} aria-hidden="true" />
            <div className={b.postingHeader}>Ten Candles · a pre-made concept</div>
            <h1 className={b.postingTitle}>{c.name}</h1>
            <p style={{ ...text, fontStyle: "italic", textAlign: "center", marginTop: 0 }}>{c.poster.epithet}</p>
            <p style={text}>{c.story.concept}</p>
            <h2 className={b.noteTitle}>Tonight they look like</h2>
            <p style={text}>{c.story.look}</p>
            {c.story.stake && (
              <>
                <h2 className={b.noteTitle}>Out here because</h2>
                <p style={text}>{c.story.stake}</p>
              </>
            )}
            {c.story.carrying.length > 0 && (
              <>
                <h2 className={b.noteTitle}>In their pockets</h2>
                <p style={text}>{c.story.carrying.join(", ")}.</p>
              </>
            )}
            {c.story.namePrompts.length > 0 && (
              <>
                <h2 className={b.noteTitle}>Or call them</h2>
                <p style={text}>{c.story.namePrompts.join(" · ")}</p>
              </>
            )}
            {c.story.ties.length > 0 && (
              <>
                <h2 className={b.noteTitle}>Who they know</h2>
                <ul className={b.yarnList}>
                  {c.story.ties.map((t) => (
                    <li key={t.to}>
                      <span className={b.yarn}>→ {nameOf(t.to)}</span> {t.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p style={{ ...text, fontSize: 15, color: "var(--ink-soft)", marginTop: 18 }}>
              No traits here on purpose: in Ten Candles your Virtue and Vice come from the players either side of you, and
              you write your own Moment at the table.
            </p>
          </main>
        </Box>
      </Container>
    </>
  );
}
