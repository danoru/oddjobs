import { useLive } from "@/lib/useLive";
import s from "./Board.module.css";
import v from "@/components/tv/Live.module.css";

const KIND: Record<string, string> = { poster: "NEW POSTER", reward: "REWARD CHANGED", sighted: "SIGHTED", settled: "NOTICE" };

/**
 * Notices the GM has pinned to the town board tonight (src/lib/live.ts),
 * shown on the job page to everyone at the table. Presets stay off the page
 * until they're pinned.
 */
export function TownBoard({ code, playerId }: { code: string | null; playerId: string | null }) {
  const { fold } = useLive(code, playerId ? "player" : "table");
  if (!code || fold.notices.length === 0) return null;
  return (
    <section aria-labelledby="town-board" style={{ marginBottom: 32 }} data-testid="job-notices">
      <h2 id="town-board" className={s.noteTitle} style={{ color: "var(--parchment)" }}>
        Pinned up tonight
      </h2>
      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))" }}>
        {fold.notices.map((n, i) => (
          <div key={n.nid} className={v.notice} style={{ ["--tilt" as string]: `${i % 2 ? 1.2 : -1}deg` }}>
            <div className={v.noticeKind}>{KIND[n.kind]}</div>
            <div className={v.noticeTitle}>{n.title}</div>
            {n.text && <div className={v.noticeText}>{n.text}</div>}
            {n.settled && <span className={v.settled}>SETTLED</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
