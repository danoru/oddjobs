import { Button } from "@mui/material";
import SortIcon from "@mui/icons-material/Sort";
import { getAt } from "@/lib/store/doc";
import { useEditor } from "../EditorContext";
import s from "../Admin.module.css";

type Stage = { title?: string; candles?: number };

/**
 * Ten Candles pacing at a glance: the ten candles, and which stage of the
 * module is in force while each count is still lit. Stages run from ten
 * candles down; each lasts until the next one starts.
 */
export function TcStages() {
  const { doc, set, readOnly } = useEditor();
  const stages = ((getAt(doc, ["oneshot", "module", "stages"]) as Stage[] | undefined) ?? []).filter(
    (x) => x && typeof x === "object",
  );
  const counts = stages.map((x) => x.candles).filter((n): n is number => typeof n === "number");
  const sorted = counts.every((n, i) => i === 0 || n <= counts[i - 1]);
  const stageAt = (lit: number) => {
    // The stage with the smallest start that is still >= lit.
    const fits = stages.filter((x) => typeof x.candles === "number" && x.candles >= lit);
    return fits.sort((a, b) => a.candles! - b.candles!)[0];
  };
  if (!stages.length) return <p className={s.muted}>Add stages to see how the night is paced by candlelight.</p>;
  return (
    <div className={s.wide}>
      <span className={s.legend}>The night by candlelight</span>
      <div className={s.candles} aria-label="Which stage is in force at each number of lit candles">
        {Array.from({ length: 10 }, (_, i) => 10 - i).map((lit) => {
          const st = stageAt(lit);
          const starts = stages.some((x) => x.candles === lit);
          return (
            <div key={lit} className={`${s.candle} ${starts ? s.candleStart : ""}`}>
              <div className={s.candleBody} aria-hidden="true" />
              {lit}
              <div className={s.candleStage}>{starts ? (st?.title ?? "untitled") : st ? "" : "—"}</div>
            </div>
          );
        })}
      </div>
      {!sorted && !readOnly && (
        <Button
          size="small"
          startIcon={<SortIcon />}
          onClick={() =>
            set(
              ["oneshot", "module", "stages"],
              [...stages].sort((a, b) => (b.candles ?? 0) - (a.candles ?? 0)),
            )
          }
        >
          Sort stages from ten candles down
        </Button>
      )}
    </div>
  );
}
