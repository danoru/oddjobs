import { useEffect, useRef, useState } from "react";
import type { ActData, LiveEvent, NoteData, PoolRollData, RollData } from "@/lib/live";
import { useLive } from "@/lib/useLive";
import { DiceFaces, rollWords } from "@/components/table/TableToys";
import { PosterIcon } from "@/components/PosterIcon";
import type { Poster } from "@/lib/coreSchema";
import { roman } from "@/lib/box";
import v from "./Live.module.css";

/**
 * What the table's event log puts on the TV, over either system's board:
 * act cards between scenes (title, then the image wipes in), the dice tray
 * and roll log, the town board's notices, a folded note changing hands (never
 * its text) and brass coins flying between posters. It always asks as the
 * table, so a TV cast from the GM's laptop shows only what's public.
 */
export function TvLive({
  code,
  tray,
  icons,
  sound,
}: {
  code: string | null;
  /** "full": the big tray plus the log (d20 systems); "log": just the log (the game shows its own dice). */
  tray: "full" | "log";
  /** Poster icons for the engraved panel behind an act card without an image. */
  icons: Poster["icon"][];
  sound: boolean;
}) {
  const live = useLive(code, "table", null);
  const { fold, events, baseline } = live;
  const fresh = (e: LiveEvent) => baseline !== null && e.id > baseline;

  // ---- Act cards: full screen for a while when raised, then a corner chip.
  const [doneAct, setDoneAct] = useState<number | null>(null);
  const actEvent = [...events].reverse().find((e) => e.kind === "act");
  const actId = actEvent && fold.act ? actEvent.id : null;
  // A card raised since the TV loaded has the screen for a while, then shrinks to a chip.
  const showAct = actId !== null && actEvent && fresh(actEvent) && doneAct !== actId ? actId : null;
  useEffect(() => {
    if (showAct === null) return;
    const timer = window.setTimeout(() => setDoneAct(showAct), 11000);
    return () => window.clearTimeout(timer);
  }, [showAct]);

  // ---- Notes changing hands, and coins in flight: play each new one once.
  const [flutter, setFlutter] = useState<LiveEvent | null>(null);
  const [flight, setFlight] = useState<{ id: number; from: DOMRect | null; to: DOMRect | null; label: string } | null>(null);
  const played = useRef(0);
  useEffect(() => {
    if (baseline === null) return;
    const news = events.filter((e) => e.id > Math.max(baseline, played.current));
    if (!news.length) return;
    played.current = Math.max(...news.map((e) => e.id));
    const note = news.filter((e) => e.kind === "note").at(-1);
    if (note) setFlutter(note);
    const coin = news.filter((e) => e.kind === "coin").at(-1);
    if (coin) {
      const find = (p: LiveEvent["by"]) =>
        p && typeof p === "object" && p.characterId ? (document.querySelector(`[data-character="${p.characterId}"]`)?.getBoundingClientRect() ?? null) : null;
      const d = coin.data as { fromName: string; toName: string };
      setFlight({ id: coin.id, from: find(coin.by), to: find(coin.to), label: `${d.fromName} tosses a coin to ${d.toName}` });
      if (sound) clink();
    }
  }, [events, baseline, sound]);
  useEffect(() => {
    if (!flutter) return;
    const timer = window.setTimeout(() => setFlutter(null), 4200);
    return () => window.clearTimeout(timer);
  }, [flutter]);
  useEffect(() => {
    if (!flight) return;
    const timer = window.setTimeout(() => setFlight(null), 3200);
    return () => window.clearTimeout(timer);
  }, [flight]);

  const rolls = fold.rolls.slice(-6).reverse();
  const latest = rolls.find((e) => e.data && fresh(e)) ?? null;
  const act = fold.act;

  return (
    <>
      {/* The town board */}
      {fold.notices.length > 0 && (
        <aside className={v.board} aria-label="The town board" data-testid="tv-notices">
          <div className={v.boardTitle}>THE TOWN BOARD</div>
          {fold.notices.map((n, i) => (
            <div key={n.nid} className={v.notice} style={{ ["--tilt" as string]: `${i % 2 ? 1.4 : -1.2}deg` }}>
              <div className={v.noticeKind}>{n.kind === "poster" ? "NEW" : n.kind === "reward" ? "REWARD" : n.kind === "sighted" ? "SIGHTED" : "NOTICE"}</div>
              <div className={v.noticeTitle}>{n.title}</div>
              {n.text && <div className={v.noticeText}>{n.text}</div>}
              {n.settled && <span className={v.settled}>SETTLED</span>}
            </div>
          ))}
        </aside>
      )}

      {/* The dice tray and the roll log */}
      {(rolls.length > 0 || tray === "full") && (
        <aside className={v.tray} aria-label="Dice tray" data-testid="tv-tray">
          {tray === "full" && latest?.data ? (
            <div key={latest.id} className={v.trayLatest}>
              <div className={v.trayWho}>{(latest.data as RollData).who}</div>
              <DiceFaces data={latest.data as RollData | PoolRollData} size={54} />
              <div className={`${v.trayTotal} ${(latest.data as RollData).nat === 20 ? v.nat20 : (latest.data as RollData).nat === 1 ? v.nat1 : ""}`}>
                {(latest.data as RollData).system === "d20" ? (latest.data as RollData).total : ""}
              </div>
              <div className={v.trayLabel}>{rollWords(latest.data as RollData | PoolRollData)}</div>
            </div>
          ) : null}
          {rolls.length > 0 && (
            <ol className={v.log} data-testid="tv-roll-log">
              {rolls.map((e) => (
                <li key={e.id}>
                  {e.redacted || !e.data ? (
                    <i>A die rattles behind the screen.</i>
                  ) : (
                    <>
                      <b>{(e.data as RollData).who}</b> · {rollWords(e.data as RollData | PoolRollData)}
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </aside>
      )}

      {/* The current act, small, once its card has had the screen */}
      {act && showAct === null && (
        <div className={v.actChip} data-testid="tv-act-chip">
          Act {roman(act.index)} · {act.title}
        </div>
      )}

      <span data-testid="tv-notes-passed" hidden>
        {fold.notes.length}
      </span>
      {/* A note changes hands: the envelope only */}
      {flutter && (
        <div key={flutter.id} className={v.flutter} role="status" data-testid="tv-note">
          <span className={v.folded} aria-hidden="true" />
          {(flutter.data as NoteData).fromName} passes a note to {(flutter.data as NoteData).toName}
        </div>
      )}

      {/* A brass coin flies from one poster to another */}
      {flight && <CoinFlight key={flight.id} from={flight.from} to={flight.to} label={flight.label} />}

      {/* The act card */}
      {act && showAct !== null && <ActCard key={showAct} act={act} icons={icons} />}
    </>
  );
}

function ActCard({ act, icons }: { act: ActData; icons: Poster["icon"][] }) {
  return (
    <div className={v.curtain} role="dialog" aria-label={`Act ${roman(act.index)}: ${act.title}`} data-testid="tv-act-card">
      <div className={v.card}>
        <div className={v.actNo}>ACT {roman(act.index)}</div>
        <h2 className={v.actTitle}>{act.title}</h2>
        {act.subtitle && <p className={v.actSub}>{act.subtitle}</p>}
        <div className={v.wipe}>
          {act.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={act.image} alt="" />
          ) : (
            <div className={v.engraving} aria-hidden="true">
              {icons.slice(0, 5).map((ic, i) => (
                <PosterIcon key={i} icon={ic} size={64} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CoinFlight({ from, to, label }: { from: DOMRect | null; to: DOMRect | null; label: string }) {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  const h = typeof window === "undefined" ? 720 : window.innerHeight;
  const start = from ? { x: from.left + from.width / 2, y: from.top + from.height / 3 } : { x: w / 2, y: h + 40 };
  const end = to ? { x: to.left + to.width / 2, y: to.top + to.height / 3 } : { x: w / 2, y: h / 2 };
  return (
    <>
      <span
        className={v.flyingCoin}
        aria-hidden="true"
        style={{
          ["--x0" as string]: `${start.x}px`,
          ["--y0" as string]: `${start.y}px`,
          ["--x1" as string]: `${end.x}px`,
          ["--y1" as string]: `${end.y}px`,
        }}
      >
        ✦
      </span>
      <div className={v.coinCaption} role="status" data-testid="tv-coin">
        {label}
      </div>
    </>
  );
}

/** A brass clink, synthesised. */
let ctx: AudioContext | null = null;
function clink() {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    for (const [f, d] of [
      [2350, 0.5],
      [3120, 0.35],
      [4700, 0.2],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + d);
    }
  } catch {
    /* no audio */
  }
}
