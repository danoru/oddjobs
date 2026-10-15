import Head from "next/head";
import { useMemo, useState } from "react";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import TuneIcon from "@mui/icons-material/Tune";
import ChecklistIcon from "@mui/icons-material/Checklist";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { applyTweaks, hasTweaks } from "@/lib/customize";
import { useClaims, useTweaks } from "@/lib/storage";
import { playRip } from "@/lib/rip";
import { SiteHeader } from "@/components/SiteHeader";
import { PosterIcon } from "@/components/PosterIcon";
import { SheetBack, SheetFront } from "@/components/sheet/Sheet";
import { CustomizeDrawer } from "@/components/sheet/CustomizeDrawer";
import { FoundryDialog, RecipeDialog } from "@/components/sheet/ExportDialogs";
import b from "@/components/board/Board.module.css";
import sheet from "@/components/sheet/Sheet.module.css";

type Props = { os: PublicOneShot; id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().flatMap((slug) =>
    loadOneShot(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))), id: String(params!.character) },
});

export default function CharacterPage({ os, id }: Props) {
  const stock = os.cast.find((c) => c.id === id)!;
  const { tweaks, setTweaks } = useTweaks(os.slug, id);
  const { claims, toggle } = useClaims(os.slug);
  const c = useMemo(() => applyTweaks(stock, tweaks), [stock, tweaks]);
  const claimed = claims.includes(id);
  const names = Object.fromEntries(os.cast.map((x) => [x.id, x.id === id ? c.name : x.name]));
  const [panel, setPanel] = useState<null | "customize" | "recipe" | "foundry">(null);

  return (
    <>
      <Head>
        <title>{`${c.name} · ${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "250px minmax(0, 1fr)" },
            gap: { xs: 3, md: 4 },
            alignItems: "start",
          }}
        >
          <Box className="no-print" sx={{ position: { md: "sticky" }, top: 16 }}>
            <div className={b.poster} style={{ ["--tilt" as string]: "-1.2deg", paddingBottom: 14 }}>
              <span className={b.pin} aria-hidden="true" />
              <div className={b.posterHeader}>{c.poster.header}</div>
              <div className={b.engraving}>
                {c.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.portrait} alt="" />
                ) : (
                  <PosterIcon icon={c.poster.icon} size={72} />
                )}
              </div>
              <div className={b.posterName}>{c.name}</div>
              <div className={b.posterEpithet}>{c.poster.epithet}</div>
              <p className={b.posterHook}>{c.poster.hook}</p>
              {claimed && <span className={b.claimedStamp}>CLAIMED</span>}
            </div>

            <Stack spacing={1} sx={{ mt: 3 }}>
              {!claimed && (
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<ContentCutIcon />}
                  onClick={() => {
                    playRip();
                    toggle(id);
                  }}
                >
                  Tear to claim
                </Button>
              )}
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                Print sheet
              </Button>
              <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setPanel("customize")}>
                Customize{hasTweaks(tweaks) ? " (edited)" : ""}
              </Button>
              <Button variant="outlined" startIcon={<ChecklistIcon />} onClick={() => setPanel("recipe")}>
                D&amp;D Beyond recipe
              </Button>
              <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => setPanel("foundry")}>
                Foundry actor (beta)
              </Button>
              {claimed && (
                <Button size="small" sx={{ color: "text.secondary" }} onClick={() => toggle(id)}>
                  Pin the poster back up
                </Button>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Printing works on Letter or A4: pick the paper size in your print dialog.
            </Typography>
          </Box>

          <main className={sheet.sheet}>
            <SheetFront c={c} ruleset={os.ruleset} oneshotTitle={os.title} />
            <SheetBack c={c} oneshotTitle={os.title} names={names} sealedSecret />
          </main>
        </Box>
      </Container>

      <CustomizeDrawer
        open={panel === "customize"}
        onClose={() => setPanel(null)}
        stock={stock}
        tweaks={tweaks}
        onChange={setTweaks}
      />
      <RecipeDialog open={panel === "recipe"} onClose={() => setPanel(null)} c={c} ruleset={os.ruleset} />
      <FoundryDialog
        open={panel === "foundry"}
        onClose={() => setPanel(null)}
        c={c}
        oneshot={{ slug: os.slug, title: os.title, ruleset: os.ruleset }}
      />
    </>
  );
}
