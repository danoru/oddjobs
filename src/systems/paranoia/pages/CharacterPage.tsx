import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import StyleIcon from "@mui/icons-material/Style";
import BadgeIcon from "@mui/icons-material/Badge";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import type { PublicPaOneShot } from "@/lib/public";
import { useClaims, useReading } from "@/lib/storage";
import { readingAttrs } from "@/lib/reading";
import { downloadToken } from "@/lib/token";
import { playRip } from "@/lib/rip";
import { useLive } from "@/lib/useLive";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import { PlayerExtras } from "@/components/table/PlayerExtras";
import { TableToys } from "@/components/table/TableToys";
import { treasonNames } from "@/systems/paranoia/rules";
import { useSecret } from "@/systems/paranoia/useSecrets";
import { NaughtySide, PlayAidNotice, PublicSide, type NodeSpec } from "@/systems/paranoia/components/Sheet";
import { ComputerFeed, NodeTray, RecordCard, marksFor, useRecords } from "@/systems/paranoia/components/Table";
import k from "@/components/board/Skins.module.css";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";

/**
 * A Troubleshooter: the poster, the public side of the sheet, and (at a table,
 * to whoever accepted the assignment) the naughty side, fetched from the
 * server, never part of this page. At a table the phone rolls NODE from the
 * sheet, keeps the record, files treason reports and hears Friend Computer.
 */
export function CharacterPage({ os, id }: { os: PublicPaOneShot; id: string }) {
  const { reading } = useReading();
  const c = os.cast.find((x) => x.id === id)!;
  const { claimedBy, toggle, table, player, error } = useClaims(os.slug);
  const claim = claimedBy[id];
  const needsName = Boolean(table && !player);
  const seated = Boolean(table && player && claim?.mine);
  const live = useLive(seated ? table : null, "player", player?.id ?? null);
  const records = useRecords(live.events, os.cast, os.houseRules);
  const marks = marksFor(records, c);
  const { secret, error: secretError } = useSecret(table, player?.id ?? null, id, seated);
  const [armed, setArmed] = useState<NodeSpec | null>(null);

  return (
    <>
      <Head>
        <title>{`${c.name} · ${os.title} · Tear-Off`}</title>
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
                {claim?.name ? (claim.mine ? `You accepted this assignment at table ${table}.` : `${claim.name} accepted this assignment at table ${table}.`) : `Still unassigned at table ${table}.`}
              </Typography>
            )}
            {error && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                {error}
              </Typography>
            )}
            <Stack spacing={1} sx={{ mt: 3 }}>
              {!claim && needsName && (
                <Button component={Link} href={`/${os.slug}`} variant="contained" color="secondary">
                  Join table {table} to claim
                </Button>
              )}
              {!claim && !needsName && (
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<ContentCutIcon />}
                  onClick={() => {
                    playRip();
                    toggle(id);
                  }}
                >
                  Accept the assignment
                </Button>
              )}
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                Print sheet
              </Button>
              <Button variant="outlined" startIcon={<StyleIcon />} component={Link} href={`/${os.slug}/${id}/cards`}>
                Clone ID &amp; gear cards
              </Button>
              <Button variant="outlined" startIcon={<BadgeIcon />} component={Link} href={`/${os.slug}/${id}/tent`}>
                Name tent
              </Button>
              <Button variant="outlined" startIcon={<AccountCircleIcon />} onClick={() => void downloadToken(os.slug, c)}>
                Token PNG
              </Button>
              {claim?.mine && (
                <Button size="small" sx={{ color: "text.secondary" }} onClick={() => toggle(id)}>
                  Hand the assignment back
                </Button>
              )}
            </Stack>
          </Box>

          <main id="main" tabIndex={-1} className={sheet.sheet} {...readingAttrs(reading)}>
            {seated && table && player && (
              <div style={{ marginBottom: 24 }} className="no-print">
                <ComputerFeed events={live.events} />
                <PlayerExtras code={table} playerId={player.id} characterId={id} flashback={c.flashback} />
                {live.you && <RecordCard live={live} c={c} marks={marks} h={os.houseRules} />}
                <TableToys live={live} coin={null} rumors={os.hasRumors} />
              </div>
            )}
            <PublicSide
              c={c}
              team={os.team}
              objectives={os.objectives}
              oneshotTitle={os.title}
              titleAs="h1"
              onRoll={seated ? (r) => setArmed({ ...r }) : undefined}
              marks={seated ? marks : undefined}
              onMark={seated && live.you ? (track, delta) => void live.act({ type: "pmark", track, delta }) : undefined}
              wanted={treasonNames(os.houseRules)}
            />
            {secret ? (
              <NaughtySide c={c} naughty={secret} oneshotTitle={os.title} sealed sectionAs="h2" />
            ) : (
              <section className={sheet.page}>
                <h2 className={sheet.sectionTitle} style={{ marginTop: 0 }}>
                  The naughty side
                </h2>
                <p>
                  {seated
                    ? (secretError ?? "Fetching your secret briefing from a source the Computer doesn't know about…")
                    : "Your secret society, mutant power and secret objectives aren't on this page. Accept the assignment at a table and they're handed to you, and only you; or the GM gives you a printed copy, face down."}
                </p>
                <PlayAidNotice />
              </section>
            )}
          </main>
        </Box>
      </Container>
      {seated && <NodeTray live={live} armed={armed} marks={marks} />}
    </>
  );
}
