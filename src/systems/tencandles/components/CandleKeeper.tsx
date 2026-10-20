import { useEffect, useRef, useState } from "react";
import { SoundEngine } from "@/lib/sound/synth";
import { buzz } from "@/lib/shake";
import type { TcSettings } from "../rules";
import type { TcAction, TcView } from "../game";
import s from "./Tc.module.css";

/**
 * Candles on the screen that behave like real ones: each burns down over the
 * table's burn time, and drafts now and then make one sputter. The GM's page
 * keeps them: it puts out a candle when its time is up and, at random, raises
 * a draft, which then waits in the game for the GM to decide (so the TV shows
 * the candle sputtering, and a reload doesn't lose it).
 */

type Act = (a: TcAction) => Promise<string | null>;

/** A clock that ticks every `ms`, for burn-down displays. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** How much of each lit candle is left to burn (1 fresh, 0 spent), or null where candles don't burn. */
export function candlesLeft(game: Pick<TcView, "candles" | "burnsOut" | "burnLife">, now: number): (number | null)[] {
  return game.candles.map((on, i) => {
    const out = game.burnsOut?.[i];
    const life = game.burnLife?.[i];
    if (!on || out === null || out === undefined || !life) return null;
    return Math.max(0, Math.min(1, (out - now) / life));
  });
}

const minutes = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** How often the GM's page rolls for a draft. */
const DRAFT_CHECK_MS = 15_000;

/** Run on the GM's page: put out spent candles, and raise drafts at the table's rate. */
export function useCandleKeeper(game: TcView | null, act: Act) {
  const sent = useRef(new Set<number>());
  const latest = useRef(game);
  useEffect(() => {
    latest.current = game;
  });

  useEffect(() => {
    const burn = window.setInterval(() => {
      const g = latest.current;
      if (!g) return;
      const now = Date.now();
      g.candles.forEach((on, i) => {
        if (!on) {
          sent.current.delete(i);
          return;
        }
        const out = g.burnsOut?.[i];
        if (out !== null && out !== undefined && out <= now && !sent.current.has(i)) {
          sent.current.add(i);
          void act({ type: "burnout", index: i });
        }
      });
    }, 5_000);
    const drafts = window.setInterval(() => {
      const g = latest.current;
      if (!g || g.draft || !(g.phase === "scene" || g.phase === "truths")) return;
      const rate = g.settings.draftsPerHour ?? 0;
      if (rate > 0 && Math.random() < (rate * DRAFT_CHECK_MS) / 3_600_000) void act({ type: "draft" });
    }, DRAFT_CHECK_MS);
    return () => {
      window.clearInterval(burn);
      window.clearInterval(drafts);
    };
  }, [act]);
}

/**
 * The draft, put in front of the GM so it can't be missed: a dialog over the
 * page, a gust, a buzz, the tab's title, and (when allowed) a system
 * notification if the GM is in another tab.
 */
export function DraftPrompt({ game, act, busy }: { game: TcView; act: Act; busy: boolean }) {
  const draft = game.draft;
  const engine = useRef<SoundEngine | null>(null);
  const yes = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => engine.current?.dispose(), []);

  useEffect(() => {
    if (!draft) return;
    const title = document.title;
    let on = true;
    const flash = window.setInterval(() => {
      document.title = on ? "🕯 A draft! Decide" : title;
      on = !on;
    }, 900);
    try {
      if (SoundEngine.isSupported()) {
        engine.current ??= new SoundEngine({ volume: 0.8 });
        engine.current.playStinger("whoosh");
      }
    } catch {
      /* no audio */
    }
    buzz([120, 60, 120]);
    if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("A draft at the table", { body: `Candle ${draft.index + 1} is sputtering. Does it go out?` });
      } catch {
        /* notifications refused */
      }
    }
    yes.current?.focus();
    return () => {
      window.clearInterval(flash);
      document.title = title;
    };
  }, [draft]);

  if (!draft) return null;
  return (
    <div className={s.draftScrim} role="alertdialog" aria-modal="true" aria-labelledby="draft-title" aria-describedby="draft-text">
      <div className={s.draftCard}>
        <p className={s.eyebrow}>A draft</p>
        <h2 id="draft-title">Candle {draft.index + 1} is sputtering</h2>
        <p id="draft-text" className={s.prose}>
          The TV shows it guttering. Does it go out? If it does, that&apos;s a candle gone: the scene ends, as it would for a real
          one.
        </p>
        <div className={s.row}>
          <button ref={yes} type="button" className={`${s.btn} ${s.danger}`} disabled={busy} onClick={() => void act({ type: "draftSettle", out: true })}>
            It goes out
          </button>
          <button type="button" className={s.btn} disabled={busy} onClick={() => void act({ type: "draftSettle", out: false })}>
            It holds
          </button>
        </div>
      </div>
    </div>
  );
}

const BURN_CHOICES: { label: string; min: number; max: number }[] = [
  { label: "No: real candles on the table", min: 0, max: 0 },
  { label: "1 to 1½ hours each", min: 60, max: 90 },
  { label: "2 to 3 hours each", min: 120, max: 180 },
  { label: "3 to 4 hours each", min: 180, max: 240 },
];

const DRAFT_CHOICES: { label: string; rate: number }[] = [
  { label: "Never", rate: 0 },
  { label: "About once an hour", rate: 1 },
  { label: "About twice an hour", rate: 2 },
  { label: "Often (four an hour)", rate: 4 },
];

/** The table's candle settings, and when the next one burns down. Changeable at any time. */
export function CandleSettings({ game, act }: { game: TcView; act: Act }) {
  const now = useNow(30_000);
  const set = (patch: Partial<TcSettings>) => void act({ type: "settings", patch });
  const burn = BURN_CHOICES.findIndex((c) => c.min === (game.settings.burnMin ?? 0) && c.max === (game.settings.burnMax ?? 0));
  const draft = DRAFT_CHOICES.findIndex((c) => c.rate === (game.settings.draftsPerHour ?? 0));
  const next = game.candles
    .map((on, i) => ({ i, out: on ? (game.burnsOut?.[i] ?? null) : null }))
    .filter((x): x is { i: number; out: number } => x.out !== null)
    .sort((a, b) => a.out - b.out)[0];
  const [notify, setNotify] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  return (
    <div className={s.candleSettings}>
      <label className={s.hint}>
        Candles burn down on the screen:{" "}
        <select
          className={s.field}
          value={burn >= 0 ? burn : 2}
          onChange={(e) => {
            const c = BURN_CHOICES[Number(e.target.value)];
            set({ burnMin: c.min, burnMax: c.max });
          }}
        >
          {BURN_CHOICES.map((c, i) => (
            <option key={c.label} value={i}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className={s.hint}>
        Drafts:{" "}
        <select className={s.field} value={draft >= 0 ? draft : 1} onChange={(e) => set({ draftsPerHour: DRAFT_CHOICES[Number(e.target.value)].rate })}>
          {DRAFT_CHOICES.map((c, i) => (
            <option key={c.label} value={i}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {notify === "default" && (
        <button type="button" className={s.quiet} onClick={() => void Notification.requestPermission().then(setNotify)}>
          Alert me when this tab is in the background
        </button>
      )}
      {next && (
        <p className={s.hint} style={{ margin: 0 }}>
          Next to burn down: candle {next.i + 1}, in {minutes(next.out - now)}.
          {game.settings.burnMin ? " The page puts candles out as they burn down; keep it open." : ""}
        </p>
      )}
    </div>
  );
}
