import Head from "next/head";
import { useMemo, useState } from "react";
import { Box, Button, Checkbox, Container, FormControlLabel, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import type { PublicCharacter, PublicOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import { applyTweaks } from "@/systems/dnd5e/customize";
import { cardsFor, type CardKind } from "@/systems/dnd5e/cards";
import { readingAttrs } from "@/lib/reading";
import { useLevel, useReading, useTweaks } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import { CardSheets } from "./CardSheets";
import s from "./Cards.module.css";

const KINDS: { kind: CardKind; label: string }[] = [
  { kind: "spell", label: "Spells" },
  { kind: "item", label: "Items" },
  { kind: "feature", label: "Features" },
];

function CharacterCards({
  os,
  stock,
  book,
  kinds,
  large,
}: {
  os: PublicOneShot;
  stock: PublicCharacter;
  book: Record<string, SpellInfo>;
  kinds: CardKind[];
  large: boolean;
}) {
  const { tweaks } = useTweaks(os.slug, stock.id);
  const c = useMemo(() => applyTweaks(stock, tweaks), [stock, tweaks]);
  const cards = useMemo(() => cardsFor(c, os.ruleset, book, kinds), [c, os.ruleset, book, kinds]);
  if (!cards.length) return null;
  return <CardSheets cards={cards} large={large} label={`${c.name}'s cards`} />;
}

/** Spell, item and feature cards for the whole cast, or one character (`only`). */
export function CardsView({ os: base, only, book }: { os: PublicOneShot; only?: string; book: Record<string, SpellInfo> }) {
  const { os, level } = useLevel(base);
  const { reading } = useReading();
  const [kinds, setKinds] = useState<CardKind[]>(["spell", "item", "feature"]);
  const cast = only ? os.cast.filter((c) => c.id === only) : os.cast;
  const who = only ? (cast[0]?.name ?? only) : os.title;
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
              Level {level}. {reading.large ? "Four large cards" : "Nine cards"} to a page with crop marks; each character
              starts on a fresh page. Print at 100% (no &ldquo;fit to page&rdquo;) and turn on background graphics for the
              parchment. Letter or A4 both fit.
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Box role="group" aria-label="Which cards" sx={{ display: "flex", flexWrap: "wrap" }}>
                {KINDS.map(({ kind, label }) => (
                  <FormControlLabel
                    key={kind}
                    label={label}
                    control={
                      <Checkbox
                        checked={kinds.includes(kind)}
                        onChange={(e) =>
                          setKinds((ks) => (e.target.checked ? [...ks, kind] : ks.filter((k) => k !== kind)))
                        }
                      />
                    }
                  />
                ))}
              </Box>
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ ml: "auto" }}>
                Print cards
              </Button>
            </Box>
          </Box>
          <div className={s.root} {...readingAttrs(reading)}>
            {cast.map((c) => (
              <CharacterCards key={c.id} os={os} stock={c} book={book} kinds={kinds} large={reading.large} />
            ))}
          </div>
        </Box>
      </Container>
    </>
  );
}
