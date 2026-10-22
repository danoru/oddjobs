import { useEffect, useMemo, useState } from "react";
import type { OneShotWithCast } from "@/lib/schema";
import { NOTICE_KINDS, SOUND_STINGERS, type NoticeKind } from "@/lib/coreSchema";
import { availableLetters, type LetterView } from "@/lib/letters";
import { minutesSince, personLabel, spotlight, type PoolRollData, type RollData } from "@/lib/live";
import { useLive } from "@/lib/useLive";
import { roman } from "@/lib/box";
import { coinFor, SYSTEMS } from "@/systems/registry";
import { DiceFaces, NotesCard, rollWords } from "@/components/table/TableToys";
import { DhGmPanels } from "@/systems/daggerheart/components/GmPanels";
import { PaGmPanels } from "@/systems/paranoia/components/Table";
import t from "@/components/table/Toys.module.css";
import s from "@/components/board/Board.module.css";

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;
const KIND_LABEL: Record<NoticeKind, string> = { poster: "New poster", reward: "Reward changed", sighted: "Sighted", settled: "Settled" };

/**
 * The GM's live table tools, all on the table's event log: ring the bell on
 * every phone, raise act cards on the TV, keep the spotlight moving, see who
 * heard which rumor (and whether it's true), pin notices to the town board,
 * hand out coins, answer notes and roll behind the screen.
 */
