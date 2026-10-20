import { useEffect, useState } from "react";
import { useGame } from "@/lib/useGame";
import { useShake } from "@/lib/shake";
import type { PublicTcOneShot } from "@/lib/public";
import { playRip } from "@/lib/rip";
import { recipients, score, type CardView, type TcView, type TraitKind } from "../game";
import { CLOSING_LINE, OPENING_LINE } from "../rules";
import { SYSTEMS } from "@/systems/registry";
import { CardFace, Candles, outcome, RollDice, RuleMark, seatName } from "./Bits";
import { Recorder, FinalWords } from "./Recorder";
import s from "./Tc.module.css";

type Extras = { intro: string | null };

const STEP_TITLE: Record<NonNullable<TcView["step"]>, string> = {
  traits: "Write a Virtue and a Vice",
  module: "Listen",
  concept: "Who are you?",
  moment: "Your Moment",
  brink: "A Brink",
  stack: "Stack your cards",
  record: "Your last words",
};

/**
 * One player's phone at a Ten Candles table: take a seat, make a character
 * with the people either side of you, then play by candlelight. The server
 * only ever sends this phone what its player may see.
 */
export function PlayerTable({
  os,
  code,
  player,
  claimedId,
}: {
  os: PublicTcOneShot;
  code: string;
  player: { id: string; name: string };
  /** A pre-made poster this player tore down, if any. */
  claimedId: string | null;
}) {
  const { game, extras, error, busy, act } = useGame<TcView, Extras>(code, "player", player.id);
  const premade = os.cast.find((c) => c.id === claimedId) ?? null;

  // Keep the seat's name and pre-made up to date while we're still in the lobby.
  const seat = game?.you ?? null;
  const seatChar = seat !== null ? game?.seats[seat]?.characterId : undefined;
  useEffect(() => {
    if (game?.phase === "lobby" && seat !== null && seatChar !== (claimedId ?? null))
      void act({ type: "sit", name: player.name, characterId: claimedId });
  }, [game?.phase, seat, seatChar, claimedId, player.name, act]);

  if (!game) return <p className={s.prose}>Finding the table…</p>;
  const names = (i: number) => seatName(game.seats, i);

  return (
    <div className={s.phone}>
      <Candles lit={game.candles} />
      <p className={s.tally} style={{ textAlign: "center" }}>
        {game.phase === "scene" || game.phase === "truths"
          ? `${game.lastStand ? "The Last Stand" : `Scene ${game.scene}`} · ${game.pools.players} ${game.pools.players === 1 ? "die" : "dice"} in the pool · the GM has ${game.pools.gm}`
          : game.phase === "ended"
            ? "The last candle is out"
            : `${game.candles.filter(Boolean).length} of 10 candles lit`}
      </p>

      {seat === null ? (
        <Unseated game={game} name={player.name} onSit={() => act({ type: "sit", name: player.name, characterId: claimedId })} busy={busy} />
      ) : (
        <>
          {game.phase === "lobby" && <Lobby game={game} seat={seat} premade={premade?.name ?? null} onStand={() => act({ type: "stand" })} />}
          {game.phase === "creation" && (
            <Creation game={game} seat={seat} extras={extras} act={act} busy={busy} premade={premade} code={code} playerId={player.id} />
          )}
          {game.phase === "truths" && <Truths game={game} seat={seat} act={act} busy={busy} names={names} />}
          {game.phase === "scene" && <Scene game={game} seat={seat} act={act} busy={busy} names={names} />}
          {game.phase === "ended" && (
            <div className={s.section}>
              <h2>The dark</h2>
              <p className={s.opening}>{OPENING_LINE}</p>
              <p className={s.prose}>Now the last words.</p>
              <FinalWords code={code} playerId={player.id} as="player" seats={game.seats} you={seat} />
            </div>
          )}
          {game.phase !== "lobby" && game.phase !== "creation" && <MyStack game={game} seat={seat} />}
        </>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <p className={s.hint} style={{ marginTop: 24 }}>
        A play aid for {SYSTEMS.tencandles.label} by {SYSTEMS.tencandles.publisher}; you need the game. Every rule here is our
        own summary from fan references and reviews, not the book. Where your book differs, the book wins.
      </p>
    </div>
  );
}

function Unseated({ game, name, onSit, busy }: { game: TcView; name: string; onSit: () => void; busy: boolean }) {
  if (game.phase !== "lobby")
    return (
      <div className={s.section}>
        <p className={s.prose}>The circle has closed for tonight. You can watch from here.</p>
      </div>
    );
  return (
    <div className={s.section}>
      <h2>Take a seat</h2>
      <p className={s.prose}>
        Sit down as {name}. The GM puts everyone in order round the table, because the cards you write go to the people
        either side of you.
      </p>
      <button type="button" className={`${s.btn} ${s.big}`} onClick={onSit} disabled={busy}>
        Sit at the table
      </button>
    </div>
  );
}

function Lobby({ game, seat, premade, onStand }: { game: TcView; seat: number; premade: string | null; onStand: () => void }) {
  const n = game.seats.length;
  return (
    <div className={s.section}>
      <p className={s.eyebrow}>Seat {seat + 1} of {n}</p>
      <h2>Round the table</h2>
      <SeatList game={game} you={seat} />
      <p className={s.hint}>
        Clockwise from the GM&apos;s left. Tell the GM if this isn&apos;t how you&apos;re actually sitting.
        {premade ? ` You've taken ${premade}; you'll still write your own traits.` : ""}
      </p>
      <p className={s.prose}>Waiting for the GM to light the first candles.</p>
      <button type="button" className={s.quiet} onClick={onStand}>
        Leave the table
      </button>
    </div>
  );
}

export function SeatList({ game, you }: { game: TcView; you?: number | null }) {
  return (
    <ol className={s.seats}>
      {game.seats.map((x) => (
        <li key={x.index} className={`${s.seat} ${x.alive ? "" : s.seatDead}`}>
          <span className={s.seatNo}>{x.index + 1}</span>
          <span style={{ flex: 1 }}>
            {x.concept ? (
              <>
                <b>{x.concept.name}</b> · {x.name}
              </>
            ) : (
              x.name
            )}
            {x.index === you && " (you)"}
          </span>
          {x.hope && <span className={s.badge}>Hope</span>}
          {!x.alive && <span className={s.badge}>gone</span>}
        </li>
      ))}
    </ol>
  );
}

type Act = (a: unknown) => Promise<string | null>;

function Creation({
  game,
  seat,
  extras,
  act,
  busy,
  premade,
  code,
  playerId,
}: {
  game: TcView;
  seat: number;
  extras: Partial<Extras>;
  act: Act;
  busy: boolean;
  premade: PublicTcOneShot["cast"][number] | null;
  code: string;
  playerId: string;
}) {
  const step = game.step!;
  const n = game.seats.length;
  const to = recipients(n, game.settings);
  const done = game.seats[seat].done.includes(step);
  const mine = game.cards.filter((c) => c.owner === seat);
  const wrote = (kind: CardView["kind"]) => game.cards.find((c) => c.author === seat && c.kind === kind);
  const waiting = game.waiting.filter((i) => i !== seat).map((i) => game.seats[i].name);

  return (
    <div className={s.section}>
      <p className={s.eyebrow}>Making characters · {STEP_TITLE[step]}</p>
      {step === "traits" && (
        <TraitsForm
          key={`traits-${done}`}
          virtueFor={seatName(game.seats, to.virtue(seat))}
          viceFor={seatName(game.seats, to.vice(seat))}
          initial={{ virtue: wrote("virtue")?.text ?? "", vice: wrote("vice")?.text ?? "" }}
          busy={busy}
          onSubmit={(virtue, vice) => act({ type: "traits", virtue, vice })}
        />
      )}
      {step === "module" && (
        <>
          <h2>The GM sets the scene</h2>
          {extras.intro ? (
            extras.intro.split("\n\n").map((p, i) => (
              <p key={i} className={s.prose}>
                {p}
              </p>
            ))
          ) : (
            <p className={s.prose}>Listen. The GM is reading what happened to the world.</p>
          )}
        </>
      )}
      {step === "concept" && (
        <>
          <p className={s.prose}>These are the traits your neighbours gave you. Build someone around them.</p>
          <div className={s.cards}>
            {mine.map((c) => (
              <CardFace key={c.id} card={c} from={`from ${seatName(game.seats, c.author as number)}`} tilt={c.kind === "vice" ? 1.2 : -1} />
            ))}
          </div>
          <ConceptForm key={`concept-${done}`} game={game} seat={seat} premade={premade} busy={busy} act={act} />
        </>
      )}
      {step === "moment" && (
        <OneLine
          key={`moment-${done}`}
          title="Your Moment"
          intro="Something your character would find hope in: it could happen tonight, and it could fail. Only you know it until you live it."
          prefix="I will find hope "
          initial={wrote("moment")?.text ?? ""}
          busy={busy}
          onSubmit={(text) => act({ type: "moment", text })}
          rule="moments"
        />
      )}
      {step === "brink" && (
        <OneLine
          key={`brink-${done}`}
          title={to.brink(seat) === "them" ? "A Brink for Them" : `A Brink for ${seatName(game.seats, to.brink(seat) as number)}`}
          intro={
            to.brink(seat) === "them"
              ? "You sit on the GM's right, so you write about Them: something you've seen Them do or be. A strength, never a weakness."
              : "Something you've seen them do, at their worst or most desperate, and roughly when. It goes face down at the bottom of their stack."
          }
          prefix={to.brink(seat) === "them" ? "I have seen Them " : "I have seen you "}
          initial={wrote("brink")?.text ?? ""}
          busy={busy}
          onSubmit={(text) => act({ type: "brink", text })}
          rule="brinks"
        />
      )}
      {step === "stack" && <StackForm key={`stack-${done}`} game={game} seat={seat} busy={busy} act={act} />}
      {step === "record" && (
        <Recorder
          code={code}
          playerId={playerId}
          kept={game.settings.keepRecordings}
          recorded={game.seats[seat].recorded}
          onRecorded={(kind) => act({ type: "recorded", kind })}
        />
      )}
      {step !== "module" && (
        <p className={s.hint} aria-live="polite">
          {done
            ? waiting.length
              ? `Done. Waiting on ${waiting.join(", ")}.`
              : "Everyone's done. The GM will move on."
            : "The GM moves on once everyone's done."}
        </p>
      )}
    </div>
  );
}

function TraitsForm({
  virtueFor,
  viceFor,
  initial,
  busy,
  onSubmit,
}: {
  virtueFor: string;
  viceFor: string;
  initial: { virtue: string; vice: string };
  busy: boolean;
  onSubmit: (virtue: string, vice: string) => Promise<string | null>;
}) {
  const [virtue, setVirtue] = useState(initial.virtue);
  const [vice, setVice] = useState(initial.vice);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(virtue, vice);
      }}
    >
      <p className={s.prose}>
        One word or a short phrase each. You won&apos;t play these: your neighbours will.
        <RuleMark id="traits" />
      </p>
      <label className={s.label} htmlFor="virtue">
        A Virtue (solves more problems than it causes), for {virtueFor}
      </label>
      <input id="virtue" className={s.field} value={virtue} maxLength={140} onChange={(e) => setVirtue(e.target.value)} placeholder="Steady hands" />
      <label className={s.label} htmlFor="vice">
        A Vice (causes more problems than it solves), for {viceFor}
      </label>
      <input id="vice" className={s.field} value={vice} maxLength={140} onChange={(e) => setVice(e.target.value)} placeholder="Can't leave anyone behind" />
      <div className={s.row}>
        <button type="submit" className={s.btn} disabled={busy || !virtue.trim() || !vice.trim()}>
          {initial.virtue ? "Change them" : "Pass them on"}
        </button>
      </div>
    </form>
  );
}

