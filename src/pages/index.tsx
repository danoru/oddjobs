import Link from "next/link";
import Head from "next/head";
import { useMemo, useState } from "react";
import type { GetStaticProps } from "next";
import { Box, Container, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { loadAll } from "@/lib/content";
import { levelsOf } from "@/systems/dnd5e/variants";
import { SYSTEMS } from "@/systems/registry";
import { FATE_LABEL, type Survivor } from "@/lib/legacy";
import { loadSurvivors } from "@/lib/legacy.server";
import { SYSTEM_IDS, type OneShotWithCast, type SystemId } from "@/lib/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { PosterIcon } from "@/components/PosterIcon";
import { tiltFor } from "@/components/board/Poster";
import s from "@/components/board/Board.module.css";

type Summary = Pick<OneShotWithCast, "slug" | "title" | "pitch" | "players" | "durationHrs" | "tone" | "posting"> & {
  system: SystemId;
  /** 5e only: the ruleset and every level it plays at. */
  ruleset: "2014" | "2024" | null;
  level: number | null;
  levels: number[];
  cast: { id: string; icon: OneShotWithCast["cast"][number]["poster"]["icon"] }[];
};

export const getStaticProps: GetStaticProps<{ jobs: Summary[]; survivors: Survivor[] }> = async () => ({
  props: {
    survivors: loadSurvivors()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8),
    jobs: loadAll().map((os) => ({
      slug: os.slug,
      title: os.title,
      pitch: os.pitch,
      system: os.system,
      ruleset: os.system === "dnd5e" ? os.ruleset : null,
      level: os.system === "dnd5e" ? os.level : null,
      levels: os.system === "dnd5e" ? levelsOf(os).map((l) => l.level) : [],
      players: os.players,
      durationHrs: os.durationHrs,
      tone: os.tone,
      posting: os.posting,
      cast: os.cast.map((c) => ({ id: c.id, icon: c.poster.icon })),
    })),
  },
});

export default function BoardPage({ jobs, survivors }: { jobs: Summary[]; survivors: Survivor[] }) {
  const [system, setSystem] = useState<"all" | SystemId>("all");
  const [ruleset, setRuleset] = useState<"all" | "2014" | "2024">("all");
  const [party, setParty] = useState<number | "any">("any");
  const shown = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (system === "all" || j.system === system) &&
          (ruleset === "all" || j.ruleset === ruleset) &&
          (party === "any" || (j.players.min <= party && party <= j.players.max)),
      ),
    [jobs, system, ruleset, party],
  );

  return (
    <>
      <Head>
        <title>Tear-Off · the board</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: 2, mb: 3 }}>
            <Box>
              <Typography variant="h4" component="h1">
                Work for tonight
              </Typography>
              <Typography color="text.secondary">
                Pick a job, then tear a poster off for your character.
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={system}
                onChange={(_, v) => {
                  if (!v) return;
                  setSystem(v);
                  if (v !== "dnd5e" && v !== "all") setRuleset("all");
                }}
                aria-label="Game system"
              >
                <ToggleButton value="all">All games</ToggleButton>
                {SYSTEM_IDS.map((id) => (
                  <ToggleButton key={id} value={id}>
                    {SYSTEMS[id].label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <ToggleButtonGroup
                size="small"
                exclusive
                disabled={system !== "dnd5e" && system !== "all"}
                value={ruleset}
                onChange={(_, v) => v && setRuleset(v)}
                aria-label="Ruleset"
              >
                <ToggleButton value="all">All rules</ToggleButton>
                <ToggleButton value="2014">2014</ToggleButton>
                <ToggleButton value="2024">2024</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={party}
                onChange={(_, v) => v && setParty(v)}
                aria-label="Players at the table"
              >
                <ToggleButton value="any">Any table</ToggleButton>
                {[3, 4, 5, 6].map((n) => (
                  <ToggleButton key={n} value={n}>
                    {n}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Box>

          <div className={s.frame}>
            {shown.length === 0 ? (
              <div className={s.note} style={{ maxWidth: 420, margin: "0 auto" }}>
                <span className={s.pin} aria-hidden="true" />
                <p className={s.noteTitle}>Nothing pinned for that</p>
                <p className={s.postingPitch}>Try another game, ruleset or table size.</p>
              </div>
            ) : (
              <div className={s.wideGrid}>
                {shown.map((j) => (
                  <Link
                    key={j.slug}
                    href={`/${j.slug}`}
                    className={s.posting}
                    style={{ ["--tilt" as string]: `${tiltFor(j.slug, 1.6)}deg` }}
                  >
                    <span className={s.brassPin} aria-hidden="true" />
                    <span className={s.systemBadge} data-system={j.system}>
                      {SYSTEMS[j.system].label}
                    </span>
                    {j.ruleset && (
                      <span className={j.ruleset === "2014" ? s.stamp2014 : s.stamp2024}>
                        {j.ruleset}
                        <span className={s.srOnly}> rules</span>
                      </span>
                    )}
                    <div className={s.postingHeader}>{j.posting.header}</div>
                    <h2 className={s.postingTitle} id={`job-${j.slug}`}>
                      {j.title}
                    </h2>
                    <p className={s.postingPitch} id={`job-${j.slug}-pitch`}>
                      {j.pitch}
                    </p>
                    <div className={s.meta} id={`job-${j.slug}-meta`}>
                      {j.level !== null && (
                        <span>{j.levels.length > 1 ? `Level ${j.levels.join(" or ")}` : `Level ${j.level}`}</span>
                      )}
                      <span>
                        {j.players.min}–{j.players.max} players
                      </span>
                      <span>~{j.durationHrs} hrs</span>
                    </div>
                    <div className={s.tones}>
                      {j.tone.map((t) => (
                        <span key={t} className={s.tone}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className={s.reward}>Reward: {j.posting.reward}</div>
                    <div className={s.castRow} role="img" aria-label={`${j.cast.length} characters`}>
                      {j.cast.map((c) => (
                        <PosterIcon key={c.id} icon={c.icon} size={22} />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {survivors.length > 0 && (
              <div className={s.note} style={{ ["--tilt" as string]: "-0.8deg", marginTop: 32, maxWidth: 560 }}>
                <span className={s.pin} aria-hidden="true" />
                <h2 className={s.noteTitle}>Notable survivors</h2>
                <ul className={s.yarnList}>
                  {survivors.map((v) => (
                    <li key={v.id}>
                      <span className={s.yarn}>
                        {v.name}
                        {v.title ? `, the ${v.title}` : `, ${v.epithet}`}
                      </span>{" "}
                      {FATE_LABEL[v.fate].toLowerCase()} {v.oneshotTitle}
                      {v.playedBy ? ` (played by ${v.playedBy})` : ""}.
                      {v.line ? <i> &ldquo;{v.line}&rdquo;</i> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </main>
      </Container>
    </>
  );
}
