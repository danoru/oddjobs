import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import TuneIcon from "@mui/icons-material/Tune";
import ChecklistIcon from "@mui/icons-material/Checklist";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import StyleIcon from "@mui/icons-material/Style";
import BadgeIcon from "@mui/icons-material/Badge";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import type { PublicOneShot } from "@/lib/public";
import { applyTweaks, hasTweaks } from "@/systems/dnd5e/customize";
import { useClaims, useLevel, useReading, useTweaks } from "@/lib/storage";
import { readingAttrs } from "@/lib/reading";
import { downloadToken } from "@/lib/token";
import { playRip } from "@/lib/rip";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import { SheetBack, SheetFront } from "@/systems/dnd5e/components/sheet/Sheet";
import { PlayerExtras } from "@/components/table/PlayerExtras";
import { DiceTray, TableToys } from "@/components/table/TableToys";
import { useLive } from "@/lib/useLive";
import { coinFor } from "@/systems/registry";
import type { RollSpec } from "@/systems/dnd5e/rolls";
import { CustomizeDrawer } from "@/systems/dnd5e/components/sheet/CustomizeDrawer";
import { FoundryDialog, RecipeDialog } from "@/systems/dnd5e/components/sheet/ExportDialogs";
import k from "@/components/board/Skins.module.css";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";

/** A 5e character: the poster, the two-page sheet and every export. */
export function CharacterPage({ os: base, id }: { os: PublicOneShot; id: string }) {
  const { os, level } = useLevel(base);
  const { reading } = useReading();
  const stock = os.cast.find((c) => c.id === id)!;
  const { tweaks, setTweaks } = useTweaks(os.slug, id);
  const { claimedBy, toggle, table, player, error } = useClaims(os.slug);
  const c = useMemo(() => applyTweaks(stock, tweaks), [stock, tweaks]);
  const claim = claimedBy[id];
  const claimed = Boolean(claim);
  // At a table you need a name before tearing; that's asked on the job page.
  const needsName = Boolean(table && !player);
  const names = Object.fromEntries(os.cast.map((x) => [x.id, x.id === id ? c.name : x.name]));
  const [panel, setPanel] = useState<null | "customize" | "recipe" | "foundry">(null);
  // At a table with this poster torn: the dice tray, the bell, notes, coins and rumors.
  const seated = Boolean(table && player && claim?.mine);
  const live = useLive(seated ? table : null, "player", player?.id ?? null);
  const [armed, setArmed] = useState<RollSpec | null>(null);
  const coin = coinFor(os);

  return (
    <>
      <Head>
        <title>{`${c.name} · ${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: seated ? 16 : 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} reading />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "250px minmax(0, 1fr)" },
            gap: { xs: 3, md: 4 },
            alignItems: "start",
          }}
        >
          <Box component="aside" aria-label="Poster and actions" className="no-print" sx={{ position: { md: "sticky" }, top: 16 }}>
            <div className={k.skinned} data-skin={os.skin}>
              <Poster slug={os.slug} character={c} claim={claim} skin={os.skin} linked={false} revealName tilt={-1.2} />
            </div>

            {(table || claim?.name) && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {claim?.name
                  ? claim.mine
                    ? `You tore this one down at table ${table}.`
                    : `${claim.name} tore this one down at table ${table}.`
                  : `Still on the board at table ${table}.`}
              </Typography>
            )}
            {error && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                {error}
              </Typography>
            )}

            <Stack spacing={1} sx={{ mt: 3 }}>
              {!claimed && needsName && (
                <Button component={Link} href={`/${os.slug}`} variant="contained" color="secondary">
                  Join table {table} to claim
                </Button>
              )}
              {!claimed && !needsName && (
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
              <Button variant="outlined" startIcon={<StyleIcon />} component={Link} href={`/${os.slug}/${id}/cards`}>
                Spell &amp; item cards
              </Button>
              <Button variant="outlined" startIcon={<BadgeIcon />} component={Link} href={`/${os.slug}/${id}/tent`}>
                Name tent
              </Button>
              <Button variant="outlined" startIcon={<AccountCircleIcon />} onClick={() => void downloadToken(os.slug, c)}>
                Token PNG
              </Button>
              {claim?.mine && (
                <Button size="small" sx={{ color: "text.secondary" }} onClick={() => toggle(id)}>
                  Pin the poster back up
                </Button>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Level {level}. Printing works on Letter or A4: pick the paper size in your print dialog.
            </Typography>
          </Box>

          <main id="main" tabIndex={-1} className={sheet.sheet} {...readingAttrs(reading)}>
            {table && player && claim?.mine && (
              <div style={{ marginBottom: 24 }}>
                <PlayerExtras code={table} playerId={player.id} characterId={id} flashback={stock.flashback} />
                <TableToys live={live} coin={coin} rumors={os.hasRumors} />
              </div>
            )}
            <SheetFront c={c} ruleset={os.ruleset} homebrew={os.homebrew} oneshotTitle={os.title} titleAs="h1" onRoll={seated ? (r) => setArmed({ ...r }) : undefined} />
            <SheetBack c={c} oneshotTitle={os.title} names={names} sealedSecret sectionAs="h2" />
          </main>
        </Box>
      </Container>

      {seated && <DiceTray live={live} armed={armed} coin={coin} />}
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
