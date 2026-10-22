import Link from "next/link";
import { useState } from "react";
import { useGame } from "@/lib/useGame";
import type { OneShotWithCast } from "../schema";
import { litCount, recipients, STEPS, type TcView } from "../game";
import { CLOSING_LINE, OPENING_LINE, RULES, SETTING_RULE, type TcSettings } from "../rules";
import { CardFace, Candles, outcome, RollDice, RuleMark, seatName } from "./Bits";
import { CandleSettings, candlesLeft, DraftPrompt, useCandleKeeper, useNow } from "./CandleKeeper";
import { FinalWords } from "./Recorder";
import { SeatList } from "./PlayerTable";
import s from "./Tc.module.css";

const STEP_NOTE: Record<(typeof STEPS)[number], string> = {
  traits: "Everyone writes a Virtue and a Vice on their phone. They're passed to the neighbours automatically. Three candles light when you move on.",
  module: "Read the module's opening aloud (below). It appears on the phones and the TV once you move on.",
  concept: "Each player builds a character from the two traits they were given, then introduces them to the table.",
  moment: "Each player writes their own Moment. Three more candles light when you move on.",
  brink: "Each player writes a Brink for the player on their left; the player on your right writes one for Them. You write one for the player on your left (below). Three more candles light.",
  stack: "Each player orders their Virtue, Vice and Moment; the Brink sits under them. The tenth candle lights when you move on.",
  record: "Each player leaves their last words on their phone. When everyone has, the first scene begins.",
};

type Act = (a: unknown) => Promise<string | null>;

/** The GM's side of a Ten Candles table: seats, rules, candles, every card, the dice and the truths. */
export function GmTable({ os, code }: { os: OneShotWithCast; code: string | null }) {
  const { game, error, busy, act } = useGame<TcView>(code, "gm");
  // This page keeps the candles on the screen: burning down, and drafts.
  useCandleKeeper(game, act);
  const now = useNow();
  if (!code)
    return (
      <section className={s.room} style={{ marginTop: 24 }}>
        <h2>The candles</h2>
        <p className={s.prose}>Open a table above, then players join on their phones at /{os.slug}/play.</p>
        <ModuleNotes os={os} lit={10} />
      </section>
    );
  if (!game)
    return (
      <section className={s.room} style={{ marginTop: 24 }}>
        <p className={s.prose}>Lighting up…</p>
      </section>
    );
  const lit = litCount(game);
  return (
    <section className={s.room} style={{ marginTop: 24 }} aria-labelledby="tc-gm">
      <p className={s.eyebrow}>Ten Candles · table {code}</p>
      <h2 id="tc-gm">
        {game.phase === "lobby"
          ? "Seat the table"
          : game.phase === "creation"
            ? "Making characters"
            : game.phase === "truths"
              ? `Truths before scene ${game.truths?.scene}`
              : game.phase === "scene"
                ? game.lastStand
                  ? "The Last Stand"
                  : `Scene ${game.scene}`
                : "The dark"}
      </h2>
      <p className={s.hint}>
        Every rule here is our own summary from fan references and reviews: we couldn&apos;t check any of it against the book.
        Chips mark where sources disagree or we&apos;re guessing. Where your book differs, the book wins.
      </p>
      <Candles
        lit={game.candles}
        left={candlesLeft(game, now)}
        sputter={game.draft?.index ?? null}
        onToggle={(index, on) => void act({ type: "candle", index, lit: on })}
        label="Candles (tap to match the real ones, or to put one out)"
      />
      <CandleSettings game={game} act={act} />
      <DraftPrompt game={game} act={act} busy={busy} />
      <p className={s.tally} style={{ textAlign: "center" }}>
        {lit} lit · players&apos; pool {game.pools.players} ({game.pools.lost} lost to 1s) · your pool {game.pools.gm}
        <RuleMark id="accidental" />
      </p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      <div className={s.gmGrid}>
        <div className={s.panel}>
          {game.phase === "lobby" && <Lobby game={game} act={act} busy={busy} />}
          {game.phase === "creation" && <Creation game={game} act={act} busy={busy} />}
          {game.phase === "truths" && <Truths game={game} act={act} busy={busy} suggested={os.suggestedTruths} />}
          {game.phase === "scene" && <Scene game={game} act={act} busy={busy} />}
          {game.phase === "ended" && (
            <>
              <p className={s.opening}>{OPENING_LINE}</p>
              <p className={s.prose}>Turn the lights off. Play their last words.</p>
              <FinalWords code={code} as="gm" seats={game.seats} you={null} />
            </>
          )}
          {game.phase !== "lobby" && game.phase !== "ended" && (
            <div className={s.row} style={{ marginTop: 18 }}>
              <button
                type="button"
                className={`${s.btn} ${s.danger}`}
                onClick={() => window.confirm("Darken every candle and end the game?") && void act({ type: "end" })}
              >
                End it in the dark
              </button>
            </div>
          )}
        </div>
        <div className={s.panel}>
          <h3>Round the table</h3>
          <SeatList game={game} />
          <Stacks game={game} />
          {game.phase !== "ended" && game.seats.some((x) => x.recorded) && (
            <>
              <p className={s.eyebrow} style={{ marginTop: 16 }}>
                Last words kept at the table
              </p>
              <FinalWords code={code} as="gm" seats={game.seats} you={null} />
            </>
          )}
        </div>
      </div>

      <div className={s.row} style={{ marginTop: 18 }}>
        <Link className={s.btn} href={`/${os.slug}/tv`}>
          Candles on the TV
        </Link>
        <Link className={s.btn} href={`/${os.slug}/kit${code ? `?game=${code}` : ""}`}>
          Print the table kit
        </Link>
        <Link className={s.btn} href={`/${os.slug}/sounds`}>
          Soundboard
        </Link>
        {game.phase !== "lobby" && (
          <button
            type="button"
            className={s.quiet}
            onClick={() => window.confirm("Start over with the same seats? Every card and roll is lost.") && void act({ type: "reset" })}
          >
            Start over
          </button>
        )}
      </div>

      <ModuleNotes os={os} lit={lit} />
    </section>
  );
}

