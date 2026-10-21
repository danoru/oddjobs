import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Button, Container } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { requestRole } from "@/lib/auth";
import { loadOneShot } from "@/lib/content";
import type { OneShotWithCast } from "@/systems/tencandles/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { TableKit } from "@/systems/tencandles/components/TableKit";
import k from "@/systems/tencandles/components/Kit.module.css";

type Props = { os: OneShotWithCast };

/**
 * The Ten Candles table kit: the module, a candle and scene tracker, index
 * cards, posters and the flyer. GM only, because the module is: it's rendered
 * per request after the role check, like the GM page.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, resolvedUrl }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  const slug = String(params?.oneshot ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) return { notFound: true };
  let os;
  try {
    os = loadOneShot(slug);
  } catch {
    return { notFound: true };
  }
  if (os.system !== "tencandles") return { notFound: true };
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { os: JSON.parse(JSON.stringify(os)) as OneShotWithCast } };
};

export default function KitPage({ os }: Props) {
  return (
    <>
      <Head>
        <title>{`Table kit · ${os.title} · Oddjobs`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}/gm`, label: "GM's view" }} />
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
