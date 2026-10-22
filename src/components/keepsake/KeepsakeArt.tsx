import { useId, type ReactNode } from "react";
import type { KeepsakeArt as ArtKey } from "@/lib/schema";

/**
 * Keepsake drawings (phase 13): small objects cut like woodblocks, solid ink
 * with the highlights gouged out in paper. On a 48×48 grid, filled with
 * `currentColor`, so they sit on any parchment and print as ink.
 *
 * A keepsake whose character fell comes home damaged: wood, paper and leaf
 * are scorched (a burnt bite out of one corner), metal, wax and shell are
 * cracked (a split right through). One overlay each, for every drawing.
 */

const PAPER = "var(--keepsake-paper, var(--parchment, #f3e7cb))";

/** Paper-coloured gouges over the ink. */
function Cut({ d, w = 1.4, dash }: { d: string; w?: number; dash?: string }) {
  return <path d={d} fill="none" stroke={PAPER} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />;
}

const ART: Record<ArtKey, () => ReactNode> = {
  ticket: () => (
    <>
      <path d="M5 14h38v7a3 3 0 0 0 0 6v7H5v-7a3 3 0 0 0 0-6z" />
      <Cut d="M15 16v16" dash="1.5 2" />
      <Cut d="M20 20h17M20 24h12M20 28h15" />
      <path d="M10 21l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z" fill={PAPER} />
    </>
  ),
  paddle: () => (
    <>
      <ellipse cx="24" cy="17" rx="12.5" ry="13" />
      <rect x="21" y="28" width="6" height="17" rx="2" />
      <Cut d="M17.5 12l2-1.5v12" w={2} />
      <Cut d="M23.5 11h5.5l-3.2 4.2c2.6 0 3.8 1.6 3.8 3.3 0 2.1-1.7 3.4-3.8 3.4-1.3 0-2.5-.5-3.3-1.4" w={2} />
      <Cut d="M22.5 34h3M22.5 37.5h3M22.5 41h3" w={1} />
      <Cut d="M14 9c-1.6 1.8-2.4 4-2.5 6.5" w={1} />
    </>
  ),
  gavel: () => (
    <>
      <g transform="rotate(-30 24 20)">
        <rect x="9" y="10" width="24" height="10" rx="2" />
        <rect x="7" y="9" width="3.5" height="12" rx="1" />
        <rect x="31.5" y="9" width="3.5" height="12" rx="1" />
        <rect x="19.5" y="19" width="3" height="23" rx="1.5" />
        <Cut d="M14 12.5v5M28 12.5v5" w={1.1} />
        <Cut d="M12 14.5h4" w={1} />
      </g>
      <rect x="5" y="38" width="17" height="6" rx="1.5" />
      <Cut d="M7 40.5h13" w={1} />
    </>
  ),
  coin: () => (
    <>
      <circle cx="24" cy="24" r="16" />
      <Cut d="M24 11.5a12.5 12.5 0 1 1 0 25 12.5 12.5 0 0 1 0-25" w={1.1} dash="0.1 2.4" />
      <Cut d="M14 26c3.3-3 6.7 3 10 0s6.7 3 10 0" w={1.8} />
      <Cut d="M16 31c2.7-2.4 5.3 2.4 8 0s5.3 2.4 8 0" w={1.4} />
      <circle cx="24" cy="18" r="2.6" fill={PAPER} />
      <Cut d="M12.5 17.5c1-2.6 2.8-4.6 5-6" w={1} />
    </>
  ),
  bell: () => (
    <>
      <path d="M24 5c1.6 0 2.7 1 2.7 2.4 5.6 1.3 8.8 6.2 8.8 13v7.3c0 3 1.5 5.1 4.2 6.6V36h-31.4v-1.7c2.7-1.5 4.2-3.6 4.2-6.6v-7.3c0-6.8 3.2-11.7 8.8-13C21.3 6 22.4 5 24 5z" />
      <circle cx="24" cy="40" r="3.4" />
      <Cut d="M12.8 29.5h22.4" w={1.4} />
      <Cut d="M12.6 32.4h22.8" w={0.8} />
      <Cut d="M17.5 14c-1.6 2-2.3 4.4-2.3 7.5v5" w={1.6} />
    </>
  ),
  key: () => (
    <>
      <path d="M14 15a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z" fillRule="evenodd" />
      <rect x="21" y="22" width="22" height="4" rx="1" />
      <rect x="34" y="25" width="3" height="7" />
      <rect x="39" y="25" width="3.5" height="5" />
      <rect x="25" y="20.5" width="2" height="7" rx="0.5" />
      <Cut d="M7.5 21c.6-1.8 1.8-3.2 3.3-4" w={1.1} />
      <Cut d="M29 24h11" w={0.8} />
    </>
  ),
  candle: () => (
    <>
      <path d="M24 5c1.9 2.7 3 4.6 3 6.2a3 3 0 0 1-6 0c0-1.6 1.1-3.5 3-6.2z" />
      <rect x="23.2" y="13.5" width="1.6" height="3" />
      <path d="M18 17h12v4c0 1.3-1.4 1.3-1.4 3v3.5c0 1-1.6 1-1.6 0V24c0-1-.8-1-1.1 0V36H18z" />
      <path d="M8 38c0-1.6 7-3 16-3s16 1.4 16 3-7 4-16 4-16-2.4-16-4z" />
      <path d="M38 37h4.5a3 3 0 0 1 0 6H39v-2h3.5a1 1 0 0 0 0-2H38z" />
      <Cut d="M20.5 20v13" w={1.2} />
      <Cut d="M13 39.5c3 1 7 1.5 11 1.5" w={0.9} />
    </>
  ),
  lantern: () => (
    <>
      <path d="M24 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 1.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z" fillRule="evenodd" />
      <path d="M16.5 11h15l3.5 6h-22z" />
      <rect x="14" y="17" width="20" height="21" rx="1" />
      <rect x="11.5" y="37.5" width="25" height="5" rx="1.5" />
      <Cut d="M19.5 19.5v16M28.5 19.5v16" w={1.2} />
      <path d="M24 22c2.2 3 3.2 5.2 3.2 7.2a3.2 3.2 0 0 1-6.4 0c0-2 1-4.2 3.2-7.2z" fill={PAPER} />
      <Cut d="M15 14.5h18" w={0.8} />
      <Cut d="M14 40h20" w={0.8} />
    </>
  ),
  ring: () => (
    <>
      <path d="M24 15a14 14 0 1 1 0 28 14 14 0 0 1 0-28zm0 4a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fillRule="evenodd" />
      <path d="M24 3l7 7-7 8-7-8z" />
      <path d="M19 15.5h10l-1.5 3h-7z" />
      <Cut d="M17 10h14M24 3v15M20.5 10l3.5 8 3.5-8" w={0.9} />
      <Cut d="M13 32c.3 3 1.8 5.6 4 7.4" w={1.3} />
    </>
  ),
  sprig: () => (
    <>
      <path d="M13 44C18 33 25 21 35 8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M21 30c-6-1-11 1-13 6 6 2 11 0 13-6z" />
      <path d="M25 22c-1-6 2-11 7-13 1 6-2 11-7 13z" />
      <path d="M28 20c6 0 10 3 11 8-6 1-10-2-11-8z" />
      <path d="M18 34c4 3 6 7 5 11-4-2-6-6-5-11z" />
      <ellipse cx="36" cy="8" rx="3.4" ry="4" transform="rotate(35 36 8)" />
      <path d="M32.5 4.5c1.8-1.6 4.7-1.9 6.9-.2l-1.4 2.4c-1.6-.7-3.5-.6-4.9.3z" />
      <Cut d="M9.5 35.5c3.6-2 7.6-3.6 11-5" w={0.9} />
      <Cut d="M25.5 21.5c1.4-3.8 3.6-8 6.2-11.6" w={0.9} />
      <Cut d="M28.5 20.5c3.5 1.6 7 4 10 7" w={0.9} />
    </>
  ),
  letter: () => (
    <>
      <rect x="5" y="12" width="38" height="24" rx="1.5" />
      <Cut d="M6.5 13.5L24 27l17.5-13.5" w={1.4} />
      <Cut d="M6.5 34.5L19 24M41.5 34.5L29 24" w={0.9} />
      <circle cx="24" cy="27" r="5.2" fill={PAPER} />
      <circle cx="24" cy="27" r="3.8" />
      <Cut d="M22.4 27h3.2M24 25.4v3.2" w={0.8} />
    </>
  ),
  mask: () => (
    <>
      <path d="M3 17c6.5-3.4 14-3.2 21 1 7-4.2 14.5-4.4 21-1-1 10-6.4 15-11.5 15-4.3 0-6.6-3-9.5-6.2-2.9 3.2-5.2 6.2-9.5 6.2C9.4 32 4 27 3 17z" />
      <path d="M38.5 30.5l1.8-.6 4.6 14.6-1.8.6z" />
      <ellipse cx="14.5" cy="22" rx="4.6" ry="2.9" fill={PAPER} transform="rotate(8 14.5 22)" />
      <ellipse cx="33.5" cy="22" rx="4.6" ry="2.9" fill={PAPER} transform="rotate(-8 33.5 22)" />
      <Cut d="M24 21v5" w={1} />
      <Cut d="M7 19.5c2-.9 4-1.4 6-1.5M41 19.5c-2-.9-4-1.4-6-1.5" w={0.9} />
    </>
  ),
  book: () => (
    <>
      <rect x="10" y="6" width="28" height="36" rx="2" />
      <rect x="7" y="7.5" width="5" height="33" rx="1.5" />
      <rect x="36" y="20" width="6" height="8" rx="1" />
      <Cut d="M15 10.5h19v27H15z" w={1} />
      <Cut d="M8.5 13h2M8.5 35h2" w={1} />
      <path d="M24.5 16l1.6 4.4 4.6.2-3.6 2.9 1.2 4.5-3.8-2.6-3.8 2.6 1.2-4.5-3.6-2.9 4.6-.2z" fill={PAPER} />
    </>
  ),
  ember: () => (
    <>
      <path d="M9 37c-2.5-6 1-12.5 6.5-15.5 2-6.5 9.5-9.5 15.5-6.5 6 2.5 9 8.5 7.5 14.5 3 4 .5 9.5-5 10.5H14.5c-4 0-6-1-5.5-3z" />
      <path d="M22 12c-2-3-1-6 1-8 0 2.4 1.6 3.4 2.4 5.4.6 1.8-.6 3.4-1.6 4z" />
      <path d="M31 13c-.6-2 .4-3.6 1.8-4.6-.2 1.6.8 2.4 1 3.6.2 1-.6 1.8-1.4 2z" />
      <Cut d="M15.5 27l5 3.5-1.5 5.5" w={1.3} />
      <Cut d="M26 20l1.5 5.5 6 2.5" w={1.3} />
      <Cut d="M31.5 32l-4 4.5M22 36h4" w={1.1} />
    </>
  ),
  seal: () => (
    <>
      <path d="M24 7c3 0 4 2 6 2.5s5-.5 6.5 2-.5 4.5.5 6.5 3 3.5 2 6-3 3-3.5 5.5 0 5-2.5 6.5-4.5-.5-6.5.5S27 41 24 41s-4-2-6-2.5-5 .5-6.5-2 .5-4.5-.5-6.5-3-3.5-2-6 3-3 3.5-5.5 0-5 2.5-6.5 4.5.5 6.5-.5S21 7 24 7z" />
      <path d="M36 36c1 2 1 5-.5 7-1-1.5-1.5-3.5-1-5.5z" />
      <Cut d="M24 14.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19" w={1.1} />
      <path d="M24 17.5c1.6 2.3 3.6 3.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2.8 2-4.1 3.6-6.4z" fill={PAPER} />
      <Cut d="M20 30h8" w={1} />
    </>
  ),
  shell: () => (
    <>
      <path d="M24 39L7.5 21C9.5 11.5 16.5 7 24 7s14.5 4.5 16.5 14z" />
      <path d="M19 37h10l-1.5 5h-7z" />
      <Cut d="M24 37L11.5 19M24 37L16.5 12.5M24 37V9.5M24 37l7.5-24.5M24 37l12.5-18" w={1.2} />
      <Cut d="M21 39.5h6" w={0.8} />
    </>
  ),
  capsule: () => (
    <>
      <rect x="14" y="9" width="20" height="33" rx="4" />
      <rect x="12" y="8" width="24" height="7" rx="1.5" />
      <rect x="21" y="4" width="6" height="5" rx="1" />
      <Cut d="M17 18h14M17 38h14" w={1} />
      <Cut d="M18 22.5h12v10H18z" w={1} />
      <Cut d="M20.5 26h7M20.5 29h5" w={0.8} />
      <circle cx="15.5" cy="11.5" r="0.9" fill={PAPER} />
      <circle cx="32.5" cy="11.5" r="0.9" fill={PAPER} />
    </>
  ),
  badge: () => (
    <>
      <path d="M15 27l-5 15 5.5-2.5 3.5 4.5 4-14z" />
      <path d="M33 27l5 15-5.5-2.5-3.5 4.5-4-14z" />
      <circle cx="24" cy="19" r="13" />
      <Cut d="M24 9a10 10 0 1 1 0 20 10 10 0 0 1 0-20" w={1} dash="0.1 2.2" />
      <path d="M15.5 19c2.4-3.6 5.3-5.4 8.5-5.4s6.1 1.8 8.5 5.4c-2.4 3.6-5.3 5.4-8.5 5.4S17.9 22.6 15.5 19z" fill={PAPER} />
      <circle cx="24" cy="19" r="2.8" />
    </>
  ),
  thorn: () => (
    <>
      <path d="M7 42C17 33 27 23 41 7" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <path d="M14 36l-6-2 7.5-1z" />
      <path d="M18.5 31.5l1-6.5 1.6 5z" />
      <path d="M25 25l-6.5-1.5 7-1z" />
      <path d="M29.5 20l1.5-6.5 .7 5.4z" />
      <path d="M35 14l-6-.5 6.2-1.8z" />
      <path d="M38 10.5l3.5-1 .5 2.5z" />
      <circle cx="31.5" cy="31.5" r="4.5" />
      <path d="M31.5 25.5v-2M37.5 31.5h2M31.5 37.5v2M25.5 31.5h-2M35.7 27.3l1.5-1.5M35.7 35.7l1.5 1.5M27.3 35.7l-1.5 1.5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="31.5" cy="31.5" r="1.8" fill={PAPER} />
    </>
  ),
  pocketwatch: () => (
    <>
      <path d="M24 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 1.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z" fillRule="evenodd" />
      <rect x="21.5" y="9.5" width="5" height="4" rx="1" />
      <circle cx="24" cy="28" r="15" />
      <Cut d="M24 16.5a11.5 11.5 0 1 1 0 23 11.5 11.5 0 0 1 0-23" w={1.1} />
      <Cut d="M24 18.5v2.2M33.5 28h-2.2M24 37.5v-2.2M14.5 28h2.2" w={1.2} />
      <Cut d="M24 28v-6.5M24 28l4.5 3" w={1.6} />
    </>
  ),
};

