import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import DownloadIcon from "@mui/icons-material/Download";
import type { PublicCharacter, PublicOneShot } from "@/lib/public";
import type { Character, Ruleset } from "@/systems/dnd5e/schema";
import { applyTweaks } from "@/systems/dnd5e/customize";
import { ABILITY_NAMES, classLine, derive, signed } from "@/systems/dnd5e/derive";
import { readingAttrs } from "@/lib/reading";
import { downloadToken, drawToken, tokenFileName } from "@/lib/token";
import { useLevel, useReading, useTweaks } from "@/lib/storage";
import { paginate } from "@/systems/dnd5e/cards";
import { PosterIcon } from "@/components/PosterIcon";
import { SiteHeader } from "@/components/SiteHeader";
import s from "./Tents.module.css";

/** One folded tent: the table side upside down on top, so both read upright once folded. */
export function Tent({ c, ruleset }: { c: Character; ruleset: Ruleset }) {
  const d = derive(c);
  const m = c.mech;
  const tableName = c.poster.alias ?? c.name;
  const saves = (Object.keys(d.saves) as (keyof typeof d.saves)[]).filter((a) => d.saves[a].proficient);
  return (
    <article className={s.tent} aria-label={`Name tent for ${c.name}`}>
      <div role="group" className={s.tableFace} aria-label="Faces the table">
        <div className={s.portrait} aria-hidden="true">
          {c.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.portrait} alt="" />
          ) : (
            <PosterIcon icon={c.poster.icon} size={96} />
          )}
        </div>
        <div className={s.tableText}>
          <div className={s.header}>{c.poster.header}</div>
          <div className={s.bigName}>{tableName}</div>
          <div className={s.epithet}>{c.poster.epithet}</div>
        </div>
      </div>
      <div className={s.fold} aria-hidden="true">
        <span>fold</span>
      </div>
      <div role="group" className={s.playerFace} aria-label="Faces you">
        <div className={s.who}>
          <b>{c.name}</b> · {classLine(c)} · {m.species}
          <span className={s.ruleset}>{ruleset} rules</span>
        </div>
        <div className={s.stats}>
          <Stat label="AC" value={m.ac.value} />
          <Stat label="HP" value={m.hp} note="now ____" />
          <Stat label="Init" value={signed(d.initiative)} />
          <Stat label="Speed" value={m.speed} />
          <Stat label="Pass. Perc" value={d.passive.perception} />
          <Stat label="Prof" value={signed(d.prof)} />
          {d.spell && <Stat label="Spell DC" value={d.spell.dc} note={`atk ${signed(d.spell.attack)}`} />}
        </div>
        <div className={s.lines}>
          <div>
            <span className={s.lineLabel}>Saves</span>{" "}
            {saves.map((a) => `${ABILITY_NAMES[a]} ${signed(d.saves[a].total)}`).join(" · ")}
          </div>
          {d.attacks.slice(0, 3).map((a) => (
            <div key={a.name}>
              <span className={s.lineLabel}>{a.name}</span> {a.toHit}
              {a.toHit.startsWith("DC") ? "" : " to hit"} · {a.damage} {a.damageType}
            </div>
          ))}
          <div className={s.goal}>
            <span className={s.lineLabel}>You want</span> {c.story.goal}
          </div>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={s.stat}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {note && <div className={s.statNote}>{note}</div>}
    </div>
  );
}

/** A live preview of the token PNG, with its download button. */
export function TokenPreview({ slug, c }: { slug: string; c: Pick<Character, "id" | "name" | "portrait" | "poster"> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<string>("");
  useEffect(() => {
    if (!ref.current) return;
    let alive = true;
    void drawToken(ref.current, c, 256).then((used) => alive && setArt(used.kind === "portrait" ? "portrait" : "poster icon"));
    return () => {
      alive = false;
    };
  }, [c]);
  return (
    <figure className={s.token}>
      <canvas ref={ref} width={256} height={256} className={s.tokenCanvas} role="img" aria-label={`Token for ${c.name}`} />
      <figcaption>
        <div className={s.tokenName}>{c.name}</div>
        <div className={s.tokenArt}>{art && `from the ${art}`}</div>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => void downloadToken(slug, c)}>
          {tokenFileName(slug, c).replace(`${slug}-`, "")}
        </Button>
      </figcaption>
    </figure>
  );
}

function useCustomized(slug: string, stock: PublicCharacter) {
  const { tweaks } = useTweaks(slug, stock.id);
  return useMemo(() => applyTweaks(stock, tweaks), [stock, tweaks]);
}

function TentFor({ os, stock }: { os: PublicOneShot; stock: PublicCharacter }) {
  return <Tent c={useCustomized(os.slug, stock)} ruleset={os.ruleset} />;
}

function TokenFor({ os, stock }: { os: PublicOneShot; stock: PublicCharacter }) {
  return <TokenPreview slug={os.slug} c={useCustomized(os.slug, stock)} />;
}

/** Tents (two to a page) and tokens for the cast, or one character (`only`). */
export function TentsView({ os: base, only }: { os: PublicOneShot; only?: string }) {
  const { os, level } = useLevel(base);
  const { reading } = useReading();
  const cast = only ? os.cast.filter((c) => c.id === only) : os.cast;
  const who = only ? (cast[0]?.name ?? only) : os.title;
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
              Level {level}. Two tents to a page: cut round the dotted edge, fold along the middle, and stand it up. The
              name faces the table; the numbers face the player.
            </Typography>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
              Print {cast.length === 1 ? "the tent" : "tents"}
            </Button>
          </Box>
          <div className={s.root} {...readingAttrs(reading)}>
            {paginate(cast, 2).map((pair, i) => (
              <div key={i} className={s.page}>
                {pair.map((c) => (
                  <TentFor key={c.id} os={os} stock={c} />
                ))}
              </div>
            ))}
            <section className={`${s.tokens} no-print`} aria-labelledby="tokens-title">
              <Typography id="tokens-title" variant="h5" component="h2" sx={{ color: "text.primary" }}>
                Tokens for Foundry or Owlbear
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
                512 × 512 PNGs with a transparent outside. They use the woodcut portrait from Customize when there is one,
                and the poster&apos;s icon otherwise. In Foundry set the actor&apos;s token image; in Owlbear Rodeo drop
                the file onto the map.
              </Typography>
              <div className={s.tokenGrid}>
                {cast.map((c) => (
                  <TokenFor key={c.id} os={os} stock={c} />
                ))}
              </div>
            </section>
          </div>
        </Box>
      </Container>
    </>
  );
}
