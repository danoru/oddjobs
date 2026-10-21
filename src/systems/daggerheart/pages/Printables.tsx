import Head from "next/head";
import { Fragment, useMemo, useState } from "react";
import { Box, Button, Checkbox, Container, FormControlLabel, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import type { PublicDhOneShot } from "@/lib/public";
import type { Character } from "@/systems/daggerheart/schema";
import type { CardKind } from "@/systems/dnd5e/cards";
import { paginate } from "@/systems/dnd5e/cards";
import { cardsFor, DH_KINDS } from "@/systems/daggerheart/cards";
import { TRAIT_NAMES, derive, signed } from "@/systems/daggerheart/derive";
import { TRAITS } from "@/systems/daggerheart/schema";
import { useReading } from "@/lib/storage";
import { readingAttrs } from "@/lib/reading";
import { SiteHeader } from "@/components/SiteHeader";
import { PosterIcon } from "@/components/PosterIcon";
import { SheetBack, SheetFront, SrdNotice } from "@/systems/daggerheart/components/Sheet";
import { CardSheets } from "@/systems/dnd5e/components/cards/CardSheets";
import { TokenPreview } from "@/systems/dnd5e/components/tents/TentsView";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";
import cardStyles from "@/systems/dnd5e/components/cards/Cards.module.css";
import ts from "@/systems/dnd5e/components/tents/Tents.module.css";

/** Daggerheart's printables: every sheet, the card stacks, and the name tents. */

const cast = (os: PublicDhOneShot) => os.cast as Character[];

export function DhPrintCastPage({ os }: { os: PublicDhOneShot }) {
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
            {os.cast.length} characters at level {os.level}, {reading.large ? "about four pages each in large print" : "two pages each"}. Secrets
            are printed, so hand each one over face down.
          </Typography>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print every sheet
          </Button>
        </Box>
        <main id="main" className={sheet.sheet} {...readingAttrs(reading)}>
          {cast(os).map((c) => (
            <Fragment key={c.id}>
              <SheetFront c={c} oneshotTitle={os.title} />
              <SheetBack c={c} oneshotTitle={os.title} names={names} />
            </Fragment>
          ))}
        </main>
      </Container>
    </>
  );
}

