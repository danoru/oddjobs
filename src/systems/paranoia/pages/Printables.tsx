import Head from "next/head";
import { useMemo, useState } from "react";
import { Box, Button, Checkbox, Container, FormControlLabel, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import type { PublicPaCharacter, PublicPaOneShot } from "@/lib/public";
import type { Character, Naughty, Skill } from "@/systems/paranoia/schema";
import type { CardKind } from "@/systems/dnd5e/cards";
import { paginate } from "@/systems/dnd5e/cards";
import { cardsFor, PA_KINDS } from "@/systems/paranoia/cards";
import { SKILL_NAMES, STAT_NAMES, cloneName, signed, stats } from "@/systems/paranoia/derive";
import { STATS } from "@/systems/paranoia/schema";
import { CLEARANCE_INK, CLEARANCE_NAMES, treasonNames } from "@/systems/paranoia/rules";
import { useReading } from "@/lib/storage";
import { readingAttrs } from "@/lib/reading";
import { SiteHeader } from "@/components/SiteHeader";
import { PosterIcon } from "@/components/PosterIcon";
import { PlayAidNotice, PublicSide } from "@/systems/paranoia/components/Sheet";
import { CardSheets } from "@/systems/dnd5e/components/cards/CardSheets";
import { TokenPreview } from "@/systems/dnd5e/components/tents/TentsView";
import sheet from "@/systems/dnd5e/components/sheet/Sheet.module.css";
import cardStyles from "@/systems/dnd5e/components/cards/Cards.module.css";
import ts from "@/systems/dnd5e/components/tents/Tents.module.css";

/**
 * Paranoia's player printables carry the public side only: the naughty
 * sides are printed in the GM's box (/<slug>/box) and handed over face down.
 */

export function PaPrintCastPage({ os }: { os: PublicPaOneShot }) {
  const { reading } = useReading();
  return (
    <>
      <Head>
        <title>{`Print · ${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} reading />
        <Box className="no-print" sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 3 }}>
          <Typography sx={{ flex: 1, minWidth: 240 }} color="text.secondary">
            {os.cast.length} Troubleshooters, the public side of each sheet. The naughty sides are in the GM&apos;s printed box, to hand over face down.
          </Typography>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print every public side
          </Button>
        </Box>
        <main id="main" className={sheet.sheet} {...readingAttrs(reading)}>
          {os.cast.map((c) => (
            <PublicSide key={c.id} c={c} team={os.team} objectives={os.objectives} oneshotTitle={os.title} wanted={treasonNames(os.houseRules)} />
          ))}
        </main>
      </Container>
    </>
  );
}

export function PaCardsView({ os, only }: { os: PublicPaOneShot; only?: string }) {
  const { reading } = useReading();
  const [kinds, setKinds] = useState<CardKind[]>(["feature", "item"]);
  const list = only ? os.cast.filter((c) => c.id === only) : os.cast;
  const who = only ? (list[0]?.name ?? only) : os.title;
  const back = only ? { href: `/${os.slug}/${only}`, label: `${who}'s sheet` } : { href: `/${os.slug}`, label: os.title };
  return (
    <>
      <Head>
        <title>{`Cards · ${who} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={back} reading />
        <Box component="main" id="main" tabIndex={-1}>
          <Box className="no-print" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              {only ? `${who}: cards` : `${os.title}: every card`}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
              Clone ID cards in each clearance&apos;s colour, and the assigned gear. Society, mutation and secret objective cards are in the GM&apos;s box.{" "}
              {reading.large ? "Four large cards" : "Nine cards"} to a page with crop marks; print at 100% with background graphics on.
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Box role="group" aria-label="Which cards" sx={{ display: "flex", flexWrap: "wrap" }}>
                {PA_KINDS.filter((x) => x.kind !== "spell").map(({ kind, label }) => (
                  <FormControlLabel
                    key={kind}
                    label={label}
                    control={<Checkbox checked={kinds.includes(kind)} onChange={(e) => setKinds((ks) => (e.target.checked ? [...ks, kind] : ks.filter((x) => x !== kind)))} />}
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
              <PaCharacterCards key={c.id} c={c} kinds={kinds} large={reading.large} />
            ))}
          </div>
          <PlayAidNotice className={`${sheet.muted} no-print`} />
        </Box>
      </Container>
    </>
  );
}

function PaCharacterCards({ c, kinds, large }: { c: PublicPaCharacter; kinds: CardKind[]; large: boolean }) {
  const cards = useMemo(() => cardsFor(c, null, kinds), [c, kinds]);
  if (!cards.length) return null;
  return <CardSheets cards={cards} large={large} label={`${c.name}'s cards`} />;
}

/** One folded tent: the clone name and clearance to the table, the stats and buttons to the player. */
export function PaTent({ c, naughty }: { c: PublicPaCharacter | Character; naughty?: Naughty }) {
  const m = c.mech;
  const st = stats(m);
  const ink = CLEARANCE_INK[m.clone.clearance];
  return (
    <article className={ts.tent} aria-label={`Name tent for ${cloneName(m)}`}>
      <div role="group" className={ts.tableFace} aria-label="Faces the table" style={{ borderTop: `14px solid ${ink.bg}` }}>
        <div className={ts.portrait} aria-hidden="true">
          {c.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.portrait} alt="" />
          ) : (
            <PosterIcon icon={c.poster.icon} size={96} />
          )}
        </div>
        <div className={ts.tableText}>
          <div className={ts.header}>{CLEARANCE_NAMES[m.clone.clearance]} clearance</div>
          <div className={ts.bigName} style={{ fontFamily: "var(--font-typewriter)" }}>
            {cloneName(m)}
          </div>
          <div className={ts.epithet}>
            {m.serviceGroup} · {m.bonusDuty}
          </div>
        </div>
      </div>
      <div className={ts.fold} aria-hidden="true">
        <span>fold</span>
      </div>
      <div role="group" className={ts.playerFace} aria-label="Faces you">
        <div className={ts.who}>
          <b>{c.name}</b> · {cloneName(m)}
          <span className={ts.ruleset}>Paranoia</span>
        </div>
        <div className={ts.stats}>
          {STATS.map((s) => (
            <div key={s} className={ts.stat}>
              <div className={ts.statLabel}>{STAT_NAMES[s]}</div>
              <div className={ts.statValue}>{st[s]}</div>
            </div>
          ))}
          <div className={ts.stat}>
            <div className={ts.statLabel}>Moxie</div>
            <div className={ts.statValue}>{m.moxie}</div>
          </div>
        </div>
        <div className={ts.lines}>
          <div>
            <span className={ts.lineLabel}>Best at</span>{" "}
            {Object.entries(m.skills)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${SKILL_NAMES[k as Skill]} ${signed(v)}`)
              .join(" · ")}
          </div>
          <div>
            <span className={ts.lineLabel}>Treason Button</span> {c.story.treasonButton}
          </div>
          <div>
            <span className={ts.lineLabel}>Violence Button</span> {c.story.violenceButton}
          </div>
          {naughty && (
            <div className={ts.goal}>
              <span className={ts.lineLabel}>Secretly</span> {naughty.society} · {naughty.mutantPower.name}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function PaTentsView({ os, only }: { os: PublicPaOneShot; only?: string }) {
  const { reading } = useReading();
  const list = only ? os.cast.filter((c) => c.id === only) : os.cast;
  const who = only ? (list[0]?.name ?? only) : os.title;
  const back = only ? { href: `/${os.slug}/${only}`, label: `${who}'s sheet` } : { href: `/${os.slug}`, label: os.title };
  return (
    <>
      <Head>
        <title>{`Tents & tokens · ${who} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={back} reading />
        <Box component="main" id="main" tabIndex={-1}>
          <Box className="no-print" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              {only ? `${who}: name tent & token` : `${os.title}: name tents & tokens`}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
              Two tents to a page: the clone name and clearance face the table (so everyone knows who to report), the stats and Buttons face the player.
            </Typography>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
              Print {list.length === 1 ? "the tent" : "tents"}
            </Button>
          </Box>
          <div className={ts.root} {...readingAttrs(reading)}>
            {paginate(list, 2).map((pair, i) => (
              <div key={i} className={ts.page}>
                {pair.map((c) => (
                  <PaTent key={c.id} c={c} />
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
