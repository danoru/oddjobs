import type { LevelChoice } from "@/lib/variants";
import s from "./Board.module.css";

/**
 * Wax-stamp radio buttons for the level a one-shot is played at. Arrow keys
 * move between levels, as in any radio group.
 */
export function LevelPicker({
  levels,
  level,
  onChange,
}: {
  levels: LevelChoice[];
  level: number;
  onChange: (level: number) => void;
}) {
  if (levels.length < 2) return null;
  const current = levels.find((l) => l.level === level);

  function onKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = levels[(i + step + levels.length) % levels.length];
    onChange(next.level);
    const group = (e.currentTarget as HTMLElement).parentElement;
    window.requestAnimationFrame(() =>
      group?.querySelector<HTMLButtonElement>(`[data-level="${next.level}"]`)?.focus(),
    );
  }

  return (
    <div className={`${s.levelPicker} no-print`} data-part="levels">
      <span className={s.levelLabel} id="level-picker-label">
        Play at level
      </span>
      <div role="radiogroup" aria-labelledby="level-picker-label" className={s.levelStamps}>
        {levels.map((l, i) => {
          const on = l.level === level;
          return (
            <button
              key={l.level}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-level={l.level}
              className={on ? s.levelStampOn : s.levelStamp}
              onClick={() => onChange(l.level)}
              onKeyDown={(e) => onKey(e, i)}
              title={l.base ? "As written" : l.note}
            >
              {l.level}
            </button>
          );
        })}
      </div>
      <span className={s.levelNote} aria-live="polite">
        {current?.base ? "as written" : (current?.note ?? "")}
      </span>
    </div>
  );
}