export function GmLive({
  os,
  table,
  letters,
  deliver,
}: {
  os: OneShotWithCast;
  table: string | null;
  letters: LetterView[];
  deliver: (id: string) => Promise<boolean>;
}) {
  const live = useLive(table, "gm");
  const { fold, people, act, error } = live;
  const coin = coinFor(os);
  const meta = SYSTEMS[os.system];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  if (!table) return null;

  return (
    <section aria-labelledby="live-tools" style={{ marginTop: 32 }}>
      <h2 id="live-tools" className={s.noteTitle} style={{ color: "var(--parchment)" }}>
        At the table tonight
      </h2>
      {error && <p className={t.error} style={{ color: "#f0a49a" }}>{error}</p>}
      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        {os.system === "daggerheart" && <DhGmPanels os={os} live={live} />}
        {os.system === "paranoia" && <PaGmPanels os={os} live={live} />}
        <BellPanel os={os} live={live} />
        <ActsPanel os={os} live={live} />
        <SpotlightPanel os={os} live={live} letters={letters} deliver={deliver} now={now} beats={meta.spotlight} />
        {os.rumors.length > 0 && <RumorsPanel os={os} live={live} />}
        <BoardPanel os={os} live={live} />
        {coin && (
          <div className={s.note} style={{ ["--tilt" as string]: "0.5deg" }}>
            <span className={s.brassPin} aria-hidden="true" />
            <p className={s.noteTitle}>{coin.name}</p>
            {people.length === 0 ? (
              <p style={mono}>Coins appear once posters are torn.</p>
            ) : (
              <ul className={s.yarnList}>
                {people.map((p) => (
                  <li key={p.handle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1 }}>
                      <span className={s.yarn}>{personLabel(p)}</span> · {fold.coins[p.handle] ?? 0} held
                    </span>
                    <button type="button" className={t.ghost} disabled={live.busy} onClick={() => void act({ type: "coin", to: p.handle })}>
                      Grant a coin
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p style={small}>Players may each toss {coin.tossesPerAct} per act; you can grant any number. {coin.spend}</p>
          </div>
        )}
        <div>
          <NotesCard live={live} gm />
        </div>
        <RollsPanel os={os} live={live} />
      </div>
    </section>
  );
}

type Live = ReturnType<typeof useLive>;

function BellPanel({ os, live }: { os: OneShotWithCast; live: Live }) {
  const own = os.sounds?.stingers ?? [];
  const [preset, setPreset] = useState<string>(own[0] ? `own:${own[0].id}` : "bell");
  const [to, setTo] = useState("");
  const [rung, setRung] = useState<string | null>(null);
  async function ring() {
    const mine = preset.startsWith("own:") ? own.find((x) => `own:${x.id}` === preset) : null;
    const err = await live.act({
      type: "bell",
      preset: (mine?.preset ?? preset) as (typeof SOUND_STINGERS)[number],
      label: mine?.label ?? "The bell",
      ...(to ? { to } : {}),
    });
    setRung(err ?? `Rung on ${to ? "one phone" : "every phone"}.`);
  }
  return (
    <div className={s.note} style={{ ["--tilt" as string]: "-0.7deg" }}>
      <span className={s.brassPin} aria-hidden="true" />
      <p className={s.noteTitle}>The bell on every phone</p>
      <p style={mono}>Every phone at the table plays it and buzzes at once (players tap once to let it in).</p>
      <div className={t.row}>
        <select className={t.select} value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Stinger">
          {own.map((x) => (
            <option key={x.id} value={`own:${x.id}`}>
              {x.label}
            </option>
          ))}
          {SOUND_STINGERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select className={t.select} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Ring for">
          <option value="">Everyone</option>
          {live.people.map((p) => (
            <option key={p.handle} value={p.handle}>
              Only {personLabel(p)}
            </option>
          ))}
        </select>
        <button type="button" className={t.btn} disabled={live.busy} onClick={() => void ring()}>
          Ring the bell
        </button>
      </div>
      {rung && <p style={small}>{rung}</p>}
    </div>
  );
}

function ActsPanel({ os, live }: { os: OneShotWithCast; live: Live }) {
  const up = live.fold.act?.index ?? null;
  const last = live.fold.lastAct?.index ?? -1;
  return (
    <div className={s.note} style={{ ["--tilt" as string]: "0.6deg" }}>
      <span className={s.pin} aria-hidden="true" />
      <p className={s.noteTitle}>Act cards on the TV</p>
      {os.acts.length === 0 ? (
        <p style={mono}>This one-shot has no act cards yet. Add them in the builder (Table play → Act cards).</p>
      ) : (
        <>
          {os.system === "tencandles" && (
            <p style={small}>The candles drive these: each card goes up by itself when a new scene opens in its stage. You can still raise one by hand.</p>
          )}
          <ol className={s.yarnList} style={{ listStyle: "none", paddingLeft: 0 }}>
            {os.acts.map((a, i) => (
              <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontWeight: up === i ? 700 : 400 }}>
                  <span className={s.yarn}>Act {roman(i)}:</span> {a.title}
                  {up === i ? " · on the TV" : last === i ? " · last shown" : ""}
                </span>
                <button type="button" className={up === i ? t.ghost : t.btn} disabled={live.busy || up === i} onClick={() => void live.act({ type: "act", index: i })}>
                  Raise
                </button>
              </li>
            ))}
          </ol>
          <div className={t.row}>
            <button type="button" className={t.btn} disabled={live.busy || last >= os.acts.length - 1} onClick={() => void live.act({ type: "act", index: last + 1 })}>
              Next act
            </button>
            <button type="button" className={t.ghost} disabled={live.busy || up === null} onClick={() => void live.act({ type: "act", index: null })}>
              Back to the board
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SpotlightPanel({
  os,
  live,
  letters,
  deliver,
  now,
  beats,
}: {
  os: OneShotWithCast;
  live: Live;
  letters: LetterView[];
  deliver: (id: string) => Promise<boolean>;
  now: number;
  beats: { id: string; label: string }[];
}) {
  const [nudge, setNudge] = useState(20);
  const opened = letters.filter((l) => l.openedAt).map((l) => ({ characterId: l.to, openedAt: l.openedAt! }));
  const rows = useMemo(() => spotlight(live.people, live.events, opened), [live.people, live.events, opened]);
  const present = live.people.map((p) => p.characterId).filter((x): x is string => Boolean(x));
  const offer = availableLetters(os, present).filter((l) => !letters.some((d) => d.id === l.id));
  const actId = live.fold.lastAct?.id ?? null;
  // Longest out of the light first.
  const order = [...live.people].sort((a, b) => {
    const ra = rows.find((r) => r.handle === a.handle)?.lastAt ?? 0;
    const rb = rows.find((r) => r.handle === b.handle)?.lastAt ?? 0;
    return ra - rb;
  });

  return (
    <div className={s.note} style={{ ["--tilt" as string]: "-0.4deg", gridColumn: "1 / -1" }}>
      <span className={s.brassPin} aria-hidden="true" />
      <p className={s.noteTitle}>Spotlight</p>
      <p style={small}>
        Time since each character last had the table: a roll, a note, a coin, a letter opened, or a beat you tick. Nudge after{" "}
        <select className={t.select} value={nudge} onChange={(e) => setNudge(Number(e.target.value))} aria-label="Nudge after minutes">
          {[10, 15, 20, 30, 45].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </p>
      {order.length === 0 ? (
        <p style={mono}>Nobody at the table yet.</p>
      ) : (
        <ul className={s.yarnList} aria-live="polite">
          {order.map((p) => {
            const r = rows.find((x) => x.handle === p.handle);
            const mins = minutesSince(r?.lastAt ?? null, now);
            const due = mins === null || mins >= nudge;
            const ticked = live.fold.ticks[p.handle] ?? [];
            const theirs = offer.filter((l) => l.to === p.characterId);
            const suggest = theirs.find((l) => os.letters.find((x) => x.id === l.id)?.act === actId) ?? theirs[0];
            return (
              <li key={p.handle} data-testid="spotlight-row" style={{ padding: "6px 0", borderBottom: "1px dashed rgba(43,29,14,0.2)" }}>
                <span className={s.yarn}>{personLabel(p)}</span>{" "}
                <span style={{ ...small, color: due ? "var(--wax)" : "var(--ink-soft)", fontWeight: due ? 700 : 400 }}>
                  {mins === null ? "not yet in the light" : `${mins} min since ${r?.last ?? "anything"}`}
                </span>
                <div className={t.row} style={{ marginTop: 4 }}>
                  {beats.map((b) => {
                    const on = ticked.includes(b.id);
                    return (
                      <label key={b.id} style={{ ...small, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input type="checkbox" checked={on} onChange={() => void live.act({ type: "tick", to: p.handle, beat: b.id, on: !on })} />
                        {b.label}
                      </label>
                    );
                  })}
                </div>
                {due && (
                  <p style={{ ...small, color: "var(--wax)", margin: "4px 0 0" }} data-testid="spotlight-nudge">
                    Give {p.character ?? p.name} a moment.
                    {suggest ? (
                      <>
                        {" "}
                        Undelivered: <i>{suggest.title}</i>{" "}
                        <button type="button" className={t.ghost} style={{ minHeight: 26, padding: "1px 8px" }} onClick={() => void deliver(suggest.id)}>
                          Deliver it
                        </button>
                      </>
                    ) : (
                      " Ask about their stake, or call a tie into the scene."
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RumorsPanel({ os, live }: { os: OneShotWithCast; live: Live }) {
  const drew = (id: string) => live.people.filter((p) => (live.fold.rumors[p.handle] ?? []).some((r) => r.id === id));
  return (
    <div className={s.note} style={{ ["--tilt" as string]: "0.9deg" }}>
      <span className={s.pin} aria-hidden="true" />
      <p className={s.noteTitle}>Rumor mill</p>
      <p style={small}>Each player draws two from their phone after claiming. Only you see the truth.</p>
      {os.rumors.map((r) => {
        const heard = drew(r.id);
        return (
          <p key={r.id} className={t.rumor}>
            &ldquo;{r.text}&rdquo;
            <span className={t.truth} data-truth={r.truth}>
              {r.truth === "half" ? "HALF TRUE" : r.truth.toUpperCase()}
            </span>
            <span style={{ display: "block", ...small, fontStyle: "normal" }}>{heard.length ? `Heard by ${heard.map((p) => p.character ?? p.name).join(", ")}` : "Not heard yet"}</span>
          </p>
        );
      })}
    </div>
  );
}

function BoardPanel({ os, live }: { os: OneShotWithCast; live: Live }) {
  const [kind, setKind] = useState<NoticeKind>("poster");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const up = live.fold.notices;
  const presets = os.notices.filter((n) => !up.some((u) => u.nid === n.id));
  return (
    <div className={s.note} style={{ ["--tilt" as string]: "-0.8deg" }}>
      <span className={s.brassPin} aria-hidden="true" />
      <p className={s.noteTitle}>The town board</p>
      <p style={small}>Notices you pin show on the job page and the TV for everyone at the table.</p>
      {up.length > 0 && (
        <ul className={s.yarnList}>
          {up.map((n) => (
            <li key={n.nid} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ flex: 1 }}>
                <span className={s.yarn}>{n.title}</span> <span style={small}>({n.settled ? "SETTLED" : KIND_LABEL[n.kind]})</span>
              </span>
              {!n.settled && (
                <button type="button" className={t.ghost} onClick={() => void live.act({ type: "settle", nid: n.nid })}>
                  Stamp settled
                </button>
              )}
              <button type="button" className={t.ghost} onClick={() => void live.act({ type: "unpin", nid: n.nid })}>
                Take down
              </button>
            </li>
          ))}
        </ul>
      )}
      {presets.length > 0 && (
        <>
          <p style={{ ...small, marginTop: 8 }}>Ready to pin:</p>
          <ul className={s.yarnList}>
            {presets.map((n) => (
              <li key={n.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1 }}>
                  {n.title} <span style={small}>({KIND_LABEL[n.kind]})</span>
                </span>
                <button type="button" className={t.btn} onClick={() => void live.act({ type: "notice", preset: n.id }).then(setProblem)}>
                  Pin
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const err = await live.act({ type: "notice", kind, title: title.trim(), ...(text.trim() ? { text: text.trim() } : {}) });
          setProblem(err);
          if (!err) {
            setTitle("");
            setText("");
          }
        }}
      >
        <div className={t.row}>
          <select className={t.select} value={kind} onChange={(e) => setKind(e.target.value as NoticeKind)} aria-label="Kind of notice">
            {NOTICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input className={t.select} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" aria-label="Notice headline" style={{ flex: 1, minWidth: 140 }} />
        </div>
        <textarea className={t.textarea} style={{ marginTop: 6, minHeight: 44 }} value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder="A line or two (optional)" aria-label="Notice text" />
        <div className={t.row}>
          <button type="submit" className={t.btn} disabled={!title.trim()}>
            Pin a new notice
          </button>
          {problem && <span className={t.error}>{problem}</span>}
        </div>
      </form>
    </div>
  );
}

function RollsPanel({ os, live }: { os: OneShotWithCast; live: Live }) {
  const [label, setLabel] = useState("");
  const [formula, setFormula] = useState("1d20");
  const [hidden, setHidden] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const hiddenNow = new Set(
    live.events.filter((e) => e.kind === "hide").reduce<number[]>((acc, e) => {
      const d = e.data as { roll: number; hidden: boolean };
      return d.hidden ? [...acc.filter((x) => x !== d.roll), d.roll] : acc.filter((x) => x !== d.roll);
    }, live.events.filter((e) => e.kind === "roll" && e.redacted === false).map((e) => e.id)),
  );
  const recent = live.fold.rolls.slice(-12).reverse();
  // Daggerheart's GM rolls d20s for adversaries, like a 5e GM; in Ten Candles and Paranoia the GM doesn't roll.
  const d20 = SYSTEMS[os.system].dice === "d20" || SYSTEMS[os.system].dice === "duality";

  async function roll(e: React.FormEvent) {
    e.preventDefault();
    const m = formula.replace(/\s+/g, "").match(/^(\d{1,2})?d(\d{1,3})([+-]\d{1,2})?$/i);
    if (!m) return setProblem("Dice like 1d20+4 or 2d6");
    setProblem(await live.act({ type: "roll", label: label.trim() || formula, count: Number(m[1] ?? 1), sides: Number(m[2]), mod: Number(m[3] ?? 0), mode: "normal", hidden }));
  }

  return (
    <div className={s.note} style={{ ["--tilt" as string]: "0.4deg" }}>
      <span className={s.pin} aria-hidden="true" />
      <p className={s.noteTitle}>The dice tray</p>
      {d20 && (
        <form onSubmit={roll}>
          <div className={t.row} style={{ marginTop: 0 }}>
            <input className={t.select} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What for" aria-label="Roll label" style={{ flex: 1, minWidth: 110 }} />
            <input className={t.select} value={formula} onChange={(e) => setFormula(e.target.value)} aria-label="Dice to roll" style={{ width: 90 }} />
            <label style={{ ...small, display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Behind the screen
            </label>
            <button type="submit" className={t.btn} disabled={live.busy}>
              Roll
            </button>
          </div>
          {problem && <p className={t.error}>{problem}</p>}
        </form>
      )}
      {recent.length === 0 ? (
        <p style={mono}>Rolls from the phones land here{d20 ? " (and on the TV)" : ""}.</p>
      ) : (
        <ul className={s.yarnList} data-testid="gm-roll-log">
          {recent.map((e) => {
            const data = e.data as RollData | PoolRollData | null;
            if (!data) return null;
            const isHidden = hiddenNow.has(e.id);
            return (
              <li key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ flex: 1 }}>
                  <span className={s.yarn}>{data.who}</span> {rollWords(data)}
                  {isHidden && <span style={small}> · hidden</span>}
                </span>
                <DiceFaces data={data} size={22} />
                {data.system === "d20" && (
                  <button type="button" className={t.ghost} style={{ minHeight: 26, padding: "1px 8px" }} onClick={() => void live.act({ type: "hide", roll: e.id, hidden: !isHidden })}>
                    {isHidden ? "Show" : "Hide"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