/** How each object takes a fall. */
const DAMAGE: Record<ArtKey, "cracked" | "scorched"> = {
  ticket: "scorched",
  paddle: "scorched",
  gavel: "scorched",
  coin: "cracked",
  bell: "cracked",
  key: "cracked",
  candle: "scorched",
  lantern: "cracked",
  ring: "cracked",
  sprig: "scorched",
  letter: "scorched",
  mask: "cracked",
  book: "scorched",
  ember: "cracked",
  seal: "cracked",
  shell: "cracked",
  capsule: "cracked",
  badge: "cracked",
  thorn: "scorched",
  pocketwatch: "cracked",
};

export const damageOf = (art: ArtKey) => DAMAGE[art];

/** The burnt edge: what a scorch eats out of the lower right. */
const BURN = "M48 16c-3 1.5-3 5-6.5 6s-2.5 4.5-6 5.5-2 4.5-5.5 5.5-1.5 4.5-4.5 6-1 4-4 5.5-.5 2.5-1.5 3.5H48z";
/** A split through the middle, with a branch. */
const CRACK = "M27 2l-3.5 9 4 5.5-5 6 3.5 6.5-4.5 6 2.5 5-2 6";
const BRANCH = "M23.5 22.5l-5.5 2.5-2 4.5M26 29l5 1.5";

