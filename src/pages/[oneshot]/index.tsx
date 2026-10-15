import Head from "next/head";
import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { useClaims } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import s from "@/components/board/Board.module.css";

/**
 * Ties as undirected pairs for the public board. Only each tie's `public` line
 * is shown — the full text can hold secrets and stays on the player's sheet.
 */
function tiePairs(os: PublicOneShot) {
  const label = (id: string) => {
    const c = os.cast.find((x) => x.id === id);
    return c ? (c.poster.alias ?? c.name) : id;
  };
  const byKey = new Map<string, { key: string; a: string; b: string; public: string[] }>();
  for (const c of os.cast) {
    for (const t of c.story.ties) {
      const [x, y] = [c.id, t.to].sort();
      const key = `${x}|${y}`;
      const pair = byKey.get(key) ?? { key, a: label(x), b: label(y), public: [] };
      // A mystery character's ties stay mysterious.
      if (t.public && !c.poster.alias) pair.public.push(t.public);
      byKey.set(key, pair);
    }
  }
  return [...byKey.values()];
}

const ROLE_ORDER = ["tank", "striker", "healer", "support", "control", "face", "scout", "utility"] as const;

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot }> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
});

export default function JobPage({ os }: { os: PublicOneShot }) {
  const { claims, toggle } = useClaims(os.slug);
  const claimedCast = os.cast.filter((c) => claims.includes(c.id));
  const covered = new Set(claimedCast.flatMap((c) => c.roles));
  const missingCore = os.coreRoles.filter((id) => !claims.includes(id));
  const pairs = tiePairs(os);
  const nameOf = (id: string) => {
    const c = os.cast.find((x) => x.id === id);
    return c ? (c.poster.alias ?? c.name) : id;
  };

  return (
    <>
      <Head>
        <title>{`${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/", label: "the board" }} />

        <div className={s.frame}>
          <div className={s.note} style={{ ["--tilt" as string]: "-0.6deg", marginBottom: 32 }}>
            <span className={s.brassPin} aria-hidden="true" />
            <span className={os.ruleset === "2014" ? s.stamp2014 : s.stamp2024}>{os.ruleset} rules</span>
            <div className={s.postingHeader}>{os.posting.header}</div>
            <h1 className={s.postingTitle} style={{ fontSize: "clamp(30px, 5vw, 46px)" }}>
              {os.title}
            </h1>
            <p className={s.postingPitch} style={{ fontSize: 19 }}>
              {os.premise}
            </p>
            <div className={s.meta}>
              <span>Level {os.level}</span>
              <span>
                {os.players.min}–{os.players.max} players
              </span>
              <span>~{os.durationHrs} hrs</span>
              <span>{os.setting}</span>
            </div>
            <div className={s.reward}>Reward: {os.posting.reward}</div>
            {os.content.warnings.length > 0 && (
              <div className={s.meta} style={{ marginTop: 8 }}>
                <span>Content: {os.content.warnings.join(", ")}</span>
              </div>
            )}
            <Box className="no-print" sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
              <Button
                component={Link}
                href={`/${os.slug}/print`}
                variant="outlined"
                size="small"
                startIcon={<PrintIcon />}
                sx={{ color: "var(--ink)", borderColor: "var(--ink-soft)" }}
              >
                Print every sheet
              </Button>
              <Button
                component={Link}
                href={`/${os.slug}/flyer`}
                variant="outlined"
                size="small"
                startIcon={<ContentCutIcon />}
                sx={{ color: "var(--ink)", borderColor: "var(--ink-soft)" }}
              >
                Print the tear-off flyer
              </Button>
            </Box>
          </div>

          <div className={s.grid}>
            {os.cast.map((c) => (
              <Poster
                key={c.id}
                slug={os.slug}
                character={c}
                core={os.coreRoles.includes(c.id)}
                claimed={claims.includes(c.id)}
                onToggleClaim={() => toggle(c.id)}
              />
            ))}
          </div>

          <div className={s.grid} style={{ marginTop: 36 }}>
            <div className={s.note} style={{ ["--tilt" as string]: "1deg", gridColumn: "1 / -1" }}>
              <span className={s.pin} aria-hidden="true" />
              <p className={s.noteTitle}>Who knows whom</p>
              <ul className={s.yarnList}>
                {pairs.map((pair) => (
                  <li key={pair.key}>
                    <span className={s.yarn}>
                      {pair.a} — {pair.b}
                    </span>{" "}
                    {pair.public.join(" · ")}
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.note} style={{ ["--tilt" as string]: "-1.4deg" }}>
              <span className={s.pin} aria-hidden="true" />
              <p className={s.noteTitle}>The party so far</p>
              <Typography sx={{ fontFamily: "var(--font-print)", fontSize: 16 }}>
                {claimedCast.length === 0
                  ? "No posters torn down yet."
                  : `${claimedCast.length} of ${os.players.max} posters torn down: ${claimedCast.map((c) => c.name).join(", ")}.`}
              </Typography>
              <div className={s.roleChips} aria-label="Party roles covered">
                {ROLE_ORDER.map((r) => (
                  <span key={r} className={covered.has(r) ? s.roleChipOn : s.roleChip}>
                    {r}
                  </span>
                ))}
              </div>
              {claimedCast.length > 0 && missingCore.length > 0 && (
                <Typography sx={{ fontFamily: "var(--font-print)", fontStyle: "italic", fontSize: 15, mt: 1.5 }}>
                  Still needed: {missingCore.map(nameOf).join(", ")}.
                </Typography>
              )}
              <Typography sx={{ fontFamily: "var(--font-label)", fontSize: 12, color: "var(--ink-soft)", mt: 1.5 }}>
                Claims are remembered on this device only.
              </Typography>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
