import Head from "next/head";
import { useEffect, useState } from "react";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Alert, Box, Button, Container, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { publishedPaths, withPublished } from "@/lib/published";
import { useTableCode } from "@/lib/storage";
import type { Panel } from "@/lib/tapestry";
import { noEdits, type TapestryEdits } from "@/lib/epilogueSchema";
import { SiteHeader } from "@/components/SiteHeader";
import { Frieze, type Layout } from "@/components/tapestry/Tapestry";

export const getStaticPaths: GetStaticPaths = publishedPaths();

export const getStaticProps: GetStaticProps<{ os: PublicAnyOneShot }> = withPublished((os) => ({
  props: { os: toPublic(os) },
}));

type Reply = { panels?: (Panel & { dropped: boolean })[]; edits?: TapestryEdits; gm?: boolean; error?: string };

/**
 * The night's tapestry: a frieze woven from the table's events, to print as
 * a long strip or a poster. The GM can rename or drop panels; everyone at the
 * table can look and print.
 */
export default function TapestryPage({ os }: { os: PublicAnyOneShot }) {
  const code = useTableCode(os.slug);
  const [data, setData] = useState<Reply | null>(null);
  const [layout, setLayout] = useState<Layout>("strip");
  const icons = Object.fromEntries(os.cast.map((c) => [c.id, c.poster.icon]));

  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    fetch(`/api/tables/${code}/tapestry`, { cache: "no-store" })
      .then((res) => res.json() as Promise<Reply>)
      .catch((): Reply => ({ error: "Couldn't reach the table." }))
      .then((json) => alive && setData(json));
    return () => {
      alive = false;
    };
  }, [code, version]);

  async function edit(change: (e: TapestryEdits) => TapestryEdits) {
    const tapestry = change(data?.edits ?? noEdits());
    await fetch(`/api/tables/${code}/epilogue`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tapestry }) });
    setVersion((v) => v + 1);
  }

  return (
    <>
      <Head>
        <title>{`The tapestry · ${os.title} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <main id="main" tabIndex={-1}>
          <Box className="no-print" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              The night&apos;s tapestry
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
              Woven from the table: posters torn, seals broken, the natural 20s and 1s
              {os.system === "tencandles" ? " (here, candles going dark and the dead)" : os.system === "daggerheart" ? " (here, the critical successes)" : ""}, each act, the notes passed and the fates.
              {data?.gm ? " Rename a panel by typing over its title; drop the ones you'd rather forget." : ""}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <ToggleButtonGroup exclusive size="small" value={layout} onChange={(_, v) => v && setLayout(v)} aria-label="Print as">
                <ToggleButton value="strip">Long strip</ToggleButton>
                <ToggleButton value="poster">Poster</ToggleButton>
              </ToggleButtonGroup>
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!data?.panels?.length}>
                Print the tapestry
              </Button>
            </Box>
          </Box>
          {!code && <Alert severity="info">Join or open a table for this one-shot first: the tapestry is woven from a table&apos;s night.</Alert>}
          {data?.error && <Alert severity="warning">{data.error}</Alert>}
          {data?.panels && data.panels.length === 0 && <Alert severity="info">Nothing has happened at table {code} yet.</Alert>}
          {data?.panels && data.panels.length > 0 && (
            <Frieze
              title={os.title}
              panels={data.panels}
              icons={icons}
              layout={layout}
              onRename={data.gm ? (id, title) => void edit((e) => ({ ...e, titles: { ...e.titles, [id]: title } })) : undefined}
              onToggle={
                data.gm
                  ? (id) => void edit((e) => ({ ...e, dropped: e.dropped.includes(id) ? e.dropped.filter((x) => x !== id) : [...e.dropped, id] }))
                  : undefined
              }
            />
          )}
        </main>
      </Container>
    </>
  );
}
