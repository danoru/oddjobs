import { Fragment } from "react";
import type { OneShotWithCast } from "../schema";
import { toPublic } from "@/lib/public";
import { FlyerSheet } from "@/components/flyer/FlyerSheet";
import { CLOSING_LINE, OPENING_LINE, RULES, type RuleId } from "../rules";
import s from "./Kit.module.css";

/** What goes on the paper cards, in our own words. */
const CARDS = [
  { label: "Virtue", prompt: "Something that solves more problems than it causes. Write it, then pass it to your neighbour.", per: "player" },
  { label: "Vice", prompt: "Something that causes more problems than it solves. Write it, then pass it the other way.", per: "player" },
  { label: "Moment", prompt: "I will find hope…", per: "player" },
  { label: "Brink", prompt: "I have seen you…", per: "player" },
  { label: "Who I am", prompt: "Name · Look · Who I was before the dark · What's in my pockets", per: "player" },
] as const;

/** The rules a play aid reminds the table of, in our words. */
const CHEAT: RuleId[] = ["pools", "success", "ones", "narration", "seize", "failure", "truths", "burn", "moment", "hope", "brink", "lastStand"];

function CandleGlyph() {
  return (
    <svg width="22" height="44" viewBox="0 0 22 44" aria-hidden="true">
      <path d="M11 2c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="none" stroke="#1b1209" strokeWidth="1.2" />
      <rect x="5" y="16" width="12" height="26" fill="none" stroke="#1b1209" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * Everything to print for a Ten Candles night. The module is GM-only, so this
 * page is too (served per request after the role check, like the GM page).
 */
export function TableKit({ os }: { os: OneShotWithCast }) {
  const m = os.module;
  const pub = toPublic(os);
  const players = Array.from({ length: os.players.max }, (_, i) => i + 1);
  const cards = [
    ...players.flatMap((p) => CARDS.map((c) => ({ ...c, who: `Player ${p}` }))),
    { label: "Them", prompt: "I have seen Them… (written by the player on the GM's right: a strength, never a weakness)", per: "table", who: "For Them" },
  ];
  const sheets: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += 4) sheets.push(cards.slice(i, i + 4));
  const posterPairs: OneShotWithCast["cast"][] = [];
  for (let i = 0; i < os.cast.length; i += 2) posterPairs.push(os.cast.slice(i, i + 2));

  return (
    <div className={s.kit}>
      {/* The module */}
      <section className={s.page} aria-labelledby="kit-module">
        <p className={s.small}>Ten Candles module · GM only · for tables that own the game</p>
        <h1 id="kit-module">{os.title}</h1>
        <p>{os.pitch}</p>
        <h2>Read aloud</h2>
        {m.intro.split("\n\n").map((p, i) => (
          <p key={i} className={s.readAloud}>
            {p}
          </p>
        ))}
        <h2>The goal</h2>
        <p>{m.goal}</p>
        <h2>Them</h2>
        <p>{m.them}</p>
        <h2>Areas of note</h2>
        <div className={s.cols}>
          {m.areas.map((a) => (
            <div key={a.id}>
              <h3>{a.name}</h3>
              <p>{a.text}</p>
              {a.finds.length > 0 && <p className={s.small}>To find: {a.finds.join("; ")}.</p>}
            </div>
          ))}
        </div>
      </section>
      <section className={s.page} aria-label="Pacing and truths">
        {m.stages.length > 0 && (
          <>
            <h2>By candlelight (our pacing aid)</h2>
            {m.stages.map((x) => (
              <div key={x.title}>
                <h3>
                  {x.candles} candle{x.candles === 1 ? "" : "s"}: {x.title}
                </h3>
                <p>{x.text}</p>
                {x.beats.length > 0 && <p className={s.small}>{x.beats.join(" · ")}</p>}
              </div>
            ))}
          </>
        )}
        {m.lastStand && (
          <>
            <h2>The Last Stand</h2>
            <p>{m.lastStand}</p>
          </>
        )}
        {os.suggestedTruths.length > 0 && (
          <>
            <h2>Truths to offer</h2>
            <p>{os.suggestedTruths.join(" · ")}</p>
          </>
        )}
        {os.gmNotes && (
          <>
            <h2>GM notes</h2>
            {os.gmNotes.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </>
        )}
        {os.content.warnings.length > 0 && <p className={s.small}>Content: {os.content.warnings.join(", ")}.</p>}
      </section>

      {/* The tracker */}
      <section className={s.page} aria-labelledby="kit-tracker">
        <h1 id="kit-tracker">Candles &amp; scenes</h1>
        <p className={s.small}>
          Cross out a candle as it goes dark. Players roll one die per lit candle; the GM one per dark candle. Every 1 is out
          for the rest of the scene.
        </p>
        <div className={s.candleRow}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={s.paperCandle}>
              <CandleGlyph />
              {i + 1}
            </div>
          ))}
        </div>
        <table className={s.log}>
          <thead>
            <tr>
              <th style={{ width: "0.6in" }}>Scene</th>
              <th style={{ width: "0.7in" }}>Lit</th>
              <th>Truths (&ldquo;{OPENING_LINE}&rdquo; … &ldquo;{CLOSING_LINE}&rdquo;)</th>
              <th style={{ width: "1.6in" }}>How the candle went out</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{10 - i}</td>
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <h2>The rules, as this aid runs them</h2>
        <div className={s.cols}>
          {CHEAT.map((id) => (
            <p key={id} className={s.small}>
              {RULES[id].text}
              {RULES[id].confidence !== "corroborated" ? " (unconfirmed: check your book)" : ""}
            </p>
          ))}
        </div>
        <p className={s.small}>
          Written from fan references and reviews, not the book: nothing here is quoted from Ten Candles. If your copy says
          otherwise, the book wins.
        </p>
      </section>

      {/* Index cards */}
      {sheets.map((sheet, i) => (
        <section key={i} className={s.cardSheet} aria-label={`Index cards, sheet ${i + 1}`}>
          {sheet.map((c, j) => (
            <div key={j} className={s.indexCard}>
              <p className={s.cardLabel}>{c.label}</p>
              <p className={s.cardPrompt}>{c.prompt}</p>
              <div className={s.cardFoot}>
                <span>{c.who}</span>
                <span>{os.title}</span>
              </div>
            </div>
          ))}
        </section>
      ))}

      {/* Posters */}
      {posterPairs.map((pair, i) => (
        <section key={i} className={s.posterSheet} aria-label={`Missing posters, sheet ${i + 1}`}>
          {pair.map((c) => (
            <Fragment key={c.id}>
              <div className={s.missing}>
                <div className={s.missingHeader}>{c.poster.header}</div>
                <div className={s.missingName}>{c.poster.alias ?? c.name}</div>
                <div className={s.missingEpithet}>{c.poster.epithet}</div>
                <p className={s.missingText}>{c.story.look}</p>
                <p className={s.missingText}>
                  <i>{c.poster.hook}</i>
                </p>
                <p className={s.small}>If found, bring them to the light.</p>
              </div>
            </Fragment>
          ))}
        </section>
      ))}

      {pub.cast.length > 0 && (
        <div className={s.flyerWrap}>
          <FlyerSheet os={pub} level={0} base={pub} />
        </div>
      )}
    </div>
  );
}
