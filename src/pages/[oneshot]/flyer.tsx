import Head from "next/head";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { useLevel } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import { FlyerSheet } from "@/components/flyer/FlyerSheet";
import { onlyIfOnDisk } from "@/lib/onDisk";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicAnyOneShot }> = onlyIfOnDisk(async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
}));

/** The physical version of the board: a flyer with one tear-off strip per character. */
export default function FlyerPage({ os: base }: { os: PublicAnyOneShot }) {
  const { os, level } = useLevel(base);
  return (
    <>
      <Head>
        <title>{`Flyer · ${os.title} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <Box className="no-print" sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 3 }}>
          <Typography sx={{ flex: 1, minWidth: 240 }} color="text.secondary">
            Print this, cut along the dashed lines between strips, and pin it up. Each strip&apos;s QR code opens that
            character&apos;s sheet. Players will need the table password.
          </Typography>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print flyer
          </Button>
        </Box>

        <FlyerSheet os={os} level={level} base={base} id="main" />
      </Container>
    </>
  );
}
