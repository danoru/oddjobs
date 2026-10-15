import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import VisibilityIcon from "@mui/icons-material/Visibility";
import TvIcon from "@mui/icons-material/Tv";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { useClaims } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import { TableNote } from "@/components/board/TableNote";
import { YarnBoard } from "@/components/board/YarnBoard";
import { cameoHook, cameosFor, type Survivor } from "@/lib/legacy";
import { loadSurvivors } from "@/lib/legacy.server";
import s from "@/components/board/Board.module.css";

const ROLE_ORDER = ["tank", "striker", "healer", "support", "control", "face", "scout", "utility"] as const;

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot; cameos: Survivor[] }> = async ({ params }) => {
  const slug = String(params!.oneshot);
  return { props: { os: toPublic(loadOneShot(slug)), cameos: cameosFor(slug, loadSurvivors()) } };
};

export default function JobPage({ os, cameos }: { os: PublicOneShot; cameos: Survivor[] }) {
  const router = useRouter();
  const table = useClaims(os.slug);
  const { claims, claimedBy, toggle } = table;
  const linkCode = typeof router.query.table === "string" ? router.query.table : undefined;
  const claimedCast = os.cast.filter((c) => claims.includes(c.id));
  const covered = new Set(claimedCast.flatMap((c) => c.roles));
  const missingCore = os.coreRoles.filter((id) => !claims.includes(id));
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
              <Button
                component={Link}
                href={`/${os.slug}/tv`}
                variant="outlined"
                size="small"
                startIcon={<TvIcon />}
                sx={{ color: "var(--ink)", borderColor: "var(--ink-soft)" }}
              >
                Board on the TV
              </Button>
              <Button
                component={Link}
                href={`/${os.slug}/epilogue`}
                variant="outlined"
                size="small"
                startIcon={<HistoryEduIcon />}
                sx={{ color: "var(--ink)", borderColor: "var(--ink-soft)" }}
              >
                The morning after
              </Button>
              <Button
                component={Link}
                href={`/${os.slug}/gm`}
                size="small"
                startIcon={<VisibilityIcon />}
                sx={{ color: "var(--ink-soft)" }}
              >
                GM&apos;s view
              </Button>
            </Box>
          </div>

          <TableNote claims={table} initialCode={linkCode} />

          <div className={s.grid}>
            {os.cast.map((c) => (
              <Poster
                key={c.id}
                slug={os.slug}
                character={c}
                core={os.coreRoles.includes(c.id)}
                claim={claimedBy[c.id]}
                onToggleClaim={() => toggle(c.id)}
              />
            ))}
          </div>

          <div className={s.grid} style={{ marginTop: 36 }}>
            <div className={s.note} style={{ ["--tilt" as string]: "1deg", gridColumn: "1 / -1" }}>
              <span className={s.pin} aria-hidden="true" />
              <p className={s.noteTitle}>Who knows whom</p>
              <YarnBoard cast={os.cast} claimedBy={claimedBy} />
            </div>
            <div className={s.note} style={{ ["--tilt" as string]: "-1.4deg" }}>
              <span className={s.pin} aria-hidden="true" />
              <p className={s.noteTitle}>The party so far</p>
              <Typography sx={{ fontFamily: "var(--font-print)", fontSize: 16 }}>
                {claimedCast.length === 0
                  ? "No posters torn down yet."
                  : `${claimedCast.length} of ${os.players.max} posters torn down: ${claimedCast
                      .map((c) => (claimedBy[c.id]?.name ? `${c.name} (${claimedBy[c.id].name})` : c.name))
                      .join(", ")}.`}
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
                {table.table
                  ? `Shared with everyone at table ${table.table}.`
                  : "Claims are remembered on this device only."}
              </Typography>
            </div>
          </div>

          {cameos.length > 0 && (
            <div className={s.grid} style={{ marginTop: 36 }}>
              {cameos.map((v, i) => (
                <div key={v.id} className={s.note} style={{ ["--tilt" as string]: `${i % 2 ? 1.6 : -1.2}deg` }}>
                  <span className={s.brassPin} aria-hidden="true" />
                  <div className={s.postingHeader}>ALSO SEEN IN TOWN</div>
                  <p className={s.postingPitch} style={{ marginTop: 10, marginBottom: 6 }}>
                    {cameoHook(v)}
                  </p>
                  {v.scar && <div className={s.meta}>Known by: {v.scar}</div>}
                  <div className={s.meta} style={{ marginTop: 6 }}>
                    GM: a survivor from another night. Drop them in as an NPC.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