function ConceptForm({
  game,
  seat,
  premade,
  busy,
  act,
}: {
  game: TcView;
  seat: number;
  premade: PublicTcOneShot["cast"][number] | null;
  busy: boolean;
  act: Act;
}) {
  const had = game.seats[seat].concept;
  const [name, setName] = useState(had?.name ?? premade?.name ?? "");
  const [look, setLook] = useState(had?.look ?? premade?.story.look ?? "");
  const [concept, setConcept] = useState(had?.concept ?? premade?.story.concept ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act({ type: "concept", name, look, concept });
      }}
    >
      <label className={s.label} htmlFor="c-name">
        Name
      </label>
      <input id="c-name" className={s.field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      {premade && premade.story.namePrompts.length > 0 && (
        <div className={s.row}>
          {[premade.name, ...premade.story.namePrompts].map((n) => (
            <button key={n} type="button" className={s.quiet} onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <label className={s.label} htmlFor="c-concept">
        Who they are, in a sentence
      </label>
      <textarea id="c-concept" className={s.field} value={concept} maxLength={300} onChange={(e) => setConcept(e.target.value)} />
      <label className={s.label} htmlFor="c-look">
        What they look like tonight
      </label>
      <textarea id="c-look" className={s.field} value={look} maxLength={200} onChange={(e) => setLook(e.target.value)} />
      {premade && premade.story.carrying.length > 0 && (
        <p className={s.hint}>In {premade.name}&apos;s pockets: {premade.story.carrying.join(", ")}.</p>
      )}
      <div className={s.row}>
        <button type="submit" className={s.btn} disabled={busy || !name.trim() || !look.trim() || !concept.trim()}>
          {had ? "Change it" : "Tell the table"}
        </button>
      </div>
    </form>
  );
}

function OneLine({
  title,
  intro,
  prefix,
  initial,
  busy,
  onSubmit,
  rule,
}: {
  title: string;
  intro: string;
  prefix: string;
  initial: string;
  busy: boolean;
  onSubmit: (text: string) => Promise<string | null>;
  rule: "moments" | "brinks";
}) {
  const [text, setText] = useState(initial || prefix);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(text);
      }}
    >
      <h2>
        {title}
        <RuleMark id={rule} />
      </h2>
      <p className={s.prose}>{intro}</p>
      <textarea className={s.field} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label={title} />
      <div className={s.row}>
        <button type="submit" className={s.btn} disabled={busy || text.trim().length <= prefix.trim().length}>
          {initial ? "Change it" : "Write it"}
        </button>
      </div>
    </form>
  );
}

function StackForm({ game, seat, busy, act }: { game: TcView; seat: number; busy: boolean; act: Act }) {
  const mine = game.cards.filter((c) => c.owner === seat);
  const [order, setOrder] = useState<TraitKind[]>(["virtue", "vice", "moment"]);
  const [peek, setPeek] = useState(false);
  const brink = mine.find((c) => c.kind === "brink");
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <div>
      <p className={s.prose}>
        Put them in the order you&apos;ll use them, top first. Only the top card can be burned, and the order can&apos;t
        change once play starts. Most people don&apos;t put their Moment on top.
        <RuleMark id="stack" />
      </p>
      <ol className={s.seats} aria-label="Your stack, top first">
        {order.map((k, i) => {
          const card = mine.find((c) => c.kind === k);
          return (
            <li key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              {card ? <CardFace card={card} top={i === 0} /> : <span className={s.hint}>No {k} yet</span>}
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" className={s.btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${k} up`}>
                  ↑
                </button>
                <button type="button" className={s.btn} onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${k} down`}>
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {brink && (
        <div style={{ marginTop: 12 }}>
          <CardFace card={brink} faceDown={!peek} />
          <button type="button" className={s.quiet} onClick={() => setPeek(!peek)}>
            {peek ? "Turn it back over" : "Read your Brink"}
          </button>
          <RuleMark id="brinkSecret" />
        </div>
      )}
      <div className={s.row}>
        <button type="button" className={s.btn} disabled={busy} onClick={() => void act({ type: "order", order })}>
          {game.seats[seat].done.includes("stack") ? "Restack" : "That's my stack"}
        </button>
      </div>
    </div>
  );
}

function Truths({ game, seat, act, busy, names }: { game: TcView; seat: number; act: Act; busy: boolean; names: (i: number) => string }) {
  const t = game.truths!;
  const [text, setText] = useState("");
  const mine = t.speaker === seat;
  // The roll that put this candle out, so nobody misses what just happened.
  const last = game.log.at(-1);
  const cause = last?.resolved?.darkened && last.scene === t.scene - 1 ? last : null;
  return (
    <div className={s.section}>
      {cause && (
        <>
          <RollDice roll={cause} names={names} />
          <p className={s.prose}>{outcome(cause, names)}</p>
        </>
      )}
      <p className={s.eyebrow}>
        Before scene {t.scene} · {t.entries.length} of {t.needed} truths
        <RuleMark id="truthStarter" />
      </p>
      <p className={s.opening}>{OPENING_LINE}</p>
      <ol className={s.truths}>
        {t.entries.map((e, i) => (
          <li key={i}>
            {e.text}
            <span className={s.truthBy}>{seatName(game.seats, e.by)}</span>
          </li>
        ))}
      </ol>
      {t.speaker === null ? (
        <>
          <p className={s.alive}>…{CLOSING_LINE}.</p>
          <p className={s.hint} style={{ textAlign: "center" }}>
            Say it together, out loud. Then one of you taps it.
          </p>
          <button type="button" className={`${s.btn} ${s.big}`} disabled={busy} onClick={() => void act({ type: "close" })}>
            And we are alive
          </button>
        </>
      ) : mine ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await act({ type: "truth", text }))) setText("");
          }}
        >
          <label className={s.label} htmlFor="truth">
            Your truth: one fact about the world, the place or the people. It can&apos;t undo what&apos;s already true.
          </label>
          <input id="truth" className={s.field} value={text} maxLength={160} onChange={(e) => setText(e.target.value)} />
          <div className={s.row}>
            <button type="submit" className={s.btn} disabled={busy || !text.trim()}>
              State it
            </button>
            <RuleMark id="truthLimits" />
          </div>
        </form>
      ) : (
        <p className={s.prose}>{seatName(game.seats, t.speaker)} is stating a truth.</p>
      )}
    </div>
  );
}

function Scene({ game, seat, act, busy, names }: { game: TcView; seat: number; act: Act; busy: boolean; names: (i: number) => string }) {
  const me = game.seats[seat];
  const roll = game.roll;
  const last = game.log.at(-1);
  const recent = last && last.scene === game.scene ? last : null;
  const [hopeTo, setHopeTo] = useState<string>("");
  // Shake the phone to roll the pool, when nothing's on the table yet.
  const shake = useShake(() => void act({ type: "roll" }), !roll && !busy && me.alive);

  if (!me.alive)
    return (
      <div className={s.section}>
        <p className={s.prose}>{me.concept?.name ?? "Your character"} is gone. Stay in the dark with the others; the end is coming.</p>
      </div>
    );

  return (
    <div className={s.section}>
      {game.lastStand && (
        <p className={s.prose}>
          <b>The Last Stand.</b> One candle. A failed roll now is a death.
          <RuleMark id="lastStand" />
        </p>
      )}
      {roll ? (
        <>
          <RollDice roll={roll} names={names} />
          {roll.seat === seat ? (
            <PendingActions game={game} seat={seat} act={act} busy={busy} />
          ) : (
            <p className={s.hint}>Waiting for {names(roll.seat)} to settle their roll.</p>
          )}
        </>
      ) : (
        <>
          <p className={s.prose}>When you try something that could cost you, roll.</p>
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.big}`} disabled={busy} onClick={() => void act({ type: "roll" })}>
              Roll {game.pools.players} {game.pools.players === 1 ? "die" : "dice"}
              {me.hope ? " + Hope" : ""}
            </button>
            {me.top === "moment" && (
              <button type="button" className={`${s.btn} ${s.big}`} disabled={busy} onClick={() => void act({ type: "roll", moment: true })}>
                Live your Moment
              </button>
            )}
            {shake.permission !== "unsupported" && (
              <button type="button" className={s.btn} onClick={() => (shake.on ? shake.disable() : void shake.enable())}>
                {shake.on ? "Shake to roll: on" : "Shake to roll"}
              </button>
            )}
          </div>
          {recent?.resolved && (
            <div className={s.section}>
              <p className={s.prose}>{outcome(recent, names)}</p>
              {recent.seat === seat && recent.resolved.success && recent.resolved.narrator === "gm" && !recent.resolved.seized && !game.lastStand && (
                <button type="button" className={s.btn} disabled={busy} onClick={() => void act({ type: "seize" })}>
                  Darken a candle and tell it yourself
                </button>
              )}
            </div>
          )}
        </>
      )}
      {last?.resolved && !last.resolved.success && !last.resolved.died && last.seat === seat && (
        <div className={s.section}>
          <p className={s.hint}>
            You failed. If it fits the story, you may let your character die here.
            <RuleMark id="dying" />
          </p>
          {me.hope && (
            <label className={s.label}>
              Give your Hope die to
              <select className={s.field} value={hopeTo} onChange={(e) => setHopeTo(e.target.value)}>
                <option value="">nobody</option>
                {game.seats
                  .filter((x) => x.alive && x.index !== seat)
                  .map((x) => (
                    <option key={x.index} value={x.index}>
                      {names(x.index)}
                    </option>
                  ))}
              </select>
              <RuleMark id="martyr" />
            </label>
          )}
          <button
            type="button"
            className={`${s.btn} ${s.danger}`}
            disabled={busy}
            onClick={() => void act({ type: "die", ...(hopeTo ? { hopeTo: Number(hopeTo) } : {}) })}
          >
            {me.concept?.name ?? "My character"} dies here
          </button>
        </div>
      )}
    </div>
  );
}

function PendingActions({ game, seat, act, busy }: { game: TcView; seat: number; act: Act; busy: boolean }) {
  const roll = game.roll!;
  const top = game.seats[seat].top;
  const sc = score(roll);
  const canBurn = !roll.moment && (top === "virtue" || top === "vice");
  const canEmbrace = top === "brink" && !roll.used.includes("brink") && (game.settings.brinkWhen === "any" || !sc.success);
  return (
    <div>
      <p className={s.prose}>
        {sc.success ? "A six. You succeed" : "No six. As it stands, you fail"}
        {sc.success && sc.tellingSixes <= sc.gmSixes ? ", but the GM's dice say they tell it." : "."}
        <RuleMark id="narration" />
      </p>
      <div className={s.row}>
        {canBurn && (
          <button
            type="button"
            className={s.btn}
            disabled={busy || sc.ones === 0}
            onClick={() => {
              playRip();
              void act({ type: "burn" });
            }}
          >
            Burn your {top} (reroll the 1s)
          </button>
        )}
        {canEmbrace && (
          <button type="button" className={s.btn} disabled={busy} onClick={() => void act({ type: "embrace" })}>
            Embrace your Brink (reroll everything)
          </button>
        )}
        <button type="button" className={`${s.btn} ${s.big}`} disabled={busy} onClick={() => void act({ type: "accept" })}>
          Settle it
        </button>
      </div>
      {canBurn && <p className={s.hint}>Burning means using it in what happens next. It&apos;s gone either way. <RuleMark id="burn" /></p>}
      {canEmbrace && <p className={s.hint}>If the reroll fails too, the Brink burns and your Hope goes with it. <RuleMark id="brinkWhen" /></p>}
    </div>
  );
}

function MyStack({ game, seat }: { game: TcView; seat: number }) {
  const mine = game.cards.filter((c) => c.owner === seat);
  const [peek, setPeek] = useState(false);
  if (mine.length === 0) return null;
  const top = game.seats[seat].top;
  const order = [...(game.seats[seat].order ?? ["virtue", "vice", "moment"]), "brink"];
  const sorted = [...mine].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <div className={s.section}>
      <p className={s.eyebrow}>Your stack{game.seats[seat].hope ? " · you hold a Hope die" : ""}</p>
      <div className={s.cards}>
        {sorted.map((c) =>
          c.kind === "brink" && !c.burned && top !== "brink" && !peek ? (
            <div key={c.id}>
              <CardFace card={c} faceDown />
              <button type="button" className={s.quiet} onClick={() => setPeek(true)}>
                Read your Brink
              </button>
            </div>
          ) : (
            <CardFace key={c.id} card={c} top={!c.burned && c.kind === top} tilt={c.burned ? 2 : 0} />
          ),
        )}
      </div>
    </div>
  );
}
