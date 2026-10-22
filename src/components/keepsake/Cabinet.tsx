import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { FATE_LABEL } from "@/lib/legacy";
import { ROLE_LABEL } from "@/lib/history";
import type { CabinetItem, CabinetRun } from "@/lib/keepsakes";
import { nightOf } from "@/components/profile/WantedPoster";
import { KeepsakeArt, damageOf } from "./KeepsakeArt";
import b from "@/components/board/Board.module.css";
import s from "./Keepsake.module.css";

/**
 * The cabinet on a WANTED poster (phase 13): one small object per job and
 * role, on inked shelves. Hovering, focusing or tapping an object shows its
 * card: the keepsake, the job, the night and the role, and for a player who
 * they were and how it ended. Nothing pops up on its own and nothing counts
 * beyond the "×2" of a job run twice.
 */
export function Cabinet({ items, own }: { items: CabinetItem[]; own: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  // Escape puts away whatever card is showing (opened, hovered or focused) until the next move.
  const [quiet, setQuiet] = useState(false);
  const shelf = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      setQuiet(true);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  // A tap elsewhere puts the opened card away.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!shelf.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <section className={`${b.note} ${s.cabinet}`} style={{ ["--tilt" as string]: "-0.4deg" }} aria-labelledby="cabinet-title">
      <span className={b.pin} aria-hidden="true" />
      <h2 id="cabinet-title" className={b.noteTitle}>
        {own ? "Your cabinet" : "The cabinet"}
      </h2>
      <p className={s.under}>What came home from each job.</p>
      {items.length === 0 ? (
        <p className={s.empty}>{own ? "Nothing on the shelves yet. Finish a job and something comes home with you." : "Nothing on the shelves yet."}</p>
      ) : (
        <ul className={s.shelf} ref={shelf} data-quiet={quiet || undefined} onFocus={(e) => {
            // Moving to another object puts away the one that was opened.
            const id = (e.target as HTMLElement).dataset.keepsake;
            setQuiet(false);
            setOpen((o) => (o === id ? o : null));
          }} onPointerMove={() => quiet && setQuiet(false)}>
          {items.map((it) => (
            <Keepsake
              key={it.id}
              item={it}
              open={open === it.id}
              onToggle={() => {
                setQuiet(false);
                setOpen((o) => (o === it.id ? null : it.id));
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function runLine(r: CabinetRun): string {
  const role = r.role === "player" ? "player" : ROLE_LABEL[r.role];
  if (!r.character) return `${nightOf(r.date)} · ${role}`;
  return `${nightOf(r.date)} · ${role}, as ${r.character.name}${r.character.fate ? ` · ${FATE_LABEL[r.character.fate].toLowerCase()}` : ""}`;
}

const TIMES = ["", "", "twice", "three times"];

/** One object on the shelf, and its card. */
function Keepsake({ item, open, onToggle }: { item: CabinetItem; open: boolean; onToggle: () => void }) {
  const card = useId();
  const [shift, setShift] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const k = item.keepsake;
  const fallen = item.fallen ? (damageOf(k.art) === "scorched" ? "scorched" : "cracked") : null;

  // Keep the card on the screen: nudge it sideways at the edges of a phone.
  function place() {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    // The page's width, not the window's: on a phone the window grows with anything that overflows.
    const vw = document.documentElement.clientWidth;
    const half = (Math.min(280, vw - 32) + 4) / 2;
    const cx = r.left + r.width / 2;
    setShift(Math.round(Math.max(10 + half - cx, Math.min(0, vw - 10 - half - cx))));
  }

  return (
    <li className={s.slot} data-open={open || undefined} onMouseEnter={place} style={{ ["--shift" as string]: `${shift}px` } as CSSProperties}>
      <button
        ref={button}
        type="button"
        className={s.object}
        data-keepsake={item.id}
        aria-expanded={open}
        aria-describedby={card}
        aria-label={`${k.name}${fallen ? `, ${fallen}` : ""}${item.count > 1 ? `, ×${item.count}` : ""}`}
        onFocus={place}
        onClick={() => {
          place();
          onToggle();
        }}
      >
        <KeepsakeArt art={k.art} fallen={item.fallen} size={56} />
        {item.count > 1 && (
          <span className={s.count} aria-hidden="true">
            ×{item.count}
          </span>
        )}
      </button>
      <div id={card} role="tooltip" className={s.card}>
        <b className={s.cardName}>{k.name}</b>
        <i className={s.cardNote}>{k.note}</i>
        <span className={s.cardJob}>{item.title}</span>
        <ul className={s.runs}>
          {item.runs.map((r) => (
            <li key={`${r.code}:${r.role}:${r.character?.name ?? ""}`}>{runLine(r)}</li>
          ))}
        </ul>
        {item.count > 1 && <span className={s.cardMeta}>Taken home {TIMES[item.count] ?? `${item.count} times`}</span>}
        {fallen && <span className={s.cardMeta}>{fallen === "scorched" ? "Scorched" : "Cracked"}: they didn&rsquo;t make it home.</span>}
      </div>
    </li>
  );
}
