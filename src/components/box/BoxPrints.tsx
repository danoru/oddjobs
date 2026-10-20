import type { OneShotWithCast } from "@/lib/schema";
import { ACTS_PER_PAGE, RUMORS_PER_PAGE, roman } from "@/lib/box";
import { PosterIcon } from "@/components/PosterIcon";
import b from "./Box.module.css";

/**
 * The printables only the box has: sealed letters as fold-and-seal
 * envelopes, act cards to hold up between scenes, rumor slips to draw from a
 * hat, and a blank gazette to fill in by hand the morning after. GM-only: the
 * letters carry their text and the slips come from GM-only content (never
 * the truth, though).
 */

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * One letter to a page, in three panels: a cover flap, the letter, and the
 * address (printed upside down). Fold the address panel back behind the
 * letter, fold the flap down over the letter, and seal: the address ends up
 * on the outside, the right way up, and the text inside.
 */
export function LetterEnvelopes({ os }: { os: OneShotWithCast }) {
  const nameOf = (id: string) => os.cast.find((c) => c.id === id)?.name ?? id;
  const actOf = (id?: string) => {
    const i = os.acts.findIndex((a) => a.id === id);
    return i >= 0 ? `Act ${roman(i)}: ${os.acts[i].title}` : null;
  };
  return (
    <>
      {os.letters.map((l) => {
        const when = actOf(l.act) ?? l.when.split(":")[0];
        return (
          <section key={l.id} className={b.page} aria-label={`Sealed letter for ${nameOf(l.to)}`} data-box="letter">
            <div className={b.panel}>
              <p className={b.small}>Flap · {l.title}</p>
              <p className={b.howTo}>
                1. Fold the bottom panel <b>back</b>, behind the letter.
                <br />
                2. Fold this flap <b>down</b> over the letter.
                <br />
                3. Seal where its edge meets the fold: wax, a sticker, or a dab of glue.
              </p>
              <p className={b.small}>For the GM: {l.when}</p>
            </div>
            <div className={b.fold} aria-hidden="true">
              fold down
            </div>
            <div className={`${b.panel} ${b.letterText}`}>{l.text}</div>
            <div className={b.fold} aria-hidden="true">
              fold back
            </div>
            <div className={`${b.panel} ${b.address}`}>
              <div className={b.addressInner}>
                <span className={b.waxSeal} aria-hidden="true">
                  ✠
                </span>
                <div>
                  <div className={b.to}>To {nameOf(l.to)}</div>
                  <div className={b.when}>Not to be opened until {when}</div>
                  <div className={b.small}>{os.title}</div>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Act cards, two to a page, to hold up between scenes. */
export function ActCards({ os }: { os: OneShotWithCast }) {
  return (
    <>
      {chunk(os.acts, ACTS_PER_PAGE).map((pair, p) => (
        <section key={p} className={b.page} data-box="acts">
          {pair.map((a, i) => (
            <div key={a.id} className={b.actCard}>
              <div className={b.actNo}>ACT {roman(p * ACTS_PER_PAGE + i)}</div>
              <div className={b.actTitle}>{a.title}</div>
              {a.subtitle && <div className={b.actSub}>{a.subtitle}</div>}
              <div className={b.actRule} aria-hidden="true">
                ❦
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

/** Rumor slips, ten to a page with cut lines. Each player draws two from a hat. No truths. */
export function RumorSlips({ os }: { os: OneShotWithCast }) {
  const where = os.gazette?.town ? `OVERHEARD IN ${os.gazette.town.toUpperCase()}` : "OVERHEARD AT THE BAR";
  return (
    <>
      {chunk(os.rumors, RUMORS_PER_PAGE).map((page, p) => (
        <section key={p} className={b.page} data-box="rumors">
          <p className={b.small} style={{ textAlign: "center", margin: "0 0 0.1in" }}>
            Cut along the dashed lines, fold each slip and draw two per player from a hat. Some are true.
          </p>
          <div className={b.slips}>
            {page.map((r) => (
              <div key={r.id} className={b.slip}>
                <div className={b.slipHead}>{where}</div>
                <div className={b.slipText}>&ldquo;{r.text}&rdquo;</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** A blank front page to fill in by hand the morning after. */
export function BlankGazette({ os }: { os: OneShotWithCast }) {
  const g = os.gazette ?? { name: `The ${os.title.replace(/^the\s+/i, "")} Gazette`, town: os.setting.split(/[(;,.]/)[0].trim(), price: "One penny" };
  return (
    <section className={b.page} data-box="gazette">
      <div className={b.gazette}>
        <div className={b.ears}>
          <span>{g.town.toUpperCase()}</span>
          <span>{g.price.toUpperCase()}</span>
        </div>
        <div className={b.masthead}>{g.name}</div>
        <div className={b.dateline}>
          <span>Date: ____________________</span>
          <span>Morning edition</span>
        </div>
        <div className={b.headlineLine}>HEADLINE</div>
        <div className={b.woodcut} aria-hidden="true">
          {os.cast.map((c) => (
            <PosterIcon key={c.id} icon={c.poster.icon} size={30} />
          ))}
        </div>
        <div className={b.ruled} style={{ height: "1.6in" }}>
          <span className={b.small}>What happened</span>
        </div>
        <div className={b.cols}>
          {os.cast.map((c) => (
            <div key={c.id} className={b.entry}>
              <div className={b.entryHead}>
                {c.name.toUpperCase()}, {c.poster.epithet.toUpperCase()}
              </div>
              <div className={b.small}>Survived · Fell · Vanished · Changed forever (circle one)</div>
              <div className={b.ruled} style={{ height: "0.75in" }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
