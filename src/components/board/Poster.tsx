import Link from "next/link";
import { useState } from "react";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import type { Character } from "@/lib/schema";
import { PosterIcon } from "@/components/PosterIcon";
import { playRip } from "@/lib/rip";
import s from "./Board.module.css";

/** Small deterministic tilt so the board looks hand-pinned but doesn't jump on re-render. */
export function tiltFor(key: string, max = 2.4) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 2 * max - max;
}

export function Poster({
  slug,
  character: c,
  core,
  claimed,
  onToggleClaim,
}: {
  slug: string;
  character: Character;
  core: boolean;
  claimed: boolean;
  onToggleClaim: () => void;
}) {
  const [justTorn, setJustTorn] = useState(false);
  const cls = c.mech.classes.map((k) => `${k.name} ${k.level}`).join(" / ");
  const shownName = c.poster.alias ?? c.name;

  function tear() {
    playRip();
    setJustTorn(true);
    onToggleClaim();
    window.setTimeout(() => setJustTorn(false), 1000);
  }

  return (
    <div style={{ position: "relative" }}>
      <article
        className={`${s.poster} ${claimed ? s.claimed : ""}`}
        style={{ ["--tilt" as string]: `${tiltFor(c.id)}deg` }}
      >
        <span className={s.pin} aria-hidden="true" />
        {core && <span className={s.coreTag}>NEEDED</span>}
        <Link href={`/${slug}/${c.id}`} className={s.posterLink} aria-label={`${shownName}, ${c.poster.epithet} — open sheet`}>
          <div className={s.posterHeader}>{c.poster.header}</div>
          <div className={s.engraving}>
            {c.portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.portrait} alt="" />
            ) : (
              <PosterIcon icon={c.poster.icon} size={72} />
            )}
          </div>
          <div className={s.posterName}>{shownName}</div>
          <div className={s.posterEpithet}>{c.poster.epithet}</div>
          <p className={s.posterHook}>{c.poster.hook}</p>
          {c.poster.reward && <div className={s.posterReward}>REWARD · {c.poster.reward}</div>}
          <div className={s.posterTag}>{cls}</div>
        </Link>
        {claimed ? (
          <button type="button" className={s.unclaim} onClick={onToggleClaim}>
            pin it back up
          </button>
        ) : (
          <button type="button" className={s.strip} onClick={tear}>
            <ContentCutIcon sx={{ fontSize: 16 }} aria-hidden="true" /> TEAR TO CLAIM
          </button>
        )}
        {claimed && <span className={s.claimedStamp}>CLAIMED</span>}
      </article>
      {justTorn && <span className={s.falling} aria-hidden="true" />}
    </div>
  );
}
