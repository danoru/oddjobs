import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import StyleIcon from "@mui/icons-material/Style";
import BadgeIcon from "@mui/icons-material/Badge";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import type { PublicDhOneShot } from "@/lib/public";
import type { Character } from "@/systems/daggerheart/schema";
import { useClaims, useReading } from "@/lib/storage";
import { readingAttrs } from "@/lib/reading";
import { downloadToken } from "@/lib/token";
import { playRip } from "@/lib/rip";
import { useLive } from "@/lib/useLive";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import { PlayerExtras } from "@/components/table/PlayerExtras";
import { TableToys } from "@/components/table/TableToys";
import type { DhRoll } from "@/systems/daggerheart/rolls";
import { SheetBack, SheetFront } from "@/systems/daggerheart/components/Sheet";
import { DamageCard, DualityTray, noMarks, useTallies } from "@/systems/daggerheart/components/Table";
import k from "@/components/board/Skins.module.css";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";

/**
 * A Daggerheart character: the poster, the two-page sheet and the printables.
 * At a table with this poster torn, the phone becomes the sheet in play:
 * tap a trait or weapon to roll the duality dice, tap the slots to mark Hit
 * Points, Stress, Armor and Hope, and see the GM's Fear.
 */
export function CharacterPage({ os, id }: { os: PublicDhOneShot; id: string }) {
  const { reading } = useReading();
  const c = os.cast.find((x) => x.id === id)! as Character;
  const { claimedBy, toggle, table, player, error } = useClaims(os.slug);
  const claim = claimedBy[id];
  const claimed = Boolean(claim);
  const needsName = Boolean(table && !player);
  const names = Object.fromEntries(os.cast.map((x) => [x.id, x.name]));
  const seated = Boolean(table && player && claim?.mine);
  const live = useLive(seated ? table : null, "player", player?.id ?? null);
  const tallies = useTallies(live.events, os.cast as Character[]);
  const marks = tallies.marks[id] ?? noMarks;
  const [armed, setArmed] = useState<DhRoll | null>(null);
  const mark = (track: "hope" | "stress" | "hp" | "armor", delta: number) => void live.act({ type: "mark", track, delta });

  return (
    <>
      <Head>
        <title>{`${c.name} · ${os.title} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: seated ? 20 : 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} reading />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "250px minmax(0, 1fr)" }, gap: { xs: 3, md: 4 }, alignItems: "start" }}>
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
              <Button variant="outlined" startIcon={<StyleIcon />} component={Link} href={`/${os.slug}/${id}/cards`}>
                Domain &amp; item cards
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
              Level {c.mech.level}. Printing works on Letter or A4: pick the paper size in your print dialog.
            </Typography>
          </Box>

          <main id="main" tabIndex={-1} className={sheet.sheet} {...readingAttrs(reading)}>
            {seated && table && player && (
              <div style={{ marginBottom: 24 }}>
                <PlayerExtras code={table} playerId={player.id} characterId={id} flashback={c.flashback} />
                {live.you && <DamageCard live={live} c={c} marks={marks} fear={tallies.fear} />}
                <TableToys live={live} coin={null} rumors={os.hasRumors} />
              </div>
            )}
            <SheetFront
              c={c}
              oneshotTitle={os.title}
              titleAs="h1"
              onRoll={seated ? (r) => setArmed({ ...r }) : undefined}
              marks={seated ? marks : undefined}
              onMark={seated && live.you ? mark : undefined}
            />
            <SheetBack c={c} oneshotTitle={os.title} names={names} sealedSecret sectionAs="h2" />
          </main>
        </Box>
      </Container>
      {seated && <DualityTray live={live} armed={armed} c={c} marks={marks} />}
    </>
  );
}