function Lobby({ game, act, busy }: { game: TcView; act: Act; busy: boolean }) {
  const n = game.seats.length;
  const set = (patch: Partial<TcSettings>) => void act({ type: "settings", patch });
  return (
    <>
      <h3>Seats, clockwise from your left</h3>
      {n === 0 ? (
        <p className={s.prose}>Nobody yet. Players open /play on their phones and sit down.</p>
      ) : (
        <ol className={s.seats}>
          {game.seats.map((x) => (
            <li key={x.index} className={s.seat}>
              <span className={s.seatNo}>{x.index + 1}</span>
              <span style={{ flex: 1 }}>
                {x.name}
                {x.index === 0 && <span className={s.hint}> · your left</span>}
                {x.index === n - 1 && n > 1 && <span className={s.hint}> · your right</span>}
              </span>
              <button type="button" className={s.quiet} disabled={x.index === 0} onClick={() => void act({ type: "move", from: x.index, to: x.index - 1 })} aria-label={`Move ${x.name} up`}>
                ↑
              </button>
              <button type="button" className={s.quiet} disabled={x.index === n - 1} onClick={() => void act({ type: "move", from: x.index, to: x.index + 1 })} aria-label={`Move ${x.name} down`}>
                ↓
              </button>
              <button type="button" className={s.quiet} onClick={() => void act({ type: "unseat", seat: x.index })} aria-label={`Unseat ${x.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className={s.hint}>Match the real seating: cards pass to the left and right, and truths go clockwise.</p>

      <h3 style={{ marginTop: 18 }}>House readings</h3>
      <p className={s.hint}>Where our sources disagree, pick what your book says.</p>
      <Setting label="Virtues go to the player on the" rule={SETTING_RULE.virtueTo}>
        <select className={s.field} value={game.settings.virtueTo} onChange={(e) => set({ virtueTo: e.target.value as "right" | "left" })}>
          <option value="right">right (Vices go left)</option>
          <option value="left">left (Vices go right)</option>
        </select>
      </Setting>
      <Setting label="Truths start with" rule={SETTING_RULE.truthStarter}>
        <select className={s.field} value={game.settings.truthStarter} onChange={(e) => set({ truthStarter: e.target.value as "active" | "gmLeft" })}>
          <option value="active">the player whose roll darkened the candle</option>
          <option value="gmLeft">the player on the GM&apos;s left</option>
        </select>
      </Setting>
      <Setting label="Brinks can be embraced" rule={SETTING_RULE.brinkWhen}>
        <select className={s.field} value={game.settings.brinkWhen} onChange={(e) => set({ brinkWhen: e.target.value as "any" | "failed" })}>
          <option value="any">after any roll</option>
          <option value="failed">only after a failed roll</option>
        </select>
      </Setting>
      <Setting label="Recordings play" rule={SETTING_RULE.playback}>
        <select className={s.field} value={game.settings.playback} onChange={(e) => set({ playback: e.target.value as "end" | "onDeath" })}>
          <option value="end">all at the very end</option>
          <option value="onDeath">each when that character dies</option>
        </select>
      </Setting>
      <Check label="Players' 1s go to the GM's pool" checked={game.settings.onesToGm} onChange={(v) => set({ onesToGm: v })} rule={SETTING_RULE.onesToGm} />
      <Check label="A round of truths before the first scene" checked={game.settings.firstSceneTruths} onChange={(v) => set({ firstSceneTruths: v })} rule={SETTING_RULE.firstSceneTruths} />
      <Check
        label="Keep recordings at the table (small clips, this game only) so I can play them"
        checked={game.settings.keepRecordings}
        onChange={(v) => set({ keepRecordings: v })}
        rule={null}
      />
      <div className={s.row} style={{ marginTop: 16 }}>
        <button type="button" className={`${s.btn} ${s.big}`} disabled={busy || n === 0} onClick={() => void act({ type: "begin" })}>
          Begin: write the traits
        </button>
      </div>
    </>
  );
}

function Setting({ label, rule, children }: { label: string; rule: keyof typeof RULES | null; children: React.ReactNode }) {
  return (
    <label className={s.label}>
      {label}
      {rule && <RuleMark id={rule} />}
      {children}
    </label>
  );
}

function Check({ label, checked, onChange, rule }: { label: string; checked: boolean; onChange: (v: boolean) => void; rule: keyof typeof RULES | null }) {
  return (
    <label className={s.label} style={{ display: "flex", gap: 8, alignItems: "center", letterSpacing: 0, fontSize: 15 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
      {rule && <RuleMark id={rule} />}
    </label>
  );
}

function Creation({ game, act, busy }: { game: TcView; act: Act; busy: boolean }) {
  const step = game.step!;
  const [brink, setBrink] = useState("They have seen you ");
  const gmBrink = game.cards.find((c) => c.kind === "brink" && c.author === "gm");
  const n = game.seats.length;
  return (
    <>
      <p className={s.eyebrow}>
        Step {STEPS.indexOf(step) + 1} of {STEPS.length}
        <RuleMark id="creation" />
      </p>
      <p className={s.prose}>{STEP_NOTE[step]}</p>
      {step === "brink" && n > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: "brink", text: brink });
          }}
        >
          <label className={s.label} htmlFor="gm-brink">
            Your Brink for {seatName(game.seats, 0)}
          </label>
          <textarea id="gm-brink" className={s.field} value={brink} onChange={(e) => setBrink(e.target.value)} maxLength={200} />
          <div className={s.row}>
            <button type="submit" className={s.btn} disabled={busy}>
              {gmBrink ? "Change it" : "Write it"}
            </button>
            {gmBrink && <span className={s.badge}>written</span>}
          </div>
        </form>
      )}
      {game.waiting.length > 0 && step !== "module" && (
        <p className={s.hint}>Waiting on {game.waiting.map((i) => game.seats[i].name).join(", ")}.</p>
      )}
      <div className={s.row}>
        <button type="button" className={`${s.btn} ${s.big}`} disabled={busy} onClick={() => void act({ type: "next" })}>
          {step === "record" ? "Light the way: begin the first scene" : "Next step"}
        </button>
        {game.waiting.length > 0 && step !== "module" && (
          <button type="button" className={s.quiet} onClick={() => void act({ type: "next", force: true })}>
            Move on without them
          </button>
        )}
      </div>
      {step === "traits" && n > 1 && (
        <p className={s.hint}>
          Each Virtue goes to the player on the writer&apos;s {game.settings.virtueTo}:{" "}
          {game.seats.map((x) => `${x.name} → ${seatName(game.seats, recipients(n, game.settings).virtue(x.index))}`).join(", ")}.
        </p>
      )}
    </>
  );
}

function Truths({ game, act, busy, suggested }: { game: TcView; act: Act; busy: boolean; suggested: string[] }) {
  const t = game.truths!;
  const [text, setText] = useState("");
  return (
    <>
      <p className={s.opening}>
        &ldquo;{OPENING_LINE}&rdquo; <RuleMark id="truths" />
      </p>
      <p className={s.hint}>
        Say it aloud, then truths go round: {t.needed} this time, then everyone together, &ldquo;{CLOSING_LINE}&rdquo;.
      </p>
      <ol className={s.truths}>
        {t.entries.map((e, i) => (
          <li key={i}>
            {e.text}
            <span className={s.truthBy}>{seatName(game.seats, e.by)}</span>
          </li>
        ))}
      </ol>
      {t.speaker === null ? (
        <button type="button" className={`${s.btn} ${s.big}`} disabled={busy} onClick={() => void act({ type: "close" })}>
          &hellip;and we are alive
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await act({ type: "truth", text }))) setText("");
          }}
        >
          <label className={s.label} htmlFor="gm-truth">
            {t.speaker === "gm" ? "Your truth" : `${seatName(game.seats, t.speaker)}'s turn (type it for them if they say it aloud)`}
          </label>
          <input id="gm-truth" className={s.field} value={text} maxLength={160} onChange={(e) => setText(e.target.value)} />
          <div className={s.row}>
            <button type="submit" className={s.btn} disabled={busy || !text.trim()}>
              State it
            </button>
          </div>
          {t.speaker === "gm" && suggested.length > 0 && (
            <>
              <p className={s.eyebrow} style={{ marginTop: 12 }}>
                Suggestions from the module
              </p>
              <div className={s.row}>
                {suggested.map((x) => (
                  <button key={x} type="button" className={s.quiet} onClick={() => setText(x)}>
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}
        </form>
      )}
    </>
  );
}

function Scene({ game, act, busy }: { game: TcView; act: Act; busy: boolean }) {
  const names = (i: number) => seatName(game.seats, i);
  const alive = game.seats.filter((x) => x.alive);
  const [who, setWho] = useState<string>("");
  const last = game.log.at(-1);
  return (
    <>
      {game.lastStand && (
        <p className={s.prose}>
          One candle. A failed roll now kills the character who rolled. <RuleMark id="lastStand" />
        </p>
      )}
      {game.roll ? (
        <>
          <RollDice roll={game.roll} names={names} />
          <div className={s.row}>
            <button type="button" className={s.btn} disabled={busy} onClick={() => void act({ type: "accept" })}>
              Settle it for them
            </button>
          </div>
        </>
      ) : (
        <>
          {last?.resolved && last.scene === game.scene && <p className={s.prose}>{outcome(last, names)}</p>}
          <label className={s.label}>
            Roll for a player (if their phone is dead)
            <select className={s.field} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">choose…</option>
              {alive.map((x) => (
                <option key={x.index} value={x.index}>
                  {names(x.index)}
                </option>
              ))}
            </select>
          </label>
          <div className={s.row}>
            <button type="button" className={s.btn} disabled={busy || who === ""} onClick={() => void act({ type: "roll", seat: Number(who) })}>
              Roll {game.pools.players}
            </button>
            {who !== "" && (
              <button
                type="button"
                className={`${s.quiet}`}
                onClick={() => window.confirm(`${names(Number(who))} dies?`) && void act({ type: "die", seat: Number(who) })}
              >
                They die
              </button>
            )}
          </div>
        </>
      )}
      <p className={s.hint}>
        A real candle went out on its own? Tap it above: that ends the scene. <RuleMark id="failure" />
      </p>
    </>
  );
}

/** Everyone's cards, which only the GM sees in full. */
function Stacks({ game }: { game: TcView }) {
  const them = game.cards.find((c) => c.owner === "them");
  if (game.cards.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      {game.seats.map((x) => {
        const mine = game.cards.filter((c) => c.owner === x.index);
        if (!mine.length) return null;
        const order = [...(x.order ?? ["virtue", "vice", "moment"]), "brink"];
        return (
          <details key={x.index} style={{ marginTop: 10 }}>
            <summary className={s.eyebrow} style={{ cursor: "pointer" }}>
              {seatName(game.seats, x.index)} · {x.left} left{x.top ? `, ${x.top} on top` : ""}
              {x.hope ? " · Hope" : ""}
            </summary>
            <div className={s.cards} style={{ marginTop: 8 }}>
              {[...mine]
                .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
                .map((c) => (
                  <CardFace key={c.id} card={c} top={!c.burned && c.kind === x.top} from={`by ${seatName(game.seats, c.author)}`} />
                ))}
            </div>
          </details>
        );
      })}
      {them && (
        <div style={{ marginTop: 12 }}>
          <p className={s.eyebrow}>The Brink written for Them</p>
          <CardFace card={them} from={`by ${seatName(game.seats, them.author)}`} />
        </div>
      )}
    </div>
  );
}

/** The module, for the GM's eyes: what to read aloud, the goal, Them, the places, and pacing by candle. */
function ModuleNotes({ os, lit }: { os: OneShotWithCast; lit: number }) {
  const m = os.module;
  const stage = [...m.stages].reverse().find((x) => lit <= x.candles) ?? m.stages[0];
  return (
    <div className={s.section}>
      <p className={s.eyebrow}>The module · GM only</p>
      <h2>{os.title}</h2>
      <details open={lit >= 10}>
        <summary className={s.eyebrow} style={{ cursor: "pointer" }}>
          Read aloud
        </summary>
        {m.intro.split("\n\n").map((p, i) => (
          <p key={i} className={s.prose}>
            {p}
          </p>
        ))}
      </details>
      <p className={s.prose}>
        <b>Goal.</b> {m.goal}
      </p>
      <p className={s.prose}>
        <b>Them.</b> {m.them}
      </p>
      {m.stages.length > 0 && (
        <>
          <h3>By candlelight</h3>
          <p className={s.hint}>Our pacing aid, not part of the rules: what tends to happen while this many candles burn.</p>
          {m.stages.map((x) => (
            <div key={x.title} className={s.panel} style={{ marginTop: 8, borderColor: x === stage ? "rgba(243,199,112,0.7)" : undefined }}>
              <p className={s.eyebrow}>
                {x.candles} candle{x.candles === 1 ? "" : "s"} and fewer{x === stage ? " · now" : ""}
              </p>
              <h3>{x.title}</h3>
              <p className={s.prose}>{x.text}</p>
              {x.beats.length > 0 && (
                <ul className={s.hint}>
                  {x.beats.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}
      <h3 style={{ marginTop: 16 }}>Areas of note</h3>
      <div className={s.gmGrid} style={{ marginTop: 8 }}>
        {m.areas.map((a) => (
          <div key={a.id} className={s.panel}>
            <h3>{a.name}</h3>
            <p className={s.prose} style={{ fontSize: 16 }}>
              {a.text}
            </p>
            {a.finds.length > 0 && <p className={s.hint}>To find: {a.finds.join("; ")}.</p>}
          </div>
        ))}
      </div>
      {m.lastStand && (
        <p className={s.prose} style={{ marginTop: 16 }}>
          <b>The Last Stand.</b> {m.lastStand}
        </p>
      )}
    </div>
  );
}
