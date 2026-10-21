import Head from "next/head";
import { useMemo } from "react";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import type { PublicOneShot } from "@/lib/public";
import { applyTweaks } from "@/systems/dnd5e/customize";
import { useLevel, useReading, useTweaks } from "@/lib/storage";
import { readingAttrs } from "@/lib/reading";
import type { Character } from "@/systems/dnd5e/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { SheetBack, SheetFront } from "@/systems/dnd5e/components/sheet/Sheet";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";

/** One character, with whatever tweaks this device has saved for them. */
function CastSheet({ os, stock, names }: { os: PublicOneShot; stock: Character; names: Record<string, string> }) {
  const { tweaks } = useTweaks(os.slug, stock.id);
  const c = useMemo(() => applyTweaks(stock, tweaks), [stock, tweaks]);
  return (
    <>
      <SheetFront c={c} ruleset={os.ruleset} homebrew={os.homebrew} oneshotTitle={os.title} />
      <SheetBack c={c} oneshotTitle={os.title} names={names} />
    </>
  );
}

/** Every 5e sheet in the cast, ready to print. */
export function PrintCastPage({ os: base }: { os: PublicOneShot }) {
  const { os, level } = useLevel(base);
  const { reading } = useReading();
  const names = Object.fromEntries(os.cast.map((c) => [c.id, c.name]));
  return (
    <>
      <Head>
        <title>{`Print · ${os.title} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} reading />
        <Box className="no-print" sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 3 }}>
          <Typography sx={{ flex: 1, minWidth: 240 }} color="text.secondary">
            {os.cast.length} characters at level {level}, {reading.large ? "about four pages each in large print" : "two pages each"}.
            Secrets are printed, so hand each one over face down.
          </Typography>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print every sheet
          </Button>
        </Box>
        <main id="main" className={sheet.sheet} {...readingAttrs(reading)}>
          {os.cast.map((c) => (
            <CastSheet key={c.id} os={os} stock={c} names={names} />
          ))}
        </main>
      </Container>
    </>
  );
}
