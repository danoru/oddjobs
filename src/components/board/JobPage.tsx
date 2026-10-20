import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Box, Button, Container, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import VisibilityIcon from "@mui/icons-material/Visibility";
import TvIcon from "@mui/icons-material/Tv";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import StyleIcon from "@mui/icons-material/Style";
import BadgeIcon from "@mui/icons-material/Badge";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import type { PublicAnyOneShot } from "@/lib/public";
import { SYSTEMS } from "@/systems/registry";
import { useClaims, useLevel } from "@/lib/storage";
import { skinFrom, SKIN_WORDS } from "@/lib/skins";
import { SiteHeader } from "@/components/SiteHeader";
import { Poster } from "@/components/board/Poster";
import { TableNote } from "@/components/board/TableNote";
import { YarnBoard } from "@/components/board/YarnBoard";
import { TownBoard } from "@/components/board/TownBoard";
import { LevelPicker } from "@/components/board/LevelPicker";
import { cameoHook, type Survivor } from "@/lib/legacy";
import s from "@/components/board/Board.module.css";
import k from "@/components/board/Skins.module.css";

/**
 * The job page (/<oneshot>): the posting, the cast as posters to tear down,
 * the red-yarn board and party coverage. Also rendered by the builder's
 * preview (/admin/preview/<slug>) from a draft.
 */

const ROLE_ORDER = ["tank", "striker", "healer", "support", "control", "face", "scout", "utility"] as const;

const inkButton = { color: "var(--ink)", borderColor: "var(--ink-soft)" } as const;

