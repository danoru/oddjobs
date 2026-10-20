import { useEffect, useMemo, useRef, useState } from "react";
import type { SoundStinger } from "@/lib/sound/synth";
import { SoundEngine } from "@/lib/sound/synth";
import { bellsToRing, type BellData, type LiveEvent, type NoteData, type PoolRollData, type PublicPerson, type RollData, type RollMode, type RumorView } from "@/lib/live";
import type { useLive } from "@/lib/useLive";
import { buzz, useShake } from "@/lib/shake";
import type { CoinMeta } from "@/systems/registry";
import type { RollSpec } from "@/systems/dnd5e/rolls";
import t from "./Toys.module.css";

/**
 * What a player's phone does at a table, for any system: the GM's bell, notes
 * under the table, rumors, inspiration coins, and (d20 systems) the dice
 * tray. Everything goes through the table's event log (src/lib/live.ts); the
 * server decides what this phone may see.
 */

export type Live = ReturnType<typeof useLive>;

const who = (p: LiveEvent["by"]) => (p === "gm" ? "the GM" : p === "all" ? "everyone" : p ? (p.character ?? p.name) : "someone");

// ---- Dice faces (phone and TV) ----------------------------------------------------

/** The dice of a roll, tumbling in. */
export function DiceFaces({ data, size = 34 }: { data: RollData | PoolRollData; size?: number }) {
  const style = (i: number) => ({ ["--i" as string]: i, ["--size" as string]: `${size}px` });
  if (data.system === "pool") {
    const face = (v: number) => (v === 6 ? "six" : v === 1 ? "one" : undefined);
    return (
      <span className={t.dice} aria-label={`Dice: ${data.dice.join(", ")}${data.hope ? `, hope ${data.hope}` : ""}; GM: ${data.gmDice.join(", ") || "none"}`}>
        {data.dice.map((v, i) => (
          <span key={`p${i}`} className={t.die} data-sides="6" data-face={face(v)} style={style(i)}>
            {v}
          </span>
        ))}
        {data.hope !== null && (
          <span className={t.die} data-sides="6" data-face={data.hope >= 5 ? "six" : undefined} style={style(data.dice.length)} title="Hope die">
            {data.hope}
          </span>
        )}
        {data.gmDice.map((v, i) => (
          <span key={`g${i}`} className={`${t.die} ${t.gmDie}`} data-sides="6" style={style(data.dice.length + 1 + i)} title="GM die">
            {v}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={t.dice} aria-label={`Dice: ${data.dice.map((d) => d.value).join(", ")}`}>
      {data.dice.map((d, i) => (
        <span key={i} className={t.die} data-sides={d.sides} data-kept={d.kept} style={style(i)}>
          {d.value}
        </span>
      ))}
    </span>
  );
}

/** "Stealth: 17 (natural 20!)" — a roll in words. */
export function rollWords(data: RollData | PoolRollData): string {
  if (data.system === "pool") {
    const sixes = data.dice.filter((d) => d === 6).length + (data.hope !== null && data.hope >= 5 ? 1 : 0);
    const fate = data.died ? "and dies" : data.darkened ? "and a candle goes dark" : "";
    return `${data.label}: ${data.success ? `success (${sixes} six${sixes === 1 ? "" : "es"})` : "failure"} ${fate}`.trim();
  }
  const nat = data.nat === 20 ? " — natural 20!" : data.nat === 1 ? " — natural 1" : "";
  const mode = data.mode === "adv" ? " with advantage" : data.mode === "dis" ? " with disadvantage" : "";
  return `${data.label}${mode}: ${data.total}${nat}${data.reroll ? " (rerolled)" : ""}`;
}

// ---- The bell ----------------------------------------------------------------------

/**
 * Rings this phone when the GM rings the bell: the stinger (synthesised) and a
 * buzz, once per bell. Phones only allow sound after a tap, so the first tap
 * on "Let the bell ring here" unlocks it (and keeps the screen awake).
 */
export function PhoneBell({ live }: { live: Live }) {
  const engine = useRef<SoundEngine | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [flash, setFlash] = useState<{ id: number; label: string } | null>(null);
  const [rung, setRung] = useState(0);
  const heard = useRef(0);

  useEffect(() => () => engine.current?.dispose(), []);

  useEffect(() => {
    if (live.baseline === null) return;
    const fresh = bellsToRing(live.events, Math.max(live.baseline, heard.current));
    if (!fresh.length) return;
    heard.current = Math.max(...fresh.map((e) => e.id));
    const last = fresh.at(-1)!;
    const bell = last.data as BellData;
    engine.current?.playStinger(bell.preset as SoundStinger);
    buzz([220, 90, 220, 90, 400]);
    setRung((n) => n + fresh.length);
    setFlash({ id: last.id, label: bell.label });
  }, [live.events, live.baseline]);

  // The flash clears itself after the swing, whatever the polls do meanwhile.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function unlock() {
    engine.current ??= new SoundEngine({ volume: 0.9 });
    engine.current.playStinger("glass");
    buzz(60);
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } };
    nav.wakeLock?.request("screen").catch(() => undefined);
    setUnlocked(true);
  }

  return (
    <>
      {!unlocked && (
        <div className={t.card}>
          <p className={t.title}>THE GM&apos;S BELL</p>
          <p className={t.prose}>Tap once so the GM&apos;s bell can ring and buzz this phone mid-scene.</p>
          <button type="button" className={t.btn} onClick={unlock}>
            Let the bell ring here
          </button>
        </div>
      )}
      <span data-testid="bells-rung" data-sound={unlocked ? "on" : "off"} hidden>
        {rung}
      </span>
      {flash && (
        <div key={flash.id} className={t.bellFlash} role="alert">
          <div>
            <div className={t.bellGlyph} aria-hidden="true">
              🔔
            </div>
            <div className={t.bellText}>{flash.label}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ---- The dice tray (d20 systems) -------------------------------------------------------

/**
 * The tray along the bottom of a sheet at a table. Tap any number on the
 * sheet to roll it; pick advantage or disadvantage first; or shake the phone
 * to roll the last one again. The server rolls; the TV shows it too.
 */
export function DiceTray({ live, armed, coin, onRolled }: { live: Live; armed: RollSpec | null; coin: CoinMeta | null; onRolled?: () => void }) {
  const [mode, setMode] = useState<RollMode>("normal");
  const mine = live.fold.rolls.filter((e) => e.mine && e.data).at(-1);
  const data = mine?.data as RollData | undefined;
  const coins = live.you ? (live.fold.coins[live.you] ?? 0) : 0;
  const [last, setLast] = useState<RollSpec>(armed ?? { label: "d20", count: 1, sides: 20, mod: 0, d20: true });

  async function roll(r: RollSpec, reroll = false) {
    setLast(r);
    await live.act({ type: "roll", label: r.label, count: r.count, sides: r.sides, mod: r.mod, mode: r.d20 ? mode : "normal", ...(reroll ? { reroll: true } : {}) });
    onRolled?.();
  }
  const shake = useShake(() => void roll(last), !live.busy);

  // A tap on the sheet arrives as a new `armed` spec: roll it at once.
  const seen = useRef<RollSpec | null>(null);
  useEffect(() => {
    if (armed && armed !== seen.current) {
      seen.current = armed;
      void roll(armed);
    }
    // roll is recreated each render; only a new tap should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  return (
    <div className={`${t.tray} no-print`} role="region" aria-label="Dice tray">
      <div className={t.trayInner}>
        <div className={t.modes} role="group" aria-label="Advantage">
          {(["dis", "normal", "adv"] as const).map((m) => (
            <button key={m} type="button" className={t.mode} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "dis" ? "Disadv." : m === "adv" ? "Advantage" : "Normal"}
            </button>
          ))}
        </div>
        <div className={t.result} aria-live="polite">
          {data ? (
            <>
              <span key={mine!.id} className={`${t.total} ${data.nat === 20 ? t.natTwenty : data.nat === 1 ? t.natOne : ""}`} data-testid="my-roll-total">
                {data.total}
              </span>
              <DiceFaces key={`f${mine!.id}`} data={data} size={28} />
              <span className={t.trayLabel}>{rollWords(data)}</span>
            </>
          ) : (
            <span className={t.trayLabel}>Tap any number on your sheet to roll it.</span>
          )}
        </div>
        <button type="button" className={t.btn} disabled={live.busy} onClick={() => void roll(last)}>
          Roll {last.label === "d20" ? "a d20" : "again"}
        </button>
        {coin && coins > 0 && data && data.system === "d20" && (
          <button type="button" className={t.ghost} style={{ color: "var(--brass)", borderColor: "var(--brass)" }} disabled={live.busy} onClick={() => void roll(last, true)}>
            Spend {coin.name}: reroll
          </button>
        )}
        {shake.permission !== "unsupported" && (
          <button type="button" className={t.ghost} style={{ color: "var(--parchment-dark)", borderColor: "var(--parchment-dark)" }} onClick={() => (shake.on ? shake.disable() : void shake.enable())}>
            {shake.on ? "Shake: on" : "Shake to roll"}
          </button>
        )}
        {live.error && <span className={t.error} style={{ color: "#f0a49a" }}>{live.error}</span>}
      </div>
    </div>
  );
}

// ---- Notes under the table -----------------------------------------------------------

/**
 * Pass a folded note to the GM or another player, and read the ones passed to
 * you. The GM's page uses it too (`gm`), to answer.
 */
export function NotesCard({ live, gm = false }: { live: Live; gm?: boolean }) {
  const others = live.people.filter((p) => p.handle !== live.you);
  const [to, setTo] = useState<string>(gm ? (others[0]?.handle ?? "") : "gm");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const readable = live.fold.notes.filter((n) => typeof (n.data as Partial<NoteData>).text === "string");
  const passing = live.fold.notes.filter((n) => typeof (n.data as Partial<NoteData>).text !== "string");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setProblem("Write something first.");
    if (!to) return setProblem("Who's it for?");
    const err = await live.act({ type: "note", to, text: text.trim(), ...(replyTo ? { replyTo } : {}) });
    setProblem(err);
    if (!err) {
      setText("");
      setReplyTo(null);
    }
  }

  return (
    <form className={t.card} onSubmit={send} aria-label="Notes under the table">
      <p className={t.title}>NOTES UNDER THE TABLE</p>
      <div className={t.row} style={{ marginTop: 0 }}>
        <label className={t.hint} style={{ margin: 0 }}>
          To{" "}
          <select className={t.select} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Pass the note to">
            {!gm && <option value="gm">The GM</option>}
            {others.map((p) => (
              <option key={p.handle} value={p.handle}>
                {p.character ? `${p.character} (${p.name})` : p.name}
              </option>
            ))}
          </select>
        </label>
        {replyTo && (
          <button type="button" className={t.ghost} onClick={() => setReplyTo(null)}>
            Not a reply
          </button>
        )}
      </div>
      <textarea
        className={t.textarea}
        style={{ marginTop: 8 }}
        value={text}
        maxLength={500}
        onChange={(e) => {
          setText(e.target.value);
          setProblem(null);
        }}
        aria-label="Your note"
        placeholder={gm ? "Only they will read it." : "Only they will read it. The table sees a note change hands."}
      />
      <div className={t.row}>
        <button type="submit" className={t.btn} disabled={live.busy}>
          Fold and pass
        </button>
        {problem && <span className={t.error}>{problem}</span>}
      </div>
      {readable.length > 0 && (
        <ul className={t.notes} aria-label="Notes to and from you">
          {readable
            .slice()
            .reverse()
            .map((n, i) => {
              const d = n.data as NoteData;
              const toMe = n.forMe;
              return (
                <li key={n.id} className={t.note} style={{ ["--tilt" as string]: `${i % 2 ? 0.7 : -0.6}deg` }} data-testid="note">
                  <div className={t.noteHead}>
                    {n.mine ? `You → ${d.toName}` : `${d.fromName} → ${toMe ? "you" : d.toName}`}
                    {d.replyTo ? " · reply" : ""}
                  </div>
                  <div>{d.text}</div>
                  {toMe && (
                    <button
                      type="button"
                      className={t.ghost}
                      style={{ marginTop: 6, minHeight: 28, padding: "2px 10px" }}
                      onClick={() => {
                        setReplyTo(n.id);
                        setTo(n.by === "gm" || n.by === null ? "gm" : n.by === "all" ? to : n.by.handle);
                      }}
                    >
                      Reply
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}
      {gm && passing.length > 0 && (
        <p className={t.folded}>
          Passed between players (folded, unread): {passing.map((n) => `${(n.data as NoteData).fromName} → ${(n.data as NoteData).toName}`).join("; ")}
        </p>
      )}
    </form>
  );
}

// ---- Coins ---------------------------------------------------------------------------

/** Your inspiration coins: how many you hold, spend one, or toss one to someone else. */
export function CoinsCard({ live, coin }: { live: Live; coin: CoinMeta }) {
  const others = live.people.filter((p) => p.handle !== live.you);
  const [to, setTo] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const held = live.you ? (live.fold.coins[live.you] ?? 0) : 0;
  const tossed = live.you ? (live.fold.tossed[live.you] ?? 0) : 0;
  const left = Math.max(0, coin.tossesPerAct - tossed);
  const target = to || others[0]?.handle || "";

  return (
    <div className={t.card} aria-label={coin.name}>
      <p className={t.title}>{coin.name.toUpperCase()}</p>
      <div className={t.purse}>
        <span className={t.coin} aria-hidden="true">
          ✦
        </span>
        <span className={t.count} data-testid="coin-count">
          {held}
        </span>
        <span className={t.hint} style={{ margin: 0 }}>
          {held === 1 ? "coin" : "coins"} in your purse. {coin.spend}
        </span>
      </div>
      <div className={t.row}>
        <button type="button" className={t.ghost} disabled={held < 1 || live.busy} onClick={async () => setProblem(await live.act({ type: "spend" }))}>
          Spend one
        </button>
      </div>
      {coin.tossesPerAct > 0 && others.length > 0 && (
        <div className={t.row}>
          <select className={t.select} value={target} onChange={(e) => setTo(e.target.value)} aria-label="Toss a coin to">
            {others.map((p) => (
              <option key={p.handle} value={p.handle}>
                {p.character ?? p.name}
              </option>
            ))}
          </select>
          <button type="button" className={t.btn} disabled={left < 1 || live.busy || !target} onClick={async () => setProblem(await live.act({ type: "coin", to: target }))}>
            Toss a coin
          </button>
          <span className={t.hint} style={{ margin: 0 }}>
            {left > 0 ? `${left} to toss this act` : "Tossed this act"}
          </span>
        </div>
      )}
      {problem && <p className={t.error}>{problem}</p>}
    </div>
  );
}

// ---- Rumors --------------------------------------------------------------------------

/** Two rumors heard at the bar, drawn once. Whether they're true is the GM's secret. */
export function RumorsCard({ live }: { live: Live }) {
  const [problem, setProblem] = useState<string | null>(null);
  const mine: RumorView[] | undefined = live.you ? live.fold.rumors[live.you] : undefined;
  return (
    <div className={t.card}>
      <p className={t.title}>HEARD AT THE BAR</p>
      {mine ? (
        mine.map((r) => (
          <p key={r.id} className={t.rumor} data-testid="rumor">
            &ldquo;{r.text}&rdquo;
          </p>
        ))
      ) : (
        <>
          <p className={t.prose}>Lean on the bar and listen. You&apos;ll hear two rumors; whether they&apos;re true is anyone&apos;s guess.</p>
          <button type="button" className={t.btn} disabled={live.busy || !live.you} onClick={async () => setProblem(await live.act({ type: "rumors" }))}>
            Listen at the bar
          </button>
        </>
      )}
      {problem && <p className={t.error}>{problem}</p>}
    </div>
  );
}

// ---- Together ------------------------------------------------------------------------

/** The cards under a player's poster at a table. */
export function TableToys({ live, coin, rumors }: { live: Live; coin: CoinMeta | null; rumors: boolean }) {
  const inTable = useMemo(() => live.you !== null, [live.you]);
  return (
    <div className="no-print">
      <PhoneBell live={live} />
      {inTable && rumors && <RumorsCard live={live} />}
      {inTable && coin && <CoinsCard live={live} coin={coin} />}
      {inTable && <NotesCard live={live} />}
    </div>
  );
}

export type { PublicPerson };
export { who as partyName };
