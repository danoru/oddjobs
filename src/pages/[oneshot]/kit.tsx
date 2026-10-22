import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Button, Container } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { gmPage } from "@/lib/games.server";
import type { OneShotWithCast } from "@/systems/tencandles/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { TableKit } from "@/systems/tencandles/components/TableKit";
import k from "@/systems/tencandles/components/Kit.module.css";

type Props = { os: OneShotWithCast; code: string };

/**
 * The Ten Candles table kit: the module, a candle and scene tracker, index
 * cards, posters and the flyer, for one game (`?game=<code>`). Its GM's only,
 * because the module is: rendered per request after the same check as the
 * GM page.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, resolvedUrl, query }) => {
  const slug = String(params?.oneshot ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) return { notFound: true };
  const page = await gmPage({ req, resolvedUrl, query }, slug);
  if (!("game" in page)) return page;
  if (page.os.system !== "tencandles") return { notFound: true };
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { os: JSON.parse(JSON.stringify(page.os)) as OneShotWithCast, code: page.game.code } };
};

export default function KitPage({ os, code }: Props) {
  return (
    <>
      <Head>
        <title>{`Table kit · ${os.title} · Oddjobs`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}/gm?game=${code}`, label: "GM's view" }} />
        <main id="main">
          <div className={`${k.toolbar} no-print`}>
            <span style={{ flex: 1 }}>
              The module and the GM&apos;s notes come first, then a candle and scene tracker, {os.players.max} sets of
              index cards (3 × 5 in, cut on the dashed lines), the missing posters and the flyer. Print at 100%.
            </span>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
              Print the kit
            </Button>
          </div>
          <TableKit os={os} />
        </main>
      </Container>
    </>
  );
}