export function DhCardsView({ os, only }: { os: PublicDhOneShot; only?: string }) {
  const { reading } = useReading();
  const [kinds, setKinds] = useState<CardKind[]>(["spell", "item", "feature"]);
  const list = only ? cast(os).filter((c) => c.id === only) : cast(os);
  const who = only ? (list[0]?.name ?? only) : os.title;
  const back = only ? { href: `/${os.slug}/${only}`, label: `${who}'s sheet` } : { href: `/${os.slug}`, label: os.title };
  return (
    <>
      <Head>
        <title>{`Cards · ${who} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={back} reading />
        <Box component="main" id="main" tabIndex={-1}>
          <Box className="no-print" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              {only ? `${who}: cards` : `${os.title}: every card`}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
              Domain cards in each domain&apos;s ink, weapons, armor and features. {reading.large ? "Four large cards" : "Nine cards"} to a page with
              crop marks; each character starts on a fresh page. Print at 100% (no &ldquo;fit to page&rdquo;) with background graphics on.
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Box role="group" aria-label="Which cards" sx={{ display: "flex", flexWrap: "wrap" }}>
                {DH_KINDS.map(({ kind, label }) => (
                  <FormControlLabel
                    key={kind}
                    label={label}
                    control={<Checkbox checked={kinds.includes(kind)} onChange={(e) => setKinds((ks) => (e.target.checked ? [...ks, kind] : ks.filter((k) => k !== kind)))} />}
                  />
                ))}
              </Box>
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ ml: "auto" }}>
                Print cards
              </Button>
            </Box>
          </Box>
          <div className={cardStyles.root} {...readingAttrs(reading)}>
            {list.map((c) => (
              <DhCharacterCards key={c.id} c={c} kinds={kinds} large={reading.large} />
            ))}
          </div>
          <SrdNotice className={`${sheet.muted} no-print`} />
        </Box>
      </Container>
    </>
  );
}

function DhCharacterCards({ c, kinds, large }: { c: Character; kinds: CardKind[]; large: boolean }) {
  const cards = useMemo(() => cardsFor(c, kinds), [c, kinds]);
  if (!cards.length) return null;
  return <CardSheets cards={cards} large={large} label={`${c.name}'s cards`} />;
}

/** One folded tent: name and epithet to the table, the numbers you need to the player. */
export function DhTent({ c }: { c: Character }) {
  const m = c.mech;
  const x = derive(c);
  return (
    <article className={ts.tent} aria-label={`Name tent for ${c.name}`}>
      <div role="group" className={ts.tableFace} aria-label="Faces the table">
        <div className={ts.portrait} aria-hidden="true">
          {c.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.portrait} alt="" />
          ) : (
            <PosterIcon icon={c.poster.icon} size={96} />
          )}
        </div>
        <div className={ts.tableText}>
          <div className={ts.header}>{c.poster.header}</div>
          <div className={ts.bigName}>{c.poster.alias ?? c.name}</div>
          <div className={ts.epithet}>{c.poster.epithet}</div>
        </div>
      </div>
      <div className={ts.fold} aria-hidden="true">
        <span>fold</span>
      </div>
      <div role="group" className={ts.playerFace} aria-label="Faces you">
        <div className={ts.who}>
          <b>{c.name}</b> · {m.class} ({m.subclass}) · {m.ancestry}
          <span className={ts.ruleset}>Daggerheart</span>
        </div>
        <div className={ts.stats}>
          <Stat label="Evasion" value={m.evasion} />
          <Stat label="Armor" value={m.armorScore} />
          <Stat label="HP" value={m.hp} note="slots" />
          <Stat label="Stress" value={m.stress} note="slots" />
          <Stat label="Major" value={m.thresholds.major} />
          <Stat label="Severe" value={m.thresholds.severe} />
        </div>
        <div className={ts.lines}>
          <div>
            <span className={ts.lineLabel}>Traits</span> {TRAITS.map((k) => `${TRAIT_NAMES[k].slice(0, 3)} ${signed(m.traits[k])}`).join(" · ")}
          </div>
          {x.weapons.slice(0, 2).map((w) => (
            <div key={w.name}>
              <span className={ts.lineLabel}>{w.name}</span> {signed(w.attack)} · {w.damage} {w.damageType === "magic" ? "mag" : "phy"} · {w.range}
            </div>
          ))}
          <div>
            <span className={ts.lineLabel}>Experiences</span> {m.experiences.map((e) => `${e.name} ${signed(e.bonus)}`).join(" · ")}
          </div>
          <div className={ts.goal}>
            <span className={ts.lineLabel}>You want</span> {c.story.goal}
          </div>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={ts.stat}>
      <div className={ts.statLabel}>{label}</div>
      <div className={ts.statValue}>{value}</div>
      {note && <div className={ts.statNote}>{note}</div>}
    </div>
  );
}

export function DhTentsView({ os, only }: { os: PublicDhOneShot; only?: string }) {
  const { reading } = useReading();
  const list = only ? cast(os).filter((c) => c.id === only) : cast(os);
  const who = only ? (list[0]?.name ?? only) : os.title;
  const back = only ? { href: `/${os.slug}/${only}`, label: `${who}'s sheet` } : { href: `/${os.slug}`, label: os.title };
  return (
    <>
      <Head>
        <title>{`Tents & tokens · ${who} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={back} reading />
        <Box component="main" id="main" tabIndex={-1}>
          <Box className="no-print" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              {only ? `${who}: name tent & token` : `${os.title}: name tents & tokens`}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
              Two tents to a page: cut round the dotted edge, fold along the middle, and stand it up. The name faces the table; Evasion,
              thresholds and the traits face the player.
            </Typography>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
              Print {list.length === 1 ? "the tent" : "tents"}
            </Button>
          </Box>
          <div className={ts.root} {...readingAttrs(reading)}>
            {paginate(list, 2).map((pair, i) => (
              <div key={i} className={ts.page}>
                {pair.map((c) => (
                  <DhTent key={c.id} c={c} />
                ))}
              </div>
            ))}
            <section className={`${ts.tokens} no-print`} aria-labelledby="tokens-title">
              <Typography id="tokens-title" variant="h5" component="h2" sx={{ color: "text.primary" }}>
                Tokens for Foundry or Owlbear
              </Typography>
              <div className={ts.tokenGrid}>
                {list.map((c) => (
                  <TokenPreview key={c.id} slug={os.slug} c={c} />
                ))}
              </div>
            </section>
          </div>
        </Box>
      </Container>
    </>
  );
}
