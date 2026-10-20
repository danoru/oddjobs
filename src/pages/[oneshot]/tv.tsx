import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GetStaticPaths, GetStaticProps } from "next";
import QRCode from "qrcode";
import { Box, Button, Typography } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicAnyOneShot, type PublicDhOneShot, type PublicOneShot } from "@/lib/public";
import { SYSTEMS } from "@/systems/registry";
import { CandlesTv } from "@/systems/tencandles/components/CandlesTv";
import { useClaims, useLevel } from "@/lib/storage";
import { playRip } from "@/lib/rip";
import { PosterIcon } from "@/components/PosterIcon";
import { tiltFor } from "@/components/board/Poster";
import s from "@/components/tv/Tv.module.css";
import { onlyIfOnDisk } from "@/lib/onDisk";
import { TvLive } from "@/components/tv/TvLive";
import { useLive } from "@/lib/useLive";
import type { Character as DhCharacter } from "@/systems/daggerheart/schema";
import { FearPool, noMarks, useTallies } from "@/systems/daggerheart/components/Table";
import { MAX_HOPE } from "@/systems/daggerheart/srd";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicAnyOneShot }> = onlyIfOnDisk(async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
}));

/**
 * The board on the TV. Cast it from the GM's browser after opening a table:
 * players scan the code, tear posters on their phones, and they rip off here
 * live (with a paper-rip, once someone taps "sound on").
 */
export default function TvPage({ os }: { os: PublicAnyOneShot }) {
  return os.system === "tencandles" ? <CandlesTv os={os} /> : <PosterTv os={os} />;
}

