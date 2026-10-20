import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveEvent } from "@/lib/live";
import type { useLive } from "@/lib/useLive";
import { useShake } from "@/lib/shake";
import type { Character } from "@/systems/daggerheart/schema";
import { hpFor, sheetLimits, signed } from "@/systems/daggerheart/derive";
import { foldTallies, dualityWords, type DualityData, type Marks, type Tallies, type TallyData } from "@/systems/daggerheart/live";
import { STARTING_HOPE } from "@/systems/daggerheart/srd";
import type { DhRoll } from "@/systems/daggerheart/rolls";
import type { RollData } from "@/lib/live";
import { DiceFaces, rollWords } from "@/components/table/TableToys";
import t from "@/components/table/Toys.module.css";
import d from "./Dh.module.css";
import { DualityFaces, FearPool, OutcomeWord } from "./Dice";

export { DualityFaces, FearPool, OutcomeWord };

/**
 * Daggerheart on a phone at the table, and the pieces the GM page and the TV
 * share: the duality dice, the Fear pool, and everyone's Hope, Stress, Hit
 * Points and Armor folded from the event log (src/systems/daggerheart/live.ts).
 */

type Live = ReturnType<typeof useLive>;

/** Hope, Fear and marks for a cast, from what this viewer was sent. */
export function useTallies(events: LiveEvent[], cast: readonly Pick<Character, "id" | "mech">[]): Tallies {
  const limits = useMemo(() => sheetLimits(cast), [cast]);
  return useMemo(() => foldTallies(events, limits), [events, limits]);
}

export const noMarks: Marks = { hope: STARTING_HOPE, stress: 0, hp: 0, armor: 0 };

/**
 * The tray along the bottom of a Daggerheart sheet at a table. Tap a trait or
 * a weapon on the sheet to roll it: Hope and Fear are rolled on the server,
 * and the Hope (yours) or Fear (the GM's) it earns lands at once. Pick
 * advantage, Experiences (a Hope each) or a reaction roll first; shake to roll
 * the last one again.
 */
