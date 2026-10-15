import Head from "next/head";
import { useMemo } from "react";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { applyTweaks } from "@/lib/customize";
import { useTweaks } from "@/lib/storage";
import type { Character } from "@/lib/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { SheetBack, SheetFront } from "@/components/sheet/Sheet";
import sheet from "@/components/sheet/Sheet.module.css";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot }> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
});

/** One character, with whatever tweaks this device has saved for them. */
function CastSheet({ os, stock, names }: { os: PublicOneShot; stock: Character; names: Record<string, string> }) {
  const { tweaks } = useTweaks(os.slug, stock.id);
  const c = useMemo(() => applyTweaks(stock, tweaks), [stock, tweaks]);
  return (
    <>
      <SheetFront c={c} ruleset={os.ruleset} oneshotTitle={os.title} />
      <SheetBack c={c} oneshotTitle={os.title} names={names} />
    </>
  );
}

export default function PrintCastPage({ os }: { os: PublicOneShot }) {
  const names = Object.fromEntries(os.cast.map((c) => [c.id, c.name]));
  return (
    <>
      <Head>
        <title>{`Print · ${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <Box className="no-print" sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 3 }}>
          <Typography sx={{ flex: 1, minWidth: 240 }} color="text.secondary">
            {os.cast.length} characters, two pages each. Secrets are printed, so hand each one over face down.
          </Typography>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print every sheet
          </Button>
        </Box>
        <main className={sheet.sheet}>
          {os.cast.map((c) => (
            <CastSheet key={c.id} os={os} stock={c} names={names} />
          ))}
        </main>
      </Container>
    </>
  );
}