function PosterTv({ os }: { os: PublicOneShot | PublicDhOneShot }) {
  const { table, claimedBy, error } = useClaims(os.slug);
  // Daggerheart: the GM's Fear and everyone's Hope and marks, from the same poll as the dice.
  const dh = os.system === "daggerheart";
  const live = useLive(dh ? table : null, "table", null);
  const tallies = useTallies(live.events, dh ? (os.cast as DhCharacter[]) : NO_CAST);
  const { level } = useLevel(os);
  const [qr, setQr] = useState("");
  const [sound, setSound] = useState(false);
  const [torn, setTorn] = useState<string[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const joinUrl = table && typeof window !== "undefined" ? `${window.location.origin}/${os.slug}?table=${table}${os.system !== "dnd5e" || level === os.level ? "" : `&level=${level}`}` : "";

  useEffect(() => {
    if (!joinUrl) return;
    let alive = true;
    QRCode.toString(joinUrl, { type: "svg", margin: 0, color: { dark: "#2b1d0e", light: "#0000" } }).then(
      (svg) => alive && setQr(svg),
    );
    return () => {
      alive = false;
    };
  }, [joinUrl]);

  // Rip posters that were claimed since the last poll (not the ones already down on load).
  const claimedIds = Object.keys(claimedBy).sort().join(",");
  useEffect(() => {
    const now = new Set(claimedIds ? claimedIds.split(",") : []);
    if (seen.current) {
      const fresh = [...now].filter((id) => !seen.current!.has(id));
      if (fresh.length) {
        if (sound) playRip();
        setTorn(fresh);
        const t = window.setTimeout(() => setTorn([]), 1000);
        seen.current = now;
        return () => window.clearTimeout(t);
      }
    }
    seen.current = now;
  }, [claimedIds, sound]);

  // Keep the TV awake while the board is up.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  const claimed = os.cast.filter((c) => claimedBy[c.id]);

  return (
    <>
      <Head>
        <title>{`${os.title} · the board`}</title>
      </Head>
      <main id="main" className={s.screen}>
        <div className={s.top}>
          <div>
            <span className={s.systemBadge}>{SYSTEMS[os.system].label}</span>
            <h1 className={s.title}>{os.title}</h1>
            <Typography sx={{ fontFamily: "var(--font-print)", fontSize: "clamp(16px, 1.4vw, 24px)", color: "var(--parchment-dark)", mt: 1 }}>
              {os.posting.header}
            </Typography>
            {dh && table && (
              <div className={s.fear} aria-label="The GM's Fear">
                <span className={s.fearLabel}>FEAR</span>
                <FearPool n={tallies.fear} size={26} />
                <span className={s.fearCount} data-testid="tv-fear">
                  {tallies.fear}
                </span>
              </div>
            )}
          </div>
          {table ? (
            <div className={s.join}>
              <div>
                <div className={s.code} aria-label={`Table code ${table.split("").join(" ")}`}>
                  {table}
                </div>
                <div className={s.joinHint}>Scan or type the code to tear off your character</div>
              </div>
              <div
                className={s.qr}
                role="img"
                aria-label="QR code to join this table"
                // SVG markup generated locally by the qrcode library.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            </div>
          ) : (
            <Box sx={{ bgcolor: "var(--parchment)", color: "var(--ink)", p: 2, maxWidth: 360 }}>
              <Typography sx={{ fontFamily: "var(--font-print)", fontSize: 18 }}>
                No table open on this device. Open one from the{" "}
                <Link href={`/${os.slug}/gm`} style={{ color: "var(--wax)" }}>
                  GM page
                </Link>
                , then come back here.
              </Typography>
            </Box>
          )}
        </div>

        <div className={s.posters}>
          {os.cast.map((c) => {
            const claim = claimedBy[c.id];
            return (
              <article
                key={c.id}
                data-character={c.id}
                className={[s.poster, claim ? s.claimed : "", torn.includes(c.id) ? s.justTorn : ""].join(" ")}
                style={{ ["--tilt" as string]: `${tiltFor(c.id, 2)}deg` }}
              >
                <div className={s.header}>{c.poster.header}</div>
                {dh && claim && <PosterMarks c={c as DhCharacter} marks={tallies.marks[c.id] ?? noMarks} />}
                <div className={s.icon}>
                  {c.portrait ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.portrait} alt="" />
                  ) : (
                    <PosterIcon icon={c.poster.icon} size={84} />
                  )}
                </div>
                <div className={s.name}>{c.poster.alias ?? c.name}</div>
                <div className={s.epithet}>{c.poster.epithet}</div>
                <p className={s.hook}>{c.poster.hook}</p>
                {claim && (
                  <span className={s.stamp}>
                    CLAIMED
                    {claim.name && <span className={s.stampName}>{claim.name}</span>}
                  </span>
                )}
              </article>
            );
          })}
        </div>

        <TvLive code={table} tray="full" icons={os.cast.map((c) => c.poster.icon)} sound={sound} live={dh ? live : undefined} />

        <div className={s.bottom}>
          <span>
            {claimed.length} of {os.players.max} posters torn down
            {error ? ` · ${error}` : ""}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            {!sound && (
              <Button size="small" startIcon={<VolumeUpIcon />} onClick={() => setSound(true)} sx={{ color: "var(--parchment-dark)" }}>
                Sound on
              </Button>
            )}
            <Button
              size="small"
              startIcon={<FullscreenIcon />}
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
              sx={{ color: "var(--parchment-dark)" }}
            >
              Full screen
            </Button>
          </span>
        </div>
      </main>
    </>
  );
}

const NO_CAST: DhCharacter[] = [];

/** Under a claimed Daggerheart poster: Hope held, Stress and Hit Points marked. */
function PosterMarks({ c, marks }: { c: DhCharacter; marks: typeof noMarks }) {
  return (
    <div className={s.marks} data-testid={`tv-marks-${c.id}`} data-hope={marks.hope} data-stress={marks.stress} data-hp={marks.hp}>
      <span className={s.hopeRow} role="img" aria-label={`Hope ${marks.hope} of ${MAX_HOPE}`}>
        {Array.from({ length: MAX_HOPE }, (_, i) => (
          <span key={i} className={s.hopePip} data-on={i < marks.hope} />
        ))}
      </span>
      <span>
        Stress {marks.stress}/{c.mech.stress} · HP {c.mech.hp - marks.hp}/{c.mech.hp}
      </span>
    </div>
  );
}