/** One keepsake, drawn. `fallen`: its character fell, so it's cracked or scorched. Decorative: label it where it's used. */
export function KeepsakeArt({ art, fallen = false, size = 48, className }: { art: ArtKey; fallen?: boolean; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const draw = ART[art] ?? ART.ticket;
  const damage = fallen ? DAMAGE[art] ?? "cracked" : null;
  const shape = `shape-${uid}`;
  const hurt = `hurt-${uid}`;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="currentColor"
      data-art={art}
      data-damage={damage ?? undefined}
    >
      {damage && (
        <defs>
          {/* What's left of it: a burnt bite, or the split showing whatever's behind. */}
          <mask id={hurt} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
            <rect width="48" height="48" fill="#fff" />
            {damage === "scorched" ? (
              <path d={BURN} fill="#000" />
            ) : (
              <g fill="none" stroke="#000" strokeLinecap="round">
                <path d={CRACK} strokeWidth="1.8" />
                <path d={BRANCH} strokeWidth="1.1" />
              </g>
            )}
          </mask>
          {damage === "scorched" && (
            <>
              {/* The object's own outline, so the soot and the charred rim stay on it. */}
              <mask id={shape} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
                <g fill="#fff" color="#fff">
                  {draw()}
                </g>
              </mask>
              <radialGradient id={`soot-${uid}`} cx="0.85" cy="0.85" r="0.6">
                <stop offset="0.45" stopColor="#0d0702" stopOpacity="1" />
                <stop offset="1" stopColor="#120a03" stopOpacity="0" />
              </radialGradient>
            </>
          )}
        </defs>
      )}
      <g mask={damage ? `url(#${hurt})` : undefined}>{draw()}</g>
      {damage === "scorched" && (
        <g mask={`url(#${shape})`}>
          <rect width="48" height="48" fill={`url(#soot-${uid})`} mask={`url(#${hurt})`} opacity="0.85" />
          <path d={BURN.replace(/H48z$/, "")} fill="none" stroke="#1a0f05" strokeWidth="2.2" strokeLinejoin="round" />
          <path d={BURN.replace(/H48z$/, "")} fill="none" stroke="var(--wax, #9e2f22)" strokeWidth="0.7" strokeDasharray="1.5 3" transform="translate(-1 -1)" />
        </g>
      )}
    </svg>
  );
}
