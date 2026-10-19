import { useState } from "react";
import { RULES, type RuleId } from "../rules";
import type { CardKind, CardView, Roll, SeatView } from "../game";
import s from "./Tc.module.css";

/** Each candle burns at its own pace, so the row never flickers in step. */
const FLICKER = [1.7, 2.3, 1.9, 2.6, 2.1, 1.8, 2.4, 2.0, 2.7, 1.6];

/**
 * Ten candles in a row. With `onToggle`, each is a button the GM uses to match
 * the real candles on the table (or to stand in for them).
 */
export function Candles({
  lit,
  onToggle,
  className,
  label = "Candles",
}: {
  lit: boolean[];
  onToggle?: (index: number, lit: boolean) => void;
  className?: string;
  label?: string;
}) {
  const count = lit.filter(Boolean).length;
  return (
    <div className={`${s.candles} ${className ?? ""}`} role="group" aria-label={`${label}: ${count} of ${lit.length} lit`}>
      {lit.map((on, i) => {
        const style = { ["--flicker" as string]: `${FLICKER[i % FLICKER.length]}s`, ["--delay" as string]: `${-i * 0.37}s` };
        const body = (
          <>
            {on && <span className={s.glow} aria-hidden="true" />}
            <span className={s.wax} aria-hidden="true" />
            <span className={s.wick} aria-hidden="true" />
            {on ? <span className={s.flame} aria-hidden="true" /> : <span className={s.smoke} aria-hidden="true" key={`smoke-${i}`} />}
          </>
        );
        return onToggle ? (
          <button
            key={i}
            type="button"
            className={`${s.candle} ${on ? "" : s.dark}`}
            style={style}
            aria-pressed={on}
            aria-label={`Candle ${i + 1}, ${on ? "lit" : "dark"}`}
            onClick={() => onToggle(i, !on)}
          >
            {body}
          </button>
        ) : (
          <span key={i} className={`${s.candle} ${on ? "" : s.dark}`} style={style} aria-hidden="true">
            {body}
          </span>
        );
      })}
    </div>
  );
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ value, kind = "player", hopeWins }: { value: number; kind?: "player" | "hope" | "gm"; hopeWins?: boolean }) {
  const win = kind === "hope" ? hopeWins || value === 6 : value === 6;
  const cls = [s.die, kind === "hope" ? s.hopeDie : kind === "gm" ? s.gmDie : "", win ? s.six : "", value === 1 && kind === "player" ? s.one : ""].join(" ");
  return (
    <span className={cls} role="img" aria-label={`${kind === "hope" ? "Hope die" : kind === "gm" ? "GM die" : "die"}: ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} data-off={PIPS[value]?.includes(i) ? undefined : ""} />
      ))}
    </span>
  );
}

/** A roll's dice: the players' pool, the Hope die, and the GM's dice. */
export function RollDice({ roll, names, className }: { roll: Roll; names: (seat: number) => string; className?: string }) {
  const sixes = roll.dice.filter((d) => d === 6).length;
  const ones = roll.dice.filter((d) => d === 1).length;
  const gmSixes = roll.gmDice.filter((d) => d === 6).length;
  return (
    <div className={className}>
      <p className={s.tally}>
        {names(roll.seat)} rolled {roll.dice.length} {roll.dice.length === 1 ? "die" : "dice"}
        {roll.moment ? ", living their Moment" : ""}
        {roll.used.length ? ` (${roll.used.map((u) => (u === "burn" ? "burned a trait" : "embraced their Brink")).join(", ")})` : ""}
      </p>
      <div className={s.dice}>
        {roll.dice.map((d, i) => (
          <Die key={i} value={d} />
        ))}
        {roll.hope !== null && <Die value={roll.hope} kind="hope" hopeWins={roll.hope >= 5} />}
      </div>
      <p className={s.tally}>
        {sixes} six{sixes === 1 ? "" : "es"}
        {roll.hope !== null ? `, Hope die ${roll.hope}` : ""} · {ones} lost to 1s
      </p>
      {roll.gmDice.length > 0 && (
        <>
          <div className={s.dice} aria-label="The GM's dice">
            {roll.gmDice.map((d, i) => (
              <Die key={i} value={d} kind="gm" />
            ))}
          </div>
          <p className={s.tally}>
            GM: {gmSixes} six{gmSixes === 1 ? "" : "es"}
          </p>
        </>
      )}
    </div>
  );
}

/** A sentence for a settled roll. */
export function outcome(roll: Roll, names: (seat: number) => string): string {
  const r = roll.resolved;
  if (!r) return "";
  const who = names(roll.seat);
  if (r.died) return `${who} failed, and died.`;
  if (!r.success) return `${who} failed. A candle goes dark; the scene ends.`;
  if (r.seized) return `${who} succeeded and darkened a candle to tell it themselves.`;
  return r.narrator === "player" ? `${who} succeeded, and tells how.` : `${who} succeeded, but the GM tells how.`;
}

const KIND_LABEL: Record<CardKind, string> = { virtue: "Virtue", vice: "Vice", moment: "Moment", brink: "Brink" };

export function CardFace({
  card,
  top = false,
  from,
  tilt = 0,
  faceDown = false,
}: {
  card: Pick<CardView, "kind" | "text" | "burned">;
  top?: boolean;
  from?: string;
  tilt?: number;
  faceDown?: boolean;
}) {
  const cls = [s.card, top ? s.cardTop : "", card.burned ? s.cardBurned : "", faceDown ? s.cardDown : ""].join(" ");
  return (
    <div className={cls} style={{ ["--tilt" as string]: `${tilt}deg` }}>
      <span className={s.cardKind}>
        {KIND_LABEL[card.kind]}
        {card.burned ? " · burned" : top ? " · on top" : ""}
      </span>
      {from && <span className={s.cardFrom}>{from}</span>}
      <p className={s.cardText}>{faceDown ? "Face down at the bottom of your stack." : card.text}</p>
    </div>
  );
}

/** A small "unconfirmed" chip next to a rule this aid couldn't check against the book. */
export function RuleMark({ id }: { id: RuleId }) {
  const [open, setOpen] = useState(false);
  const rule = RULES[id];
  if (rule.confidence === "corroborated" && !("dispute" in rule)) return null;
  const label = rule.confidence === "corroborated" ? "detail unconfirmed" : rule.confidence === "disputed" ? "sources disagree" : "unconfirmed";
  return (
    <>
      <button type="button" className={s.mark} aria-expanded={open} onClick={() => setOpen(!open)}>
        ? {label}
      </button>
      {open && (
        <span className={s.markText} role="note">
          {rule.text} {"dispute" in rule ? rule.dispute : ""} We couldn&apos;t check this against the book; if you own it, follow the book.
        </span>
      )}
    </>
  );
}

/** Seat names, with the character's name once they have one. */
export function seatName(seats: SeatView[], i: number | "gm" | "them"): string {
  if (i === "gm") return "the GM";
  if (i === "them") return "Them";
  const seat = seats[i];
  if (!seat) return `seat ${i + 1}`;
  return seat.concept ? `${seat.concept.name} (${seat.name})` : seat.name;
}
