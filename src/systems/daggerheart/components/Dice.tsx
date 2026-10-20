import type { DualityData } from "@/systems/daggerheart/live";
import { MAX_FEAR } from "@/systems/daggerheart/srd";
import d from "./Dh.module.css";

/** Daggerheart's dice faces and the Fear pool, for the phone, the GM page and the TV. */

/** The Hope and Fear dice of a roll, tumbling in, the winner ringed. */
export function DualityFaces({ data, size = 34 }: { data: DualityData; size?: number }) {
  const style = (i: number) => ({ ["--i" as string]: i, ["--size" as string]: `${size}px` });
  return (
    <span className={d.duality} aria-label={`Hope die ${data.hope}, Fear die ${data.fear}${data.adv ? `, ${data.adv.sign > 0 ? "advantage" : "disadvantage"} ${data.adv.value}` : ""}`}>
      <span className={`${d.d12} ${d.hopeDie}`} style={style(0)} data-won={data.outcome !== "fear"} title="Hope die">
        {data.hope}
      </span>
      <span className={`${d.d12} ${d.fearDie}`} style={style(1)} data-won={data.outcome !== "hope"} title="Fear die">
        {data.fear}
      </span>
      {data.adv && (
        <span className={d.advDie} style={style(2)} title={data.adv.sign > 0 ? "Advantage" : "Disadvantage"}>
          {data.adv.sign > 0 ? "+" : "−"}
          {data.adv.value}
        </span>
      )}
    </span>
  );
}

/** "with Hope" in gold, "with Fear" in violet, a critical in light. */
export function OutcomeWord({ data }: { data: DualityData }) {
  if (data.outcome === "crit") return <span className={d.crit}>Critical success!</span>;
  return <span className={data.outcome === "hope" ? d.withHope : d.withFear}>with {data.outcome === "hope" ? "Hope" : "Fear"}</span>;
}

/** The GM's Fear as dark stones, up to twelve. */
export function FearPool({ n, size = 18, label = "The GM's Fear" }: { n: number; size?: number; label?: string }) {
  return (
    <span className={d.fearPool} role="img" aria-label={`${label}: ${n} of ${MAX_FEAR}`} data-testid="fear-pool" data-fear={n}>
      {Array.from({ length: MAX_FEAR }, (_, i) => (
        <span key={i} className={d.fearStone} data-on={i < n} style={{ ["--size" as string]: `${size}px` }} />
      ))}
    </span>
  );
}

