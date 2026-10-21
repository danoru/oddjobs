import Link from "next/link";
import { useState } from "react";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import type { Skin } from "@/lib/schema";
import type { PublicCharacter, PublicDhCharacter, PublicPaCharacter, PublicTcCharacter } from "@/lib/public";
import { posterTag, SYSTEMS } from "@/systems/registry";
import type { ClaimInfo } from "@/lib/storage";
import { roman, SKIN_WORDS } from "@/lib/skins";
import { PosterIcon } from "@/components/PosterIcon";
import { playRip } from "@/lib/rip";
import s from "./Board.module.css";

/** Small deterministic tilt so the board looks hand-pinned but doesn't jump on re-render. */
export function tiltFor(key: string, max = 2.4) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 2 * max - max;
}

/**
 * A character's poster. On the job page it links to the sheet and has a tear
 * strip; on the sheet page (`href` and `onToggleClaim` left out) it's just the
 * picture. Skins restyle it through the data-part hooks (Skins.module.css).
 */
export function Poster({
  slug,
  character: c,
  core = false,
  claim,
  onToggleClaim,
  skin = "noticeboard",
  linked = true,
  revealName = false,
  tilt,
}: {
  slug: string;
  character: PublicCharacter | PublicTcCharacter | PublicDhCharacter | PublicPaCharacter;
  core?: boolean;
  /** Who tore it, if anyone. */
  claim?: ClaimInfo;
  onToggleClaim?: () => void;
  skin?: Skin;
  /** Link to the sheet (the board) or not (the sheet page itself). */
  linked?: boolean;
  /** Show the real name even when the board shows an alias. */
  revealName?: boolean;
  tilt?: number;
}) {
  const claimed = Boolean(claim);
  const words = SKIN_WORDS[skin];
  const [justTorn, setJustTorn] = useState(false);
  const cls = posterTag(c);
  // A Ten Candles pre-made is taken, not torn down for a sheet.
  const tearWords = ("mech" in c ? ("clone" in c.mech ? SYSTEMS.paranoia.claimVerb : undefined) : SYSTEMS.tencandles.claimVerb) ?? words.tear;
  const shownName = revealName ? c.name : (c.poster.alias ?? c.name);

  function tear() {
    playRip();
    setJustTorn(true);
    onToggleClaim?.();
    window.setTimeout(() => setJustTorn(false), 1000);
  }

  const face = (
    <>
      {skin === "tarot" && (
        <div className={s.posterNumeral} data-part="numeral" aria-hidden="true">
          {roman(c.order)}
        </div>
      )}
      <div className={s.posterHeader} data-part="posterHeader">
        {c.poster.header}
      </div>
      <div className={s.engraving} data-part="engraving">
        {c.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.portrait} alt="" />
        ) : (
          <PosterIcon icon={c.poster.icon} size={72} />
        )}
      </div>
      <div className={s.posterName} data-part="posterName">
        {skin === "dossier" && <span className={s.fieldLabel}>Subject </span>}
        {shownName}
      </div>
      <div className={s.posterEpithet} data-part="posterEpithet">
        {skin === "dossier" ? <span className={s.fieldLabel}>Alias </span> : skin === "playbill" ? "as " : null}
        {c.poster.epithet}
      </div>
      <p className={s.posterHook} data-part="posterHook">
        {c.poster.hook}
      </p>
      {c.poster.reward && (
        <div className={s.posterReward} data-part="posterReward">
          REWARD · {c.poster.reward}
        </div>
      )}
      <div className={s.posterTag} data-part="posterTag">
        {skin === "dossier" && <span className={s.fieldLabel}>Record </span>}
        {cls}
      </div>
    </>
  );

  return (
    <div style={{ position: "relative" }}>
      <article
        className={`${s.poster} ${claimed ? s.claimed : ""}`}
        style={{ ["--tilt" as string]: `${tilt ?? tiltFor(c.id)}deg` }}
        data-part="poster"
        aria-label={linked ? undefined : `${shownName}, ${c.poster.epithet}`}
      >
        <span className={s.pin} data-part="pin" aria-hidden="true" />
        {core && (
          <span className={s.coreTag} data-part="coreTag">
            {words.needed}
          </span>
        )}
        {linked ? (
          <Link
            href={`/${slug}/${c.id}`}
            className={s.posterLink}
            data-part="face"
          >
            {face}
            <span className={s.srOnly}>
              {claim ? ` (${words.claimed.toLowerCase()})` : ""}
              {core ? ` (${words.needed.toLowerCase()})` : ""} Open the sheet.
            </span>
          </Link>
        ) : (
          <div className={s.posterLink} data-part="face">
            {face}
          </div>
        )}
        {onToggleClaim &&
          (claim?.mine ? (
            <button type="button" className={s.unclaim} data-part="unclaim" onClick={onToggleClaim}>
              {words.pinBack}
              <span className={s.srOnly}> ({shownName})</span>
            </button>
          ) : claim ? (
            <span className={s.heldBy} data-part="heldBy">
              {words.heldBy} {claim.name ?? "someone"}
            </span>
          ) : (
            <button type="button" className={s.strip} data-part="strip" onClick={tear}>
              <ContentCutIcon sx={{ fontSize: 16 }} aria-hidden="true" /> {tearWords}
              <span className={s.srOnly}>: {shownName}</span>
            </button>
          ))}
        {claim && (
          <span className={s.claimedStamp} data-part="claimedStamp" aria-hidden="true">
            {words.claimed}
            {claim.name && <span className={s.stampName}>{claim.mine ? "by you" : claim.name}</span>}
          </span>
        )}
      </article>
      {justTorn && <span className={s.falling} data-part="falling" aria-hidden="true" />}
    </div>
  );
}
