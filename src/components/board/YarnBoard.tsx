import type { CoreCharacter } from "@/lib/schema";
import { sag, yarnLayout } from "@/lib/yarn";
import { tiltFor } from "./Poster";
import s from "./YarnBoard.module.css";

/**
 * Who knows whom, as a conspiracy board: cards pinned in an oval, red string
 * between tied characters, board-safe tie lines on little tags. Once posters
 * are being claimed, unclaimed characters turn into grey NPC cards.
 */
export function YarnBoard({
  cast,
  claimedBy,
}: {
  cast: Pick<CoreCharacter, "id" | "name" | "poster" | "story">[];
  /** id → player name (null when unknown). Omit before anyone's claimed. */
  claimedBy?: Record<string, { name: string | null }>;
}) {
  const { cards, strings } = yarnLayout(cast);
  const pos = Object.fromEntries(cards.map((c) => [c.id, c]));
  const anyClaimed = Boolean(claimedBy && Object.keys(claimedBy).length);
  const isNpc = (id: string) => anyClaimed && !claimedBy?.[id];

  return (
    <>
      <div className={s.board} data-part="yarnBoard" role="img" aria-label="Who knows whom: a board of characters joined by red string">
        <svg className={s.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {strings.map((st) => {
            const a = pos[st.from];
            const b = pos[st.to];
            const c = sag(a, b);
            return (
              <path
                key={st.key}
                className={isNpc(st.from) || isNpc(st.to) ? s.yarnFaint : s.yarn}
                d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {strings
          .filter((st) => st.labels.length)
          .map((st) => {
            const a = pos[st.from];
            const b = pos[st.to];
            const c = sag(a, b);
            // Midpoint of the quadratic curve (t = 0.5).
            const x = 0.25 * a.x + 0.5 * c.x + 0.25 * b.x;
            const y = 0.25 * a.y + 0.5 * c.y + 0.25 * b.y;
            return (
              <span key={st.key} className={s.tag} style={{ left: `${x}%`, top: `${y}%` }}>
                {st.labels[0]}
              </span>
            );
          })}
        {cards.map((c) => {
          const claim = claimedBy?.[c.id];
          return (
            <div
              key={c.id}
              className={isNpc(c.id) ? s.npc : s.card}
              style={{ left: `${c.x}%`, top: `${c.y}%`, ["--tilt" as string]: `${tiltFor(c.id, 3)}deg` }}
            >
              <span className={s.pin} aria-hidden="true" />
              <div className={s.name}>{c.label}</div>
              <div className={s.who}>{isNpc(c.id) ? "NPC tonight" : claim ? (claim.name ?? "claimed") : " "}</div>
            </div>
          );
        })}
      </div>

      <ul className={s.list}>
        {strings.map((st) => (
          <li key={st.key}>
            <span className={s.listYarn}>
              {pos[st.from].label} — {pos[st.to].label}
            </span>{" "}
            {st.labels.join(" · ")}
          </li>
        ))}
      </ul>
    </>
  );
}
