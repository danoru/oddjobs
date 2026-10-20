import { paginate, type Card } from "@/systems/dnd5e/cards";
import s from "./Cards.module.css";

const PER_PAGE = { normal: 9, large: 4 } as const;
const GRID = { normal: 3, large: 2 } as const;

/** Little woodcut marks for each kind of card. */
function KindMark({ kind }: { kind: Card["kind"] }) {
  const d =
    kind === "spell"
      ? "M12 2l2.4 6.6L21 9l-5.2 4.2L17.6 20 12 16.4 6.4 20l1.8-6.8L3 9l6.6-.4z"
      : kind === "item"
        ? "M19.5 2.5 21.5 4.5 11 15l-2-2zM6.5 13.5l4 4-1.5 1.5-1.2-1.2L5 20.6 3.4 19l2.8-2.8L5 15z"
        : "M12 2 20 5v6c0 5.5-3.4 9.6-8 11-4.6-1.4-8-5.5-8-11V5z";
  return (
    <svg viewBox="0 0 24 24" className={s.mark} aria-hidden="true" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

function CardFace({ card }: { card: Card }) {
  return (
    <article className={s.card} data-kind={card.kind} data-fit={card.fit} style={card.accent ? { ["--accent" as string]: card.accent } : undefined}>
      <header className={s.head}>
        <KindMark kind={card.kind} />
        <h3 className={s.title}>{card.title}</h3>
      </header>
      <div className={s.kicker}>{card.kicker}</div>
      {card.stats.length > 0 && (
        <dl className={s.stats}>
          {card.stats.map((st) => (
            <div key={st.label} className={s.stat}>
              <dt>{st.label}</dt>
              <dd>{st.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={s.text}>{card.text}</p>
      {card.more && <p className={s.more}>{card.more}</p>}
      {card.boxes && (
        <div className={s.boxes}>
          <span role="img" aria-label={`${card.boxes.n} boxes to tick`} className={s.boxRow}>
            {Array.from({ length: card.boxes.n }, (_, i) => (
              <span key={i} className={s.box} />
            ))}
          </span>
          <span>{card.boxes.label}</span>
        </div>
      )}
      <footer className={s.owner}>{card.owner}</footer>
    </article>
  );
}

/** Crop marks at every cut line, in the margin around the grid. */
function CropMarks({ cols, rows }: { cols: number; rows: number }) {
  const marks = [];
  for (let i = 0; i <= cols; i++)
    for (const edge of ["top", "bottom"] as const)
      marks.push(<span key={`x${i}${edge}`} className={s.markV} style={{ left: `calc(var(--crop) + ${i} * var(--cw))`, [edge]: 0 }} />);
  for (let j = 0; j <= rows; j++)
    for (const edge of ["left", "right"] as const)
      marks.push(<span key={`y${j}${edge}`} className={s.markH} style={{ top: `calc(var(--crop) + ${j} * var(--ch))`, [edge]: 0 }} />);
  return <>{marks}</>;
}

/**
 * Cards for one character, a page at a time. Every character starts on a new
 * page so their stack can be cut and handed over on its own.
 */
export function CardSheets({ cards, large, label }: { cards: Card[]; large: boolean; label: string }) {
  const size = large ? "large" : "normal";
  const pages = paginate(cards, PER_PAGE[size]);
  const cols = GRID[size];
  return (
    <section className={s.group}>
      <h2 className={s.srOnly}>{label}</h2>
      {pages.map((page, i) => (
        <div key={i} className={s.page} data-size={size}>
          <CropMarks cols={cols} rows={Math.ceil(page.length / cols)} />
          <div className={s.grid}>
            {page.map((card) => (
              <CardFace key={card.key} card={card} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export const cardStyles = s;
