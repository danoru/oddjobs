import { useState } from "react";
import { Button, IconButton, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { getAt, pathKey } from "@/lib/store/doc";
import type { OneShotDoc } from "@/lib/oneShotCheck";
import { FieldShell } from "../Fields";
import { useEditor } from "../EditorContext";
import s from "../Admin.module.css";

type Declared = { level?: number; note?: string };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The base mechanics moved to another level: the first class gains or loses the difference. The checks then point at HP and slots. */
function atLevel(mech: unknown, delta: number): Record<string, unknown> {
  const m = clone((mech ?? {}) as Record<string, unknown>);
  const classes = Array.isArray(m.classes) ? (m.classes as { level?: number }[]) : [];
  if (classes[0] && typeof classes[0].level === "number") classes[0].level = Math.max(1, Math.min(20, classes[0].level + delta));
  return m;
}

export function addLevel(doc: OneShotDoc, level: number): OneShotDoc {
  const base = typeof doc.oneshot.level === "number" ? doc.oneshot.level : level;
  const declared = (doc.oneshot.variants as Declared[] | undefined) ?? [];
  return {
    ...doc,
    oneshot: { ...doc.oneshot, variants: [...declared, { level }] },
    variants: [
      ...doc.variants.filter((v) => v.level !== level),
      { level, cast: doc.cast.map((c) => ({ id: c.id, mech: atLevel(c.mech, level - base) })) },
    ],
  };
}

function removeLevel(doc: OneShotDoc, index: number): OneShotDoc {
  const declared = (doc.oneshot.variants as Declared[] | undefined) ?? [];
  const level = declared[index]?.level;
  return {
    ...doc,
    oneshot: { ...doc.oneshot, variants: declared.filter((_, i) => i !== index) },
    variants: doc.variants.filter((v) => v.level !== level),
  };
}

function relevel(doc: OneShotDoc, index: number, level: number): OneShotDoc {
  const declared = [...((doc.oneshot.variants as Declared[] | undefined) ?? [])];
  const old = declared[index]?.level;
  declared[index] = { ...declared[index], level };
  return {
    ...doc,
    oneshot: { ...doc.oneshot, variants: declared },
    variants: doc.variants.map((v) => (v.level === old ? { ...v, level } : v)),
  };
}

/**
 * Level variants: the same story at other levels. Adding a level copies
 * every character's mechanics with the first class moved by the
 * difference; each character's Mechanics section then has a tab per level,
 * where the HP and slot helpers fix the rest.
 */
export function Levels5e() {
  const { doc, update, set, readOnly } = useEditor();
  const base = typeof doc.oneshot.level === "number" ? doc.oneshot.level : undefined;
  const declared = (getAt(doc, ["oneshot", "variants"]) as Declared[] | undefined) ?? [];
  const [next, setNext] = useState<number | "">("");
  const taken = new Set([base, ...declared.map((d) => d.level)]);
  const canAdd = typeof next === "number" && next >= 1 && next <= 20 && !taken.has(next);

  return (
    <div className={s.group} style={{ marginTop: 16 }}>
      <span className={s.legend}>Level variants {base !== undefined && `(written for level ${base})`}</span>
      {declared.length === 0 && <span className={s.muted}>Only the written level. Add one to play the same story at another level.</span>}
      {declared.map((d, i) => (
        <FieldShell key={i} path={["oneshot", "variants", i]} wide>
          <div className={s.lineRow}>
            <FieldShell path={["oneshot", "variants", i, "level"]}>
              <TextField
                size="small"
                type="number"
                label="Level"
                value={d.level ?? ""}
                disabled={readOnly}
                sx={{ width: 100 }}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) update((x) => relevel(x, i, n));
                }}
                slotProps={{ htmlInput: { "data-field": pathKey(["oneshot", "variants", i, "level"]) } }}
              />
            </FieldShell>
            <TextField
              size="small"
              fullWidth
              label="Note on the level stamp"
              value={d.note ?? ""}
              disabled={readOnly}
              helperText={`${(d.note ?? "").length}/140`}
              onChange={(e) => set(["oneshot", "variants", i, "note"], e.target.value || undefined)}
            />
            {!readOnly && (
              <IconButton aria-label={`Remove level ${d.level}`} onClick={() => update((x) => removeLevel(x, i))}>
                <DeleteOutlineIcon />
              </IconButton>
            )}
          </div>
        </FieldShell>
      ))}
      {!readOnly && (
        <div className={s.lineRow}>
          <TextField
            size="small"
            type="number"
            label="Another level"
            value={next}
            sx={{ width: 150 }}
            onChange={(e) => setNext(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
            slotProps={{ htmlInput: { min: 1, max: 20, "data-field": "add-level" } }}
          />
          <Button
            startIcon={<AddIcon />}
            disabled={!canAdd}
            onClick={() => {
              if (typeof next === "number") update((x) => addLevel(x, next));
              setNext("");
            }}
          >
            Add level
          </Button>
        </div>
      )}
    </div>
  );
}
