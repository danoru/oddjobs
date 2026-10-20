import Head from "next/head";
import { Fragment } from "react";
import type { GetServerSideProps } from "next";
import { Button, Container } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { requestRole } from "@/lib/auth";
import { loadOneShot, spellBookFor } from "@/lib/content";
import type { OneShotWithCast } from "@/lib/schema";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import type * as dnd5e from "@/systems/dnd5e/schema";
import { cardsFor, paginate } from "@/systems/dnd5e/cards";
import { SheetBack, SheetFront } from "@/systems/dnd5e/components/sheet/Sheet";
import { CardSheets } from "@/systems/dnd5e/components/cards/CardSheets";
import { Tent } from "@/systems/dnd5e/components/tents/TentsView";
import { TableKit } from "@/systems/tencandles/components/TableKit";
import { SiteHeader } from "@/components/SiteHeader";
import { FlyerSheet } from "@/components/flyer/FlyerSheet";
import { ActCards, BlankGazette, LetterEnvelopes, RumorSlips } from "@/components/box/BoxPrints";
import b from "@/components/box/Box.module.css";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";
import cardCss from "@/systems/dnd5e/components/cards/Cards.module.css";
import tentCss from "@/systems/dnd5e/components/tents/Tents.module.css";

type Props = { os: OneShotWithCast; pub: PublicAnyOneShot; book: Record<string, SpellInfo> };

/**
 * Print the whole box: every printable for a table without phones, in the
 * order the night uses them. GM only, because the sealed letters are printed
 * with their text: rendered per request after the role check, like the GM page.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, resolvedUrl }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  const slug = String(params?.oneshot ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) return { notFound: true };
  let os: OneShotWithCast;
  try {
    os = loadOneShot(slug);
  } catch {
    return { notFound: true };
  }
  res.setHeader("Cache-Control", "private, no-store");
  const book = os.system === "dnd5e" ? spellBookFor(os) : {};
  return { props: JSON.parse(JSON.stringify({ os, pub: toPublic(os), book })) as Props };
};

export default function BoxPage({ os, pub, book }: Props) {
  const fiveE = os.system === "dnd5e" ? (os as dnd5e.OneShotWithCast) : null;
  const names = Object.fromEntries(os.cast.map((c) => [c.id, c.name]));
  const contents = [
    ...(fiveE ? ["The tear-off flyer", `${os.cast.length} character sheets`, "Spell, item and feature cards", "Name tents"] : ["The table kit: module, candle tracker, index cards, missing posters and flyer"]),
    ...(os.letters.length ? [`${os.letters.length} sealed letters, as fold-and-seal envelopes`] : []),
    ...(os.acts.length ? [`${os.acts.length} act cards`] : []),
    ...(os.rumors.length ? [`${os.rumors.length} rumor slips`] : []),
    "A blank gazette for the morning after",
  ];

  return (
    <>
      <Head>
        <title>{`The whole box · ${os.title} · Tear-Off`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}/gm`, label: "GM's view" }} />
        <main id="main">
          <div className={`${b.toolbar} no-print`}>
            <span style={{ flex: 1 }}>
              Everything for a table without phones, in the order you&apos;ll use it. Print at 100% with background graphics on.
              The letters carry their text: keep the box behind your screen.
            </span>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
              Print the whole box
            </Button>
          </div>
          <ol className={`${b.contents} no-print`}>
            {contents.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>

          {fiveE ? (
            <>
              <div className={b.section} data-box="flyer">
                <FlyerSheet os={pub} level={fiveE.level} base={pub} />
              </div>
              <div className={`${b.section} ${sheet.sheet}`} data-box="sheets">
                {fiveE.cast.map((c) => (
                  <Fragment key={c.id}>
                    <SheetFront c={c} ruleset={fiveE.ruleset} homebrew={fiveE.homebrew} oneshotTitle={os.title} />
                    <SheetBack c={c} oneshotTitle={os.title} names={names} />
                  </Fragment>
                ))}
              </div>
              <div className={`${b.section} ${cardCss.root}`} data-box="cards">
                {fiveE.cast.map((c) => {
                  const cards = cardsFor(c, fiveE.ruleset, book);
                  return cards.length ? <CardSheets key={c.id} cards={cards} large={false} label={`${c.name}'s cards`} /> : null;
                })}
              </div>
              <div className={`${b.section} ${tentCss.root}`} data-box="tents">
                {paginate(fiveE.cast, 2).map((pair, i) => (
                  <div key={i} className={tentCss.page}>
                    {pair.map((c) => (
                      <Tent key={c.id} c={c} ruleset={fiveE.ruleset} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            os.system === "tencandles" && (
              <div className={b.section} data-box="kit">
                <TableKit os={os} />
              </div>
            )
          )}

          {os.letters.length > 0 && (
            <div className={b.section}>
              <LetterEnvelopes os={os} />
            </div>
          )}
          {os.acts.length > 0 && (
            <div className={b.section}>
              <ActCards os={os} />
            </div>
          )}
          {os.rumors.length > 0 && (
            <div className={b.section}>
              <RumorSlips os={os} />
            </div>
          )}
          <div className={b.section}>
            <BlankGazette os={os} />
          </div>
        </main>
      </Container>
    </>
  );
}
