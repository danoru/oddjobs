import type { NodeData } from "@/systems/paranoia/live";
import p from "./Pa.module.css";

/** A NODE roll's dice: the pool, any anti-dice, and the Computer die (lit when it noticed). */
export function NodeFaces({ data, size = 28 }: { data: NodeData; size?: number }) {
  const st = (i: number) => ({ ["--i" as string]: i, ["--size" as string]: `${size}px` });
  return (
    <span className={p.dice} aria-label={`Dice ${data.dice.join(", ") || "none"}${data.anti.length ? `, anti-dice ${data.anti.join(", ")}` : ""}; Computer die ${data.computer}`}>
      {data.dice.map((v, i) => (
        <span key={`d${i}`} className={p.die} data-hit={v >= 5} style={st(i)}>
          {v}
        </span>
      ))}
      {data.anti.map((v, i) => (
        <span key={`a${i}`} className={`${p.die} ${p.anti}`} data-hit={v >= 5} style={st(data.dice.length + i)} title="Anti-die">
          {v}
        </span>
      ))}
      <span className={`${p.die} ${p.computerDie}`} data-noticed={data.noticed} style={st(data.dice.length + data.anti.length)} title="The Computer die">
        {data.noticed ? "C" : data.computer}
      </span>
    </span>
  );
}