export function DualityTray({ live, armed, c, marks }: { live: Live; armed: DhRoll | null; c: Character; marks: Marks }) {
  const [adv, setAdv] = useState<-1 | 0 | 1>(0);
  const [exps, setExps] = useState<string[]>([]);
  const [reaction, setReaction] = useState(false);
  const [last, setLast] = useState<DhRoll>(armed ?? { kind: "duality", label: "Duality dice", mod: 0 });
  const mine = live.fold.rolls.filter((e) => e.mine && e.data).at(-1);
  const data = mine?.data as DualityData | RollData | undefined;

  async function roll(r: DhRoll) {
    setLast(r);
    if (r.kind === "damage") {
      await live.act({ type: "roll", label: r.label, count: r.count, sides: r.sides, mod: r.mod, mode: "normal" });
      return;
    }
    const err = await live.act({ type: "duality", label: r.label, mod: r.mod, adv, experiences: exps, reaction });
    if (!err) {
      setExps([]);
      setReaction(false);
      setAdv(0);
    }
  }
  const shake = useShake(() => void roll(last), !live.busy);

  const seen = useRef<DhRoll | null>(null);
  useEffect(() => {
    if (armed && armed !== seen.current) {
      seen.current = armed;
      void roll(armed);
    }
    // Only a new tap on the sheet should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  const spend = exps.length;
  return (
    <div className={`${t.tray} no-print`} role="region" aria-label="Duality dice tray">
      <div className={t.trayInner}>
        <div className={t.modes} role="group" aria-label="Advantage">
          {([-1, 0, 1] as const).map((m) => (
            <button key={m} type="button" className={t.mode} aria-pressed={adv === m} onClick={() => setAdv(m)}>
              {m === -1 ? "Disadv. −d6" : m === 1 ? "Advantage +d6" : "Normal"}
            </button>
          ))}
        </div>
        <div className={d.chips} role="group" aria-label="Add an Experience (a Hope each)">
          {c.mech.experiences.map((e) => {
            const on = exps.includes(e.name);
            return (
              <button
                key={e.name}
                type="button"
                className={d.chip}
                aria-pressed={on}
                disabled={!on && spend + 1 > marks.hope}
                onClick={() => setExps((xs) => (on ? xs.filter((x) => x !== e.name) : [...xs, e.name]))}
              >
                {e.name} {signed(e.bonus)}
              </button>
            );
          })}
          <button type="button" className={d.chip} aria-pressed={reaction} onClick={() => setReaction((r) => !r)} title="A reaction roll earns no Hope or Fear">
            Reaction
          </button>
        </div>
        <div className={t.result} aria-live="polite">
          {data && data.system === "duality" ? (
            <>
              <span key={mine!.id} className={t.total} data-testid="my-roll-total">
                {data.total}
              </span>
              <DualityFaces key={`f${mine!.id}`} data={data} size={30} />
              <span className={t.trayLabel} data-testid="my-roll-outcome">
                <OutcomeWord data={data} />
                <span className={d.slotsNote} style={{ color: "inherit", display: "block" }}>
                  {dualityWords(data)}
                </span>
              </span>
            </>
          ) : data && data.system === "d20" ? (
            <>
              <span key={mine!.id} className={t.total} data-testid="my-roll-total">
                {data.total}
              </span>
              <DiceFaces data={data} size={26} />
              <span className={t.trayLabel}>{rollWords(data)}</span>
            </>
          ) : (
            <span className={t.trayLabel}>Tap a trait or a weapon on your sheet to roll.</span>
          )}
        </div>
        <button type="button" className={t.btn} disabled={live.busy} onClick={() => void roll(last)}>
          {last.kind === "duality" && last.label === "Duality dice" ? "Roll Hope & Fear" : "Roll again"}
          {spend ? ` (−${spend} Hope)` : ""}
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

/**
 * Take damage: type what hit you, see which threshold it reaches, choose to
 * mark an Armor Slot to drop it a step, and mark the Hit Points.
 */
export function DamageCard({ live, c, marks, fear }: { live: Live; c: Character; marks: Marks; fear: number }) {
  const [dmg, setDmg] = useState("");
  const [armor, setArmor] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const n = Number(dmg) || 0;
  const raw = hpFor(n, c.mech.thresholds);
  const canArmor = marks.armor < c.mech.armorScore && raw > 0;
  const hp = Math.max(0, raw - (armor && canArmor ? 1 : 0));
  const band = ["no", "Minor", "Major", "Severe"][raw];

  async function take() {
    let err: string | null = null;
    if (armor && canArmor) err = await live.act({ type: "mark", track: "armor", delta: 1 });
    if (!err && hp > 0) err = await live.act({ type: "mark", track: "hp", delta: hp });
    setProblem(err);
    if (!err) {
      setDmg("");
      setArmor(false);
    }
  }

  return (
    <div className={t.card} aria-label="At the table">
      <p className={t.title}>HOPE, FEAR AND HARM</p>
      <p className={t.prose} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>
          Your Hope: <b data-testid="my-hope">{marks.hope}</b> · Stress {marks.stress}/{c.mech.stress} · HP marked {marks.hp}/{c.mech.hp}
        </span>
        <span>
          The GM holds <b data-testid="phone-fear">{fear}</b> Fear <FearPool n={fear} size={12} />
        </span>
      </p>
      <p className={t.hint}>Tap the slots on your sheet to mark Hit Points, Stress, Armor and Hope. Or work out a hit here:</p>
      <div className={t.row}>
        <label className={t.hint} style={{ margin: 0 }}>
          Damage{" "}
          <input className={t.select} style={{ width: 72 }} inputMode="numeric" value={dmg} onChange={(e) => setDmg(e.target.value.replace(/\D/g, ""))} aria-label="Damage taken" />
        </label>
        <span className={t.hint} style={{ margin: 0 }} data-testid="damage-band">
          {n > 0 ? `${band}: mark ${raw} HP` : `Major at ${c.mech.thresholds.major}, Severe at ${c.mech.thresholds.severe}`}
        </span>
        {raw > 0 && (
          <label className={t.hint} style={{ margin: 0 }}>
            <input type="checkbox" checked={armor && canArmor} disabled={!canArmor} onChange={(e) => setArmor(e.target.checked)} /> Mark an Armor Slot (−1)
          </label>
        )}
        <button type="button" className={t.btn} disabled={live.busy || n <= 0} onClick={() => void take()}>
          Mark {hp} HP
        </button>
      </div>
      {problem && <p className={t.error}>{problem}</p>}
    </div>
  );
}

/** A tally in a line, for the GM's log. */
export function tallyWords(x: TallyData): string {
  const what = x.track === "fear" ? "Fear" : x.track === "hp" ? "Hit Points" : x.track === "armor" ? "Armor Slots" : x.track === "hope" ? "Hope" : "Stress";
  const n = Math.abs(x.delta);
  const verb = x.track === "hope" || x.track === "fear" ? (x.delta > 0 ? "gains" : "spends") : x.delta > 0 ? "marks" : "clears";
  return `${x.name ?? "Someone"} ${verb} ${n} ${what}${x.why && x.why !== "ticked" ? ` (${x.why})` : ""}`;
}
