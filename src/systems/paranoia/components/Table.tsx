import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveEvent } from "@/lib/live";
import type { useLive } from "@/lib/useLive";
import { personLabel } from "@/lib/live";
import { useShake } from "@/lib/shake";
import type { Character, HouseRules } from "@/systems/paranoia/schema";
import { cloneName, sheetLimits } from "@/systems/paranoia/derive";
import { foldParanoia, nodeWords, startMarks, type NodeData, type PMarks, type PTallies, type PTallyData, type PTrack } from "@/systems/paranoia/live";
import { CLONES, DEAD, WOUND_NAMES, computerThreshold, treasonNames } from "@/systems/paranoia/rules";
import type { NodeSpec } from "./Sheet";
import t from "@/components/table/Toys.module.css";
import s from "@/components/board/Board.module.css";
import p from "./Pa.module.css";
import { NodeFaces } from "./Dice";

export { NodeFaces };

/**
 * Paranoia at the table: NODE dice from the sheet, everyone's record (Moxie,
 * wounds, Flags, clones, XP) folded from the event log, treason reports, and
 * Friend Computer's voice on every screen. All on the table's event log
 * (src/systems/paranoia/live.ts).
 */

type Live = ReturnType<typeof useLive>;
type Cast = readonly Pick<Character, "id" | "mech">[];

export function useRecords(events: LiveEvent[], cast: Cast, h: HouseRules): PTallies {
  const sheets = useMemo(() => sheetLimits(cast), [cast]);
  return useMemo(() => foldParanoia(events, sheets, h), [events, sheets, h]);
}

export const marksFor = (r: PTallies, c: Pick<Character, "id" | "mech">): PMarks => r.marks[c.id] ?? startMarks(sheetLimits([c])[c.id]);

/** The latest thing Friend Computer said, on a phone. */
export function ComputerFeed({ events }: { events: LiveEvent[] }) {
  const last = [...events].reverse().find((e) => e.kind === "computer");
  if (!last) return null;
  return (
    <div className={p.computer} role="status" aria-live="polite" style={{ marginBottom: 14 }} data-testid="phone-computer">
      <div className={p.computerHead}>FRIEND COMPUTER SAYS</div>
      <div className={p.computerText}>{(last.data as { text: string }).text}</div>
    </div>
  );
}

/**
 * The tray along the bottom of a Troubleshooter's sheet: tap a stat or skill
 * on the sheet to roll it, with any gear dice; shake to roll the last one
 * again. The server rolls, reads your wounds and treason, and lights the
 * Computer die when it notices you.
 */
