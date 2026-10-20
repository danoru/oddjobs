import { useState } from "react";
import type { useLive } from "@/lib/useLive";
import { personLabel } from "@/lib/live";
import type * as daggerheart from "@/systems/daggerheart/schema";
import { MAX_FEAR, MAX_HOPE } from "@/systems/daggerheart/srd";
import { maxFor, type TallyData, type Track } from "@/systems/daggerheart/live";
import { FearPool, noMarks, tallyWords, useTallies } from "./Table";
import t from "@/components/table/Toys.module.css";
import s from "@/components/board/Board.module.css";

type Live = ReturnType<typeof useLive>;

const mono = { fontFamily: "var(--font-print)", fontSize: 16 } as const;
const small = { fontFamily: "var(--font-label)", fontSize: 13, color: "var(--ink-soft)" } as const;
const TRACKS: { track: Track; label: string }[] = [
  { track: "hope", label: "Hope" },
  { track: "stress", label: "Stress" },
  { track: "hp", label: "HP marked" },
  { track: "armor", label: "Armor marked" },
];

/**
 * Daggerheart behind the screen, on the table's event log: the GM's Fear
 * (gain, spend, the opening Fear), everyone's Hope and marks (the GM can
 * correct any of them), what moved them, and tonight's adversaries with
 * their attacks rolled behind the screen.
 */