export function JobPage({ os: base, cameos }: { os: PublicAnyOneShot; cameos: Survivor[] }) {
  const router = useRouter();
  const { os, level, setLevel, levels } = useLevel(base);
  const table = useClaims(os.slug);
  const { claims, claimedBy, toggle } = table;
  const skin = skinFrom(os.skin, router.query.skin);
  const words = SKIN_WORDS[skin];
  const linkCode = typeof router.query.table === "string" ? router.query.table : undefined;
  const claimedCast = os.cast.filter((c) => claims.includes(c.id));
  const covered = new Set(claimedCast.flatMap((c) => ("roles" in c ? c.roles : [])));
  const missingCore = os.coreRoles.filter((id) => !claims.includes(id));
  const nameOf = (id: string) => {
    const c = os.cast.find((x) => x.id === id);
    return c ? (c.poster.alias ?? c.name) : id;
  };

  return (
    <>
      <Head>
        <title>{`${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/", label: "the board" }} />

        <main id="main" tabIndex={-1} className={`${s.frame} ${k.skinned}`} data-skin={skin} data-part="frame">
          <div className={s.note} data-part="posting" style={{ ["--tilt" as string]: "-0.6deg", marginBottom: 32 }}>
            <span className={s.brassPin} data-part="pin" aria-hidden="true" />
            <span className={s.systemBadge} data-system={os.system} data-part="systemBadge">
              {SYSTEMS[os.system].label}
            </span>
            {os.system === "dnd5e" && (
              <span className={os.ruleset === "2014" ? s.stamp2014 : s.stamp2024} data-part="rulesStamp">
                {words.rules(os.ruleset)}
              </span>
            )}
            {os.system === "dnd5e" && os.homebrew && (
              <span className={s.stampHomebrew} data-part="homebrewStamp" title="This cast breaks the rules on purpose">
                HOMEBREW
              </span>
            )}
            <div className={s.postingHeader} data-part="postingHeader">
              {os.posting.header}
            </div>
            <h1 className={s.postingTitle} data-part="postingTitle" style={{ fontSize: "clamp(30px, 5vw, 46px)" }}>
              {os.title}
            </h1>
            <p className={s.postingPitch} data-part="postingPitch" style={{ fontSize: 19 }}>
              {os.premise}
            </p>
            <div className={s.meta} data-part="meta">
              {os.system === "dnd5e" && <span>Level {os.level}</span>}
              <span>
                {os.players.min}–{os.players.max} players
              </span>
              <span>~{os.durationHrs} hrs</span>
              <span>{os.setting}</span>
            </div>
            <div className={s.reward} data-part="reward">
              Reward: {os.posting.reward}
            </div>
            {os.content.warnings.length > 0 && (
              <div className={s.meta} data-part="meta" style={{ marginTop: 8 }}>
                <span>Content: {os.content.warnings.join(", ")}</span>
              </div>
            )}
            <LevelPicker levels={levels} level={level} onChange={setLevel} />
            {os.system === "dnd5e" ? (
              <Box
                component="nav"
                aria-label="Printables and table tools"
                className="no-print"
                sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}
              >
                <Button component={Link} href={`/${os.slug}/print`} variant="outlined" size="small" startIcon={<PrintIcon />} sx={inkButton}>
                  Print every sheet
                </Button>
                <Button component={Link} href={`/${os.slug}/cards`} variant="outlined" size="small" startIcon={<StyleIcon />} sx={inkButton}>
                  Spell &amp; item cards
                </Button>
                <Button component={Link} href={`/${os.slug}/tents`} variant="outlined" size="small" startIcon={<BadgeIcon />} sx={inkButton}>
                  Name tents &amp; tokens
                </Button>
                <Button component={Link} href={`/${os.slug}/flyer`} variant="outlined" size="small" startIcon={<ContentCutIcon />} sx={inkButton}>
                  Print the tear-off flyer
                </Button>
                <Button component={Link} href={`/${os.slug}/tv`} variant="outlined" size="small" startIcon={<TvIcon />} sx={inkButton}>
                  Board on the TV
                </Button>
                <Button component={Link} href={`/${os.slug}/epilogue`} variant="outlined" size="small" startIcon={<HistoryEduIcon />} sx={inkButton}>
                  The morning after
                </Button>
                <Button component={Link} href={`/${os.slug}/gm`} size="small" startIcon={<VisibilityIcon />} sx={{ color: "var(--ink-soft)" }}>
                  GM&apos;s view
                </Button>
              </Box>
            ) : (
              <Box
                component="nav"
                aria-label="Play aid and printables"
                className="no-print"
                sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}
              >
                <Button component={Link} href={`/${os.slug}/play`} variant="outlined" size="small" startIcon={<LocalFireDepartmentIcon />} sx={inkButton}>
                  At the table (phones)
                </Button>
                <Button component={Link} href={`/${os.slug}/kit`} variant="outlined" size="small" startIcon={<PrintIcon />} sx={inkButton}>
                  Print the table kit (GM)
                </Button>
                <Button component={Link} href={`/${os.slug}/flyer`} variant="outlined" size="small" startIcon={<ContentCutIcon />} sx={inkButton}>
                  Print the missing poster
                </Button>
                <Button component={Link} href={`/${os.slug}/tv`} variant="outlined" size="small" startIcon={<TvIcon />} sx={inkButton}>
                  Candles on the TV
                </Button>
                <Button component={Link} href={`/${os.slug}/sounds`} variant="outlined" size="small" startIcon={<MusicNoteIcon />} sx={inkButton}>
                  Soundboard
                </Button>
                <Button component={Link} href={`/${os.slug}/gm`} size="small" startIcon={<VisibilityIcon />} sx={{ color: "var(--ink-soft)" }}>
                  GM&apos;s view
                </Button>
              </Box>
            )}
          </div>

          <TableNote claims={table} initialCode={linkCode} />
          <TownBoard code={table.table} playerId={table.player?.id ?? null} />

          <h2 className={s.srOnly}>{words.cast}</h2>
          <div className={s.grid} data-part="castGrid">
            {os.cast.map((c) => (
              <Poster
                key={c.id}
                slug={os.slug}
                character={c}
                core={os.coreRoles.includes(c.id)}
                claim={claimedBy[c.id]}
                onToggleClaim={() => toggle(c.id)}
                skin={skin}
              />
            ))}
          </div>

          <div className={s.grid} style={{ marginTop: 36 }}>
            <section className={s.note} data-part="note" style={{ ["--tilt" as string]: "1deg", gridColumn: "1 / -1" }}>
              <span className={s.pin} data-part="pin" aria-hidden="true" />
              <h2 className={s.noteTitle} data-part="noteTitle">
                {words.ties}
              </h2>
              <YarnBoard cast={os.cast} claimedBy={claimedBy} />
            </section>
            <section className={s.note} data-part="note" style={{ ["--tilt" as string]: "-1.4deg" }}>
              <span className={s.pin} data-part="pin" aria-hidden="true" />
              <h2 className={s.noteTitle} data-part="noteTitle">
                {words.party}
              </h2>
              <Typography sx={{ fontFamily: "var(--font-print)", fontSize: 16 }} aria-live="polite">
                {claimedCast.length === 0
                  ? "No posters torn down yet."
                  : `${claimedCast.length} of ${os.players.max} posters torn down: ${claimedCast
                      .map((c) => (claimedBy[c.id]?.name ? `${c.name} (${claimedBy[c.id].name})` : c.name))
                      .join(", ")}.`}
              </Typography>
              {os.system === "dnd5e" && (
                <ul className={s.roleChips} aria-label="Party roles covered">
                  {ROLE_ORDER.map((r) => (
                    <li key={r} className={covered.has(r) ? s.roleChipOn : s.roleChip}>
                      {r}
                      <span className={s.srOnly}>{covered.has(r) ? ": covered" : ": not yet"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {claimedCast.length > 0 && missingCore.length > 0 && (
                <Typography sx={{ fontFamily: "var(--font-print)", fontStyle: "italic", fontSize: 15, mt: 1.5 }}>
                  Still needed: {missingCore.map(nameOf).join(", ")}.
                </Typography>
              )}
              <Typography sx={{ fontFamily: "var(--font-label)", fontSize: 12, color: "var(--ink-soft)", mt: 1.5 }}>
                {table.table
                  ? `Shared with everyone at table ${table.table}.`
                  : "Claims are remembered on this device only."}
              </Typography>
            </section>
          </div>

          {cameos.length > 0 && (
            <div className={s.grid} style={{ marginTop: 36 }}>
              {cameos.map((v, i) => (
                <div key={v.id} className={s.note} data-part="note" style={{ ["--tilt" as string]: `${i % 2 ? 1.6 : -1.2}deg` }}>
                  <span className={s.brassPin} data-part="pin" aria-hidden="true" />
                  <div className={s.postingHeader} data-part="postingHeader">
                    ALSO SEEN IN TOWN
                  </div>
                  <p className={s.postingPitch} style={{ marginTop: 10, marginBottom: 6 }}>
                    {cameoHook(v)}
                  </p>
                  {v.scar && <div className={s.meta}>Known by: {v.scar}</div>}
                  <div className={s.meta} style={{ marginTop: 6 }}>
                    GM: a survivor from another night. Drop them in as an NPC.
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </Container>
    </>
  );
}
