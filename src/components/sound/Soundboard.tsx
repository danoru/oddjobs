import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@mui/material";
import type { Sounds } from "@/lib/schema";
import { SoundEngine } from "@/lib/sound/synth";
import s from "./Soundboard.module.css";

/** Shown when a one-shot declares no sounds of its own. */
const DEFAULT_SOUNDS: Sounds = {
  beds: [
    { id: "storm", label: "Storm", preset: "storm" },
    { id: "tavern", label: "Tavern", preset: "tavern" },
    { id: "fire", label: "Fire", preset: "fire" },
  ],
  stingers: [
    { id: "bell", label: "Bell", preset: "bell" },
    { id: "thunder", label: "Thunder", preset: "thunder" },
    { id: "door", label: "Door", preset: "door" },
  ],
};

const FLASH_MS = 450;

type WakeLockLike = { release(): Promise<void>; released?: boolean };

/** Keep the screen awake while `active`, where the browser allows it. Fails silently. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const api = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockLike> } }).wakeLock;
    if (!api) return;
    let cancelled = false;
    let lock: WakeLockLike | null = null;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const l = await api.request("screen");
        if (cancelled) {
          l.release().catch(() => {});
        } else {
          lock = l;
        }
      } catch {
        /* denied, or battery saver: carry on without it */
      }
    };
    // The lock is dropped whenever the tab is hidden, so take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}

export function Soundboard({ title, sounds }: { title: string; sounds?: Sounds | null }) {
  const declared = !!sounds && (sounds.beds.length > 0 || sounds.stingers.length > 0);
  const { beds, stingers } = declared ? sounds : DEFAULT_SOUNDS;

  const engineRef = useRef<SoundEngine | null>(null);
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [activeBed, setActiveBed] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());
  const [volume, setVolume] = useState(0.8);
  const [unsupported, setUnsupported] = useState(false);

  useWakeLock(activeBed !== null);

  // Tear the audio graph down when leaving the page (also covers React strict-mode remounts).
  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  /** The engine is created inside a tap handler so the AudioContext starts with a user gesture. */
  const getEngine = useCallback((): SoundEngine | null => {
    if (!SoundEngine.isSupported()) {
      setUnsupported(true);
      return null;
    }
    engineRef.current ??= new SoundEngine({ volume });
    return engineRef.current;
  }, [volume]);

  const toggleBed = (b: Sounds["beds"][number]) => {
    const engine = getEngine();
    if (!engine) return;
    if (activeBed === b.id) {
      engine.stopBed();
      setActiveBed(null);
    } else {
      engine.playBed(b.preset);
      setActiveBed(b.id);
    }
  };

  const fire = (st: Sounds["stingers"][number]) => {
    const engine = getEngine();
    if (!engine) return;
    engine.playStinger(st.preset);
    const timers = flashTimers.current;
    clearTimeout(timers.get(st.id));
    setFlashing((prev) => new Set(prev).add(st.id));
    timers.set(
      st.id,
      setTimeout(() => {
        timers.delete(st.id);
        setFlashing((prev) => {
          const next = new Set(prev);
          next.delete(st.id);
          return next;
        });
      }, FLASH_MS),
    );
  };

  const stopAll = () => {
    engineRef.current?.stopAll();
    setActiveBed(null);
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    engineRef.current?.setVolume(v);
  };

  return (
    <main id="main" tabIndex={-1} className={s.board}>
      <div className={s.head}>
        <p className={s.eyebrow}>Soundboard</p>
        <h1 className={s.title}>{title}</h1>
      </div>

      {!declared && (
        <p className={s.note}>
          This one-shot hasn&apos;t declared any sounds yet, so here is a starter set. Authors can list their own beds
          and stingers under <code>sounds</code> in <code>oneshot.json</code>.
        </p>
      )}
      {unsupported && (
        <p className={s.error} role="alert">
          This browser can&apos;t synthesise audio (no Web Audio support), so the pads will stay silent.
        </p>
      )}

      {beds.length > 0 && (
        <section className={s.section} aria-labelledby="sb-beds">
          <h2 className={s.sectionTitle} id="sb-beds">
            Ambience
          </h2>
          <div className={s.grid}>
            {beds.map((b) => {
              const on = activeBed === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`${s.pad} ${s.bed} ${on ? s.on : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleBed(b)}
                >
                  {on && (
                    <span className={s.eq} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                  <span className={s.padLabel}>{b.label}</span>
                  <span className={s.padHint}>{on ? "playing, tap to stop" : "loop"}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {stingers.length > 0 && (
        <section className={s.section} aria-labelledby="sb-stingers">
          <h2 className={s.sectionTitle} id="sb-stingers">
            Stingers
          </h2>
          <div className={s.grid}>
            {stingers.map((st) => (
              <button
                key={st.id}
                type="button"
                className={`${s.pad} ${s.stinger} ${flashing.has(st.id) ? s.flash : ""}`}
                onClick={() => fire(st)}
              >
                <span className={s.padLabel}>{st.label}</span>
                <span className={s.padHint}>one-shot</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={s.dock}>
        <div className={s.volume}>
          <span className={s.volumeLabel} id="sb-volume">
            Vol
          </span>
          <Slider
            aria-labelledby="sb-volume"
            value={volume}
            min={0}
            max={1}
            step={0.01}
            onChange={(_, v) => changeVolume(Array.isArray(v) ? v[0] : v)}
            sx={{ color: "primary.main", height: 8, "& .MuiSlider-thumb": { width: 28, height: 28 } }}
          />
        </div>
        <button type="button" className={s.stop} onClick={stopAll}>
          Stop all
        </button>
      </div>
    </main>
  );
}
