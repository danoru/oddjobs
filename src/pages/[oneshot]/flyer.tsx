import Head from "next/head";
import { useEffect, useState } from "react";
import type { GetStaticPaths, GetStaticProps } from "next";
import QRCode from "qrcode";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { useLevel } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import f from "@/components/flyer/Flyer.module.css";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot }> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
});

/** The physical version of the board: a flyer with one tear-off strip per character. */
export default function FlyerPage({ os: base }: { os: PublicOneShot }) {
  const { os, level } = useLevel(base);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  // QR targets depend on where the site is deployed, so build them in the browser.
  useEffect(() => {
    let alive = true;
    Promise.all(
      os.cast.map(async (c) => {
        // Off the written level, the strip carries the level so the sheet opens at it.
        const url = `${window.location.origin}/${os.slug}/${c.id}${level === base.level ? "" : `?level=${level}`}`;
        const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1b1209", light: "#0000" } });
        return [c.id, svg] as const;
      }),
    ).then((pairs) => alive && setQrs(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [os, level, base.level]);

  return (
    <>
      <Head>
        <title>{`Flyer · ${os.title} · Tear-Off`}</title>
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

        <article className={f.flyer} id="main">
          <div className={f.header}>{os.posting.header}</div>
          <h1 className={f.title}>{os.title}</h1>
          <p className={f.premise}>{os.premise}</p>
          <div className={f.details}>
            <span>Level {os.level}</span>
            <span>
              {os.players.min}–{os.players.max} players
            </span>
            <span>About {os.durationHrs} hours</span>
            <span>{os.ruleset} rules</span>
          </div>
          <p className={f.reward}>Reward: {os.posting.reward}</p>
          <div className={f.instructions}>Tear one off. Scan it. That&apos;s you.</div>
          <div className={f.strips}>
            {os.cast.map((c, i) => (
              <div key={c.id} className={f.strip}>
                {i === 0 && (
                  <span className={f.scissors} aria-hidden="true">
                    ✂
                  </span>
                )}
                <div className={f.stripText}>
                  <span className={f.stripName}>{c.poster.alias ?? c.name}</span>
                  <span className={f.stripEpithet}>{c.poster.epithet}</span>
                  <span className={f.stripClass}>{c.mech.classes.map((k) => `${k.name} ${k.level}`).join(" / ")}</span>
                </div>
                <div
                  className={f.qr}
                  role="img"
                  aria-label={`QR code for ${c.poster.alias ?? c.name}`}
                  // SVG markup generated locally by the qrcode library.
                  dangerouslySetInnerHTML={{ __html: qrs[c.id] ?? "" }}
                />
              </div>
            ))}
          </div>
        </article>
      </Container>
    </>
  );
}