export function DhGmPanels({ os, live }: { os: daggerheart.OneShotWithCast; live: Live }) {
  const tallies = useTallies(live.events, os.cast);
  const [problem, setProblem] = useState<string | null>(null);
  const players = live.people.filter((p) => p.characterId);
  const moves = live.events.filter((e) => e.kind === "tally").slice(-8).reverse();
  const opened = live.events.some((e) => e.kind === "tally" && (e.data as TallyData).why === "the opening Fear");

  const fear = async (delta: number) => {
    setProblem(await live.act({ type: "fear", delta }));
  };

  return (
    <>
      <div className={s.note} style={{ ["--tilt" as string]: "-0.5deg" }} aria-label="Fear">
        <span className={s.brassPin} aria-hidden="true" />
        <p className={s.noteTitle}>Fear</p>
        <p style={{ ...mono, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b data-testid="gm-fear" style={{ fontSize: 28, fontFamily: "var(--font-poster)" }}>
            {tallies.fear}
          </b>
          <FearPool n={tallies.fear} size={16} />
        </p>
        <div className={t.row}>
          <button type="button" className={t.btn} disabled={live.busy || tallies.fear < 1} onClick={() => void fear(-1)}>
            Spend a Fear
          </button>
          <button type="button" className={t.ghost} disabled={live.busy || tallies.fear >= MAX_FEAR} onClick={() => void fear(1)}>
            Gain one
          </button>
          {!opened && players.length > 0 && (
            <button type="button" className={t.ghost} disabled={live.busy} onClick={async () => setProblem(await live.act({ type: "fear", delta: players.length, opening: true }))}>
              Take the opening Fear ({players.length})
            </button>
          )}
        </div>
        <p style={small}>
          Every roll with Fear adds one here by itself. You start a new story with one Fear per player; spend them to interrupt, make an extra move or use an
          adversary&apos;s Fear feature. At most {MAX_FEAR}. The TV and the phones show the pool.
        </p>
        {problem && <p className={t.error}>{problem}</p>}
      </div>

      <div className={s.note} style={{ ["--tilt" as string]: "0.6deg" }} aria-label="The party">
        <span className={s.pin} aria-hidden="true" />
        <p className={s.noteTitle}>Hope and harm</p>
        {players.length === 0 ? (
          <p style={mono}>Each character&apos;s Hope, Stress, Hit Points and Armor show here once their poster is torn.</p>
        ) : (
          <ul className={s.yarnList}>
            {players.map((p) => {
              const c = os.cast.find((x) => x.id === p.characterId)!;
              const m = tallies.marks[c.id] ?? noMarks;
              return (
                <li key={p.handle} data-testid={`gm-marks-${c.id}`} data-hope={m.hope} data-stress={m.stress} data-hp={m.hp}>
                  <span className={s.yarn}>{personLabel(p)}</span>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    {TRACKS.map(({ track, label }) => {
                      const max = maxFor(track, { hp: c.mech.hp, stress: c.mech.stress, armor: c.mech.armorScore });
                      return (
                        <span key={track} style={{ ...small, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {label} {m[track]}/{track === "hope" ? MAX_HOPE : max}
                          <button type="button" className={t.ghost} style={{ minHeight: 24, padding: "0 7px" }} aria-label={`${label} down for ${c.name}`} disabled={live.busy || m[track] <= 0} onClick={() => void live.act({ type: "mark", track, delta: -1, to: p.handle })}>
                            −
                          </button>
                          <button type="button" className={t.ghost} style={{ minHeight: 24, padding: "0 7px" }} aria-label={`${label} up for ${c.name}`} disabled={live.busy || m[track] >= max} onClick={() => void live.act({ type: "mark", track, delta: 1, to: p.handle })}>
                            +
                          </button>
                        </span>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {moves.length > 0 && (
          <ul style={{ ...small, margin: "8px 0 0", paddingLeft: 18 }} data-testid="gm-tallies">
            {moves.map((e) => (
              <li key={e.id}>{tallyWords(e.data as TallyData)}</li>
            ))}
          </ul>
        )}
      </div>

      {os.adversaries.length > 0 && <Adversaries os={os} live={live} />}
    </>
  );
}

/**
 * Tonight's foes: their numbers, and (at a table) their attacks rolled behind
 * the screen, a d20 plus the modifier against Evasion.
 */
export function Adversaries({ os, live }: { os: daggerheart.OneShotWithCast; live: Live | null }) {
  const [problem, setProblem] = useState<string | null>(null);
  const attack = async (a: daggerheart.Adversary) =>
    live && setProblem(await live.act({ type: "roll", label: `${a.name}: ${a.attack.name}`, count: 1, sides: 20, mod: a.attack.mod, mode: "normal", hidden: true }));
  const damage = async (a: daggerheart.Adversary) => {
    const m = a.attack.damage.replace(/\s+/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) return setProblem(`${a.name} deals a flat ${a.attack.damage}`);
    if (live) setProblem(await live.act({ type: "roll", label: `${a.name} damage`, count: Number(m[1] || 1), sides: Number(m[2]), mod: Number(m[3] ?? 0), mode: "normal", hidden: true }));
  };
  return (
    <div className={s.note} style={{ ["--tilt" as string]: "-0.4deg", gridColumn: "1 / -1" }} aria-label="Adversaries">
      <span className={s.pin} aria-hidden="true" />
      <p className={s.noteTitle}>Adversaries</p>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        {os.adversaries.map((a) => (
          <div key={a.id} style={{ borderTop: "1px dashed var(--ink-soft)", paddingTop: 6 }} data-testid={`adversary-${a.id}`}>
            <div style={{ ...mono, fontWeight: 700 }}>
              {a.name} <span style={small}>· tier {a.tier} {a.type}</span>
            </div>
            {a.description && <div style={{ ...mono, fontSize: 14 }}>{a.description}</div>}
            <div style={small}>
              Difficulty {a.difficulty} · {a.thresholds ? `thresholds ${a.thresholds.major}/${a.thresholds.severe}` : "no thresholds"} · {a.hp} HP · {a.stress} Stress
            </div>
            <div style={small}>
              {a.attack.name}: {a.attack.mod >= 0 ? `+${a.attack.mod}` : a.attack.mod} · {a.attack.range} · {a.attack.damage} {a.attack.damageType === "magic" ? "mag" : "phy"}
            </div>
            {a.motives && <div style={{ ...small, fontStyle: "italic" }}>{a.motives}</div>}
            {a.features.map((f) => (
              <div key={f.name} style={{ ...mono, fontSize: 14 }}>
                <b>{f.name}.</b> {f.text}
              </div>
            ))}
            {live && (
              <div className={t.row}>
                <button type="button" className={t.ghost} disabled={live.busy} onClick={() => void attack(a)}>
                  Roll attack
                </button>
                <button type="button" className={t.ghost} disabled={live.busy} onClick={() => void damage(a)}>
                  Roll damage
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p style={small}>{live ? "Attacks roll behind the screen; show them from the dice tray if you like." : "Open a table to roll their attacks behind the screen."}</p>
      {problem && <p className={t.error}>{problem}</p>}
    </div>
  );
}