export function NodeTray({ live, armed, marks }: { live: Live; armed: NodeSpec | null; marks: PMarks }) {
  const [gear, setGear] = useState(0);
  const [last, setLast] = useState<NodeSpec>(armed ?? { label: "Violence", stat: "violence", skill: null });
  const mine = live.fold.rolls.filter((e) => e.mine && e.data && (e.data as NodeData).system === "node").at(-1);
  const data = mine?.data as NodeData | undefined;
  async function roll(r: NodeSpec) {
    setLast(r);
    const err = await live.act({ type: "node", label: r.label, stat: r.stat, skill: r.skill, gear });
    if (!err) setGear(0);
  }
  const shake = useShake(() => void roll(last), !live.busy);
  const seen = useRef<NodeSpec | null>(null);
  useEffect(() => {
    if (armed && armed !== seen.current) {
      seen.current = armed;
      void roll(armed);
    }
    // Only a new tap on the sheet should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);
  return (
    <div className={`${t.tray} no-print`} role="region" aria-label="NODE dice tray">
      <div className={t.trayInner}>
        <div className={t.modes} role="group" aria-label="Gear dice">
          {[0, 1, 2, 3].map((g) => (
            <button key={g} type="button" className={t.mode} aria-pressed={gear === g} onClick={() => setGear(g)}>
              {g ? `Gear +${g}` : "No gear"}
            </button>
          ))}
        </div>
        <div className={t.result} aria-live="polite">
          {data ? (
            <>
              <span key={mine!.id} className={t.total} data-testid="my-roll-total">
                {data.successes}
              </span>
              <NodeFaces key={`f${mine!.id}`} data={data} size={26} />
              <span className={t.trayLabel} data-testid="my-roll-words">
                {nodeWords(data)}
              </span>
            </>
          ) : (
            <span className={t.trayLabel}>
              Tap a stat or skill on your sheet. Wounds take {marks.wounds ? `${Math.min(3, marks.wounds)} dice` : "nothing"}; the Computer notices on {computerThreshold(marks.treason)}+.
            </span>
          )}
        </div>
        <button type="button" className={t.btn} disabled={live.busy} onClick={() => void roll(last)}>
          Roll again
        </button>
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

/** Your record on your phone: what the Computer knows, a new clone when you die, and treason reports. */
export function RecordCard({ live, c, marks, h }: { live: Live; c: Pick<Character, "mech" | "name">; marks: PMarks; h: HouseRules }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const others = live.people.filter((x) => x.handle !== live.you && x.characterId);
  const target = to || others[0]?.handle || "";
  const dead = marks.wounds >= DEAD;
  const out = marks.clone > CLONES;
  const reports = live.events.filter((e) => e.kind === "accuse" && e.mine);
  return (
    <div className={t.card} aria-label="Your record">
      <p className={t.title}>YOUR RECORD</p>
      <p className={t.prose}>
        <b data-testid="my-clone">{out ? "Out of clones" : cloneName(c.mech, marks.clone)}</b> · {WOUND_NAMES[marks.wounds]} · Moxie <b data-testid="my-moxie">{marks.moxie}</b> · {treasonNames(h)[marks.treason]} · {marks.xp} XP
      </p>
      {marks.moxie === 0 && <p className={t.error}>Moxie 0: you&apos;ve Lost It. Rampage until someone calms you down.</p>}
      {!out && (
        <div className={t.row}>
          <button
            type="button"
            className={dead ? t.btn : t.ghost}
            disabled={live.busy}
            onClick={async () => setProblem(await live.act({ type: "pmark", track: "clone", delta: 1 }))}
          >
            {dead ? "Decant my next clone" : "I died: next clone"}
          </button>
          <span className={t.hint} style={{ margin: 0 }}>
            {CLONES - marks.clone} left in the six-pack
          </span>
        </div>
      )}
      <p className={t.hint}>Tap the steps on your sheet for wounds and Moxie. Flags and XP Points are the Computer&apos;s to give.</p>
      {others.length > 0 && (
        <form
          className={t.row}
          onSubmit={async (e) => {
            e.preventDefault();
            const err = await live.act({ type: "accuse", to: target, text: why.trim() || "Suspicious behaviour" });
            setProblem(err ?? "Report filed. Friend Computer thanks you for your vigilance.");
            if (!err) setWhy("");
          }}
        >
          <select className={t.select} value={target} onChange={(e) => setTo(e.target.value)} aria-label="Report a teammate">
            {others.map((x) => (
              <option key={x.handle} value={x.handle}>
                {x.character ?? x.name}
              </option>
            ))}
          </select>
          <input className={t.select} value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="What did they do?" aria-label="The treason you saw" style={{ flex: 1, minWidth: 140 }} />
          <button type="submit" className={t.ghost} disabled={live.busy || !target}>
            Report treason
          </button>
        </form>
      )}
      {reports.length > 0 && (
        <p className={t.hint} data-testid="my-reports">
          You&apos;ve filed {reports.length} report{reports.length === 1 ? "" : "s"}. Only the Computer reads them.
        </p>
      )}
      {problem && <p className={t.hint}>{problem}</p>}
    </div>
  );
}

const TRACKS: { track: PTrack; label: string; step: number }[] = [
  { track: "treason", label: "Flag", step: 1 },
  { track: "wounds", label: "Wound", step: 1 },
  { track: "moxie", label: "Moxie", step: 1 },
  { track: "xp", label: "XP", step: 50 },
];

/**
 * Behind the screen: Friend Computer's voice (the mission's own lines or
 * anything typed), everyone's record with ± for each count and a clone's
 * death, and the treason reports nobody else can read.
 */
export function PaGmPanels({ os, live }: { os: { cast: Character[]; announcements: { id: string; text: string }[]; briefing: string; houseRules: HouseRules }; live: Live }) {
  const records = useRecords(live.events, os.cast, os.houseRules);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const players = live.people.filter((x) => x.characterId);
  const said = new Set(live.events.filter((e) => e.kind === "computer").map((e) => (e.data as { text: string }).text));
  const reports = live.events.filter((e) => e.kind === "accuse");
  const moves = live.events.filter((e) => e.kind === "tally").slice(-8).reverse();
  const say = async (line: string) => {
    const err = await live.act({ type: "computer", text: line });
    if (!err) await live.act({ type: "bell", preset: "chime", label: "Friend Computer" });
    setProblem(err);
  };
  const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
  const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;
  return (
    <>
      <div className={s.note} style={{ ["--tilt" as string]: "-0.5deg" }} aria-label="Friend Computer says">
        <span className={s.brassPin} aria-hidden="true" />
        <p className={s.noteTitle}>Friend Computer says</p>
        <ul className={s.yarnList}>
          {[{ id: "briefing", text: os.briefing }, ...os.announcements].map((a) => (
            <li key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ flex: 1, ...mono, fontSize: 14 }}>{a.text.length > 140 ? `${a.text.slice(0, 140)}…` : a.text}</span>
              <button type="button" className={t.ghost} disabled={live.busy} onClick={() => void say(a.text)} aria-label={`${said.has(a.text) ? "Say again" : "Say it"}: ${a.text.slice(0, 40)}`}>
                {said.has(a.text) ? "Say again" : "Say it"}
              </button>
            </li>
          ))}
        </ul>
        <form
          className={t.row}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            await say(text.trim());
            setText("");
          }}
        >
          <input className={t.select} value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Citizens, happiness is mandatory." aria-label="Something for Friend Computer to say" style={{ flex: 1, minWidth: 160 }} />
          <button type="submit" className={t.btn} disabled={live.busy}>
            Broadcast
          </button>
        </form>
        <p style={small}>It goes to every phone (with a chime) and the TV, in the Computer&apos;s own type.</p>
        {problem && <p className={t.error}>{problem}</p>}
      </div>

      <div className={s.note} style={{ ["--tilt" as string]: "0.6deg" }} aria-label="Records">
        <span className={s.pin} aria-hidden="true" />
        <p className={s.noteTitle}>Records</p>
        {players.length === 0 ? (
          <p style={mono}>Each Troubleshooter&apos;s record shows here once they accept their assignment.</p>
        ) : (
          <ul className={s.yarnList}>
            {players.map((x) => {
              const c = os.cast.find((y) => y.id === x.characterId)!;
              const m = marksFor(records, c);
              return (
                <li key={x.handle} data-testid={`gm-record-${c.id}`} data-treason={m.treason} data-clone={m.clone} data-wounds={m.wounds} data-moxie={m.moxie}>
                  <span className={s.yarn}>{personLabel(x)}</span>{" "}
                  <span style={small}>
                    {m.clone > CLONES ? "out of clones" : cloneName(c.mech, m.clone)} · {WOUND_NAMES[m.wounds]} · Moxie {m.moxie} · {treasonNames(os.houseRules)[m.treason]} · {m.xp} XP
                  </span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    {TRACKS.map(({ track, label, step }) => (
                      <span key={track} style={{ ...small, display: "inline-flex", gap: 2, alignItems: "center" }}>
                        {label}
                        <button type="button" className={t.ghost} style={{ minHeight: 24, padding: "0 7px" }} aria-label={`${label} down for ${c.name}`} disabled={live.busy} onClick={() => void live.act({ type: "pmark", track, delta: -step, to: x.handle })}>
                          −
                        </button>
                        <button type="button" className={t.ghost} style={{ minHeight: 24, padding: "0 7px" }} aria-label={`${label} up for ${c.name}`} disabled={live.busy} onClick={() => void live.act({ type: "pmark", track, delta: step, to: x.handle })}>
                          +
                        </button>
                      </span>
                    ))}
                    <button type="button" className={t.ghost} style={{ minHeight: 24, padding: "0 7px" }} disabled={live.busy || m.clone > CLONES} onClick={() => void live.act({ type: "pmark", track: "clone", delta: 1, to: x.handle })}>
                      Terminate: next clone
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {moves.length > 0 && (
          <ul style={{ ...small, margin: "8px 0 0", paddingLeft: 18 }}>
            {moves.map((e) => {
              const d = e.data as PTallyData;
              return (
                <li key={e.id}>
                  {d.name}: {d.track} {d.delta > 0 ? `+${d.delta}` : d.delta} ({d.why})
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={s.note} style={{ ["--tilt" as string]: "-0.4deg" }} aria-label="Treason reports">
        <span className={s.brassPin} aria-hidden="true" />
        <p className={s.noteTitle}>Treason reports</p>
        {reports.length === 0 ? (
          <p style={mono}>Reports Troubleshooters file on each other land here, for the Computer&apos;s eyes only.</p>
        ) : (
          <ul className={s.yarnList} data-testid="gm-reports">
            {reports
              .slice()
              .reverse()
              .map((e) => {
                const d = e.data as { fromName: string; toName: string; text: string };
                const accused = e.to && typeof e.to === "object" ? e.to.handle : null;
                return (
                  <li key={e.id}>
                    <span className={s.yarn}>
                      {d.fromName} → {d.toName}
                    </span>{" "}
                    <span style={mono}>&ldquo;{d.text}&rdquo;</span>
                    {accused && (
                      <button type="button" className={t.ghost} style={{ marginLeft: 6, minHeight: 24 }} disabled={live.busy} onClick={() => void live.act({ type: "pmark", track: "treason", delta: 1, to: accused })}>
                        Raise a Flag on {d.toName}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </>
  );
}
