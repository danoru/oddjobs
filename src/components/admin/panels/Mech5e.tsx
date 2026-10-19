import { useEffect, useMemo, useState } from "react";
import { Button, Chip, FormControlLabel, MenuItem, Switch, TextField, Tooltip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { getAt, pathKey } from "@/lib/store/doc";
import type { DocPath, OneShotDoc } from "@/lib/oneShotCheck";
import { ABILITIES, SKILLS, type Ability, type Ruleset, type Skill } from "@/systems/dnd5e/schema";
import { ABILITY_NAMES, SKILL_NAMES, ordinal, signed, totalLevel } from "@/systems/dnd5e/derive";
import {
  CLASS_PRIORITY,
  CLASS_SAVES,
  POINT_BUY_BUDGET,
  asCharacter,
  castingAbility,
  deriveLoose,
  hpBreakdown,
  isStandardArray,
  looseMech,
  pointBuyCost,
  rankAbilities,
  standardArray,
  suggestedSlots,
} from "@/systems/dnd5e/editorMath";
import { Field, FieldShell, useIssuesAt } from "../Fields";
import { useEditor } from "../EditorContext";
import s from "../Admin.module.css";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Where a character's mechanics live at a level: the base file, or that level's variant file (null if missing). */
export function mechPath(doc: OneShotDoc, index: number, level: number | null): DocPath | null {
  if (level === null) return ["cast", index, "mech"];
  const id = doc.cast[index]?.id;
  const vi = doc.variants.findIndex((v) => v.level === level);
  if (vi < 0) return null;
  const j = doc.variants[vi].cast.findIndex((c) => c.id === id);
  return j < 0 ? null : ["variants", vi, "cast", j, "mech"];
}

/**
 * The 5e mechanics of one character, with the rules worked out live: the
 * standard array and point buy, modifiers, saves, skills, passives and spell
 * DC from derive(), fixed-average HP from the hit dice and Con, the class
 * table's spell slots, and each attack's to-hit and damage. With level
 * variants there's a tab per level.
 */
export function Mech5e({ index, level, onLevel }: { index: number; level: number | null; onLevel: (l: number | null) => void }) {
  const ctx = useEditor();
  const { doc, update } = ctx;
  const ruleset: Ruleset = doc.oneshot.ruleset === "2014" ? "2014" : "2024";
  const baseLevel = typeof doc.oneshot.level === "number" ? doc.oneshot.level : undefined;
  const declared = ((doc.oneshot.variants as { level?: number }[] | undefined) ?? []).map((v) => v.level).filter((n): n is number => typeof n === "number");
  const shown = level !== null && declared.includes(level) ? level : null;
  const mp = mechPath(doc, index, shown);
  const char = doc.cast[index];

  if (!char) return null;
  return (
    <div className={s.wide}>
      {declared.length > 0 && (
        <div className={s.levelTabs} role="tablist" aria-label="Mechanics at each level">
          {[null, ...declared].map((l) => (
            <Chip
              key={String(l)}
              role="tab"
              aria-selected={shown === l}
              label={l === null ? `Level ${baseLevel ?? "?"} (as written)` : `Level ${l}`}
              color={shown === l ? "secondary" : "default"}
              variant={shown === l ? "filled" : "outlined"}
              onClick={() => onLevel(l)}
            />
          ))}
        </div>
      )}
      {mp ? (
        <MechBody mp={mp} ruleset={ruleset} targetLevel={shown ?? baseLevel} />
      ) : (
        <div className={s.ruleNote}>
          {char.name ? String(char.name) : "This character"} has no mechanics at level {shown} yet.{" "}
          {!ctx.readOnly && (
            <Button
              size="small"
              onClick={() =>
                update((d) => {
                  const vi = d.variants.findIndex((v) => v.level === shown);
                  const entry = { id: char.id, mech: clone(char.mech ?? {}) };
                  const variants =
                    vi < 0
                      ? [...d.variants, { level: shown!, cast: [entry] }]
                      : d.variants.map((v, i) => (i === vi ? { ...v, cast: [...v.cast, entry] } : v));
                  return { ...d, variants };
                })
              }
            >
              Copy them from the written level
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function MechBody({ mp, ruleset, targetLevel }: { mp: DocPath; ruleset: Ruleset; targetLevel?: number }) {
  const { doc } = useEditor();
  const raw = getAt(doc, mp);
  const mech = useMemo(() => looseMech(raw), [raw]);
  const d = useMemo(() => deriveLoose(raw), [raw]);
  const level = mech.classes.length ? totalLevel(asCharacter(mech)) : 0;
  const firstClass = mech.classes[0]?.name.toLowerCase() ?? "";
  const at = (...k: (string | number)[]) => [...mp, ...k];

  return (
    <>
      <div className={s.grid}>
        <Field path={at("species")} />
        <Field path={at("lineage")} />
        <Field path={at("size")} />
        <Field path={at("background")} />
      </div>

      <h4 className={s.subhead}>Class and level</h4>
      <div className={s.grid}>
        <Field path={at("classes")} />
      </div>
      <p className={s.ruleNote}>
        Total level {level || "?"}
        {targetLevel !== undefined && (level === targetLevel ? ` ✓ matches the one-shot (level ${targetLevel}).` : `, but this should be level ${targetLevel}.`)}{" "}
        Proficiency bonus {d ? signed(d.prof) : "?"}.
      </p>

      <h4 className={s.subhead}>Ability scores</h4>
      <Abilities mp={mp} firstClass={firstClass} />

      <h4 className={s.subhead}>Saves and skills</h4>
      <Saves mp={mp} firstClass={firstClass} />
      <Skills mp={mp} />

      {d && (
        <div className={s.derived} style={{ marginTop: 12 }} aria-label="Worked out from the scores">
          <span className={s.derivedItem}>
            Initiative <span className={s.derivedValue}>{signed(d.initiative)}</span>
          </span>
          <span className={s.derivedItem}>
            Passive Perception <span className={s.derivedValue}>{d.passive.perception}</span>
          </span>
          <span className={s.derivedItem}>
            Passive Insight <span className={s.derivedValue}>{d.passive.insight}</span>
          </span>
          <span className={s.derivedItem}>
            Passive Investigation <span className={s.derivedValue}>{d.passive.investigation}</span>
          </span>
          {d.spell && (
            <>
              <span className={s.derivedItem}>
                Spell save DC <span className={s.derivedValue}>{d.spell.dc}</span>
              </span>
              <span className={s.derivedItem}>
                Spell attack <span className={s.derivedValue}>{signed(d.spell.attack)}</span>
              </span>
            </>
          )}
        </div>
      )}

      <h4 className={s.subhead}>Hit points and armor</h4>
      <HitPoints mp={mp} ruleset={ruleset} />
      <div className={s.grid} style={{ marginTop: 12 }}>
        <Field path={at("ac", "value")} label="Armor Class" />
        <Field path={at("ac", "note")} label="How the AC adds up" wide={false} />
        <Field path={at("speed")} />
        <Field path={at("initiativeBonus")} />
      </div>

      <h4 className={s.subhead}>Training, languages and feats</h4>
      <div className={s.grid}>
        <Field path={at("languages")} />
        <Field path={at("tools")} />
        <Field path={at("armorTraining")} />
        <Field path={at("weaponTraining")} />
        <Field path={at("senses")} />
        <Field path={at("feats")} />
        {(ruleset === "2024" || getAt(doc, at("originFeat")) !== undefined) && <Field path={at("originFeat")} />}
        {(ruleset === "2024" || mech.weaponMasteries.length > 0) && <Field path={at("weaponMasteries")} />}
      </div>

      <h4 className={s.subhead}>Spellcasting</h4>
      <Spellcasting mp={mp} ruleset={ruleset} />

      <h4 className={s.subhead}>Attacks</h4>
      <div className={s.grid}>
        <Field path={at("attacks")} label="Attacks (each shows its to-hit and damage)" />
      </div>

      <h4 className={s.subhead}>Features</h4>
      <div className={s.grid}>
        <Field path={at("features")} />
      </div>

      <h4 className={s.subhead}>Equipment</h4>
      <div className={s.grid}>
        <Field path={at("equipment")} />
        <Field path={at("gold")} />
      </div>
    </>
  );
}

// ---- Abilities ------------------------------------------------------------------

function Abilities({ mp, firstClass }: { mp: DocPath; firstClass: string }) {
  const { doc, set, readOnly } = useEditor();
  const scores = (getAt(doc, [...mp, "abilities"]) as Partial<Record<Ability, number>> | undefined) ?? {};
  const cost = pointBuyCost(scores);
  const standard = isStandardArray(scores);
  const priority = CLASS_PRIORITY[firstClass];
  const problems = useIssuesAt([...mp, "abilities"]);
  const setAll = (v: Record<Ability, number>) => set([...mp, "abilities"], { ...scores, ...v });

  return (
    <FieldShell path={[...mp, "abilities"]} wide>
      <div className={s.abilityRow}>
        {ABILITIES.map((a) => {
          const v = scores[a];
          const mod = typeof v === "number" ? Math.floor((v - 10) / 2) : null;
          return (
            <label key={a} className={s.abilityBox}>
              <div className={s.abilityName}>{ABILITY_NAMES[a].slice(0, 3)}</div>
              <div className={s.abilityMod} aria-label={`${ABILITY_NAMES[a]} modifier`}>
                {mod === null ? "–" : signed(mod)}
              </div>
              <input
                className={s.abilityInput}
                type="number"
                min={1}
                max={30}
                value={typeof v === "number" ? v : ""}
                aria-label={`${ABILITY_NAMES[a]} score`}
                aria-invalid={problems.length > 0 || undefined}
                disabled={readOnly}
                data-field={pathKey([...mp, "abilities", a])}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  set([...mp, "abilities", a], Number.isFinite(n) ? n : undefined);
                }}
              />
            </label>
          );
        })}
      </div>
      <div className={s.helperRow}>
        {!readOnly && (
          <>
            <Tooltip title="15, 14, 13, 12, 10, 8, keeping the order your scores are in now">
              <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} onClick={() => setAll(standardArray(rankAbilities(scores)))}>
                Standard array (keep order)
              </Button>
            </Tooltip>
            {priority && (
              <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} onClick={() => setAll(standardArray(priority))}>
                Standard array for a {firstClass}
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              onClick={() => setAll(Object.fromEntries(ABILITIES.map((a) => [a, 8])) as Record<Ability, number>)}
            >
              Start point buy (all 8s)
            </Button>
          </>
        )}
        <span>
          {standard ? "✓ The standard array. " : ""}
          {cost === null
            ? "Point buy: some scores are outside 8–15 (fine once bonuses are in)."
            : `Point buy: ${cost} of ${POINT_BUY_BUDGET} points${cost > POINT_BUY_BUDGET ? " — over budget" : cost === POINT_BUY_BUDGET ? " ✓" : ""}.`}
        </span>
      </div>
      <p className={s.ruleNote}>
        Enter the final scores, bonuses included: in 2024 the background raises scores by +2/+1 or +1/+1/+1; in 2014 the species
        does. The helpers lay out base scores; add the bonuses after.
      </p>
    </FieldShell>
  );
}

// ---- Saves and skills ----------------------------------------------------------------

function Saves({ mp, firstClass }: { mp: DocPath; firstClass: string }) {
  const { doc, set, readOnly } = useEditor();
  const raw = getAt(doc, mp);
  const d = deriveLoose(raw);
  const saves = ((getAt(doc, [...mp, "saves"]) as string[] | undefined) ?? []).filter((x) => typeof x === "string");
  const classSaves = CLASS_SAVES[firstClass];
  const problems = useIssuesAt([...mp, "saves"]);
  return (
    <FieldShell path={[...mp, "saves"]} wide>
      <div className={s.listHead}>
        <span className={s.legend}>Saving throw proficiencies</span>
        {classSaves && !readOnly && saves.join() !== classSaves.join() && (
          <Button size="small" startIcon={<AutoFixHighIcon />} onClick={() => set([...mp, "saves"], [...classSaves])}>
            Use the {firstClass}&apos;s saves ({classSaves.map((a) => a.toUpperCase()).join(", ")})
          </Button>
        )}
      </div>
      <div className={s.chips} role="group" aria-label="Saving throw proficiencies" aria-invalid={problems.length > 0 || undefined}>
        {ABILITIES.map((a) => {
          const on = saves.includes(a);
          const total = d?.saves[a].total;
          return (
            <Chip
              key={a}
              size="small"
              aria-pressed={on}
              data-field={`${pathKey([...mp, "saves"])}:${a}`}
              color={on ? "secondary" : "default"}
              variant={on ? "filled" : "outlined"}
              disabled={readOnly}
              label={`${a.toUpperCase()} ${total === undefined ? "" : signed(total)}`}
              onClick={() => set([...mp, "saves"], on ? saves.filter((x) => x !== a) : [...saves, a])}
            />
          );
        })}
      </div>
    </FieldShell>
  );
}

function Skills({ mp }: { mp: DocPath }) {
  const { doc, set, readOnly } = useEditor();
  const d = deriveLoose(getAt(doc, mp));
  const skills = ((getAt(doc, [...mp, "skills"]) as string[] | undefined) ?? []).filter((x) => typeof x === "string");
  const expertise = ((getAt(doc, [...mp, "expertise"]) as string[] | undefined) ?? []).filter((x) => typeof x === "string");
  const jack = getAt(doc, [...mp, "jackOfAllTrades"]) === true;
  const toggle = (key: "skills" | "expertise", list: string[], sk: string) =>
    set([...mp, key], list.includes(sk) ? list.filter((x) => x !== sk) : [...list, sk]);
  return (
    <>
      <FieldShell path={[...mp, "skills"]} wide>
        <span className={s.legend}>Skills (proficient · expertise · total)</span>
        <div className={s.skillGrid}>
          {(Object.keys(SKILLS) as Skill[]).map((sk) => (
            <div key={sk} className={s.skillRow}>
              <input
                type="checkbox"
                checked={skills.includes(sk)}
                disabled={readOnly}
                aria-label={`Proficient in ${SKILL_NAMES[sk]}`}
                data-field={`${pathKey([...mp, "skills"])}:${sk}`}
                onChange={() => toggle("skills", skills, sk)}
              />
              <input
                type="checkbox"
                checked={expertise.includes(sk)}
                disabled={readOnly}
                aria-label={`Expertise in ${SKILL_NAMES[sk]}`}
                data-field={`${pathKey([...mp, "expertise"])}:${sk}`}
                onChange={() => toggle("expertise", expertise, sk)}
              />
              <span>
                {SKILL_NAMES[sk]} <span className={s.muted}>({SKILLS[sk]})</span>
              </span>
              <span className={s.skillTotal}>{d ? signed(d.skills[sk].total) : ""}</span>
            </div>
          ))}
        </div>
      </FieldShell>
      <FieldShell path={[...mp, "expertise"]} wide>
        <FormControlLabel
          control={
            <Switch
              checked={jack}
              disabled={readOnly}
              onChange={(e) => set([...mp, "jackOfAllTrades"], e.target.checked || undefined)}
            />
          }
          label="Jack of All Trades (half proficiency on other skills)"
        />
      </FieldShell>
    </>
  );
}

// ---- Hit points ---------------------------------------------------------------------------

function HitPoints({ mp, ruleset }: { mp: DocPath; ruleset: Ruleset }) {
  const { doc, set, readOnly } = useEditor();
  const raw = getAt(doc, mp);
  const hp = getAt(doc, [...mp, "hp"]);
  const calc = useMemo(() => hpBreakdown(looseMech(raw), ruleset), [raw, ruleset]);
  const [override, setOverride] = useState(() => calc !== null && typeof hp === "number" && hp !== calc.total);
  const key = pathKey(mp);
  // Following the calculator: keep HP in step as the class, level and Con change.
  useEffect(() => {
    if (!override && !readOnly && calc && hp !== calc.total) set([...mp, "hp"], calc.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override, calc?.total, hp, key, readOnly]);

  return (
    <div className={s.grid}>
      <FieldShell path={[...mp, "hp"]}>
        <TextField
          size="small"
          fullWidth
          type="number"
          label="Hit points"
          value={typeof hp === "number" ? hp : ""}
          disabled={readOnly || !override}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            set([...mp, "hp"], Number.isFinite(n) ? n : undefined);
          }}
          slotProps={{ htmlInput: { "data-field": pathKey([...mp, "hp"]) } }}
        />
      </FieldShell>
      <div className={s.wide}>
        <FormControlLabel
          control={<Switch checked={override} disabled={readOnly} onChange={(e) => setOverride(e.target.checked)} />}
          label="Override the calculator"
        />
        <p className={s.ruleNote}>
          {calc
            ? `Fixed average: ${calc.formula} = ${calc.total}.`
            : "Pick a class (and its hit die, if the table doesn't know it) to work out hit points."}
          {override && calc && typeof hp === "number" && hp !== calc.total
            ? ` Publishing checks HP against the fixed average, so ${hp} will be flagged until it's ${calc.total}.`
            : ""}
        </p>
      </div>
    </div>
  );
}

// ---- Spellcasting ------------------------------------------------------------------------

function Spellcasting({ mp, ruleset }: { mp: DocPath; ruleset: Ruleset }) {
  const { doc, set, readOnly } = useEditor();
  const scPath = [...mp, "spellcasting"];
  const sc = getAt(doc, scPath) as Record<string, unknown> | undefined;
  const mech = looseMech(getAt(doc, mp));
  const suggest = suggestedSlots(mech, ruleset);
  const caster = mech.classes.map((k) => castingAbility(k.name, k.subclass)).find(Boolean) ?? null;
  const slots = Array.isArray(sc?.slots) ? (sc.slots as unknown[]) : [];
  const pact = sc?.pact as { count?: number; level?: number } | undefined;
  const slotsMatch = slots.join(",") === suggest.slots.join(",");
  const d = deriveLoose(getAt(doc, mp));

  if (!sc)
    return (
      <div className={s.helperRow}>
        <span>{caster ? "This class casts spells." : "No spellcasting."}</span>
        {!readOnly && (
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              set(scPath, {
                ability: caster ?? "int",
                ...(suggest.slots.length && { slots: suggest.slots }),
                ...(suggest.pact && { pact: suggest.pact }),
                spells: [],
              })
            }
          >
            Add spellcasting
          </Button>
        )}
      </div>
    );

  return (
    <>
      <div className={s.grid}>
        <SpellAbility path={[...scPath, "ability"]} />
        <span className={s.ruleNote}>
          {d?.spell ? `Spell save DC ${d.spell.dc}, spell attack ${signed(d.spell.attack)}.` : ""}
        </span>
      </div>
      <FieldShell path={[...scPath, "slots"]} wide>
        <span className={s.legend}>Spell slots</span>
        <div className={s.slotTable}>
          <span />
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={s.slotHead}>
              {ordinal(i + 1)}
            </span>
          ))}
          <span className={s.slotHead}>Have</span>
          {Array.from({ length: 9 }, (_, i) => (
            <input
              key={i}
              className={s.slotInput}
              type="number"
              min={0}
              aria-label={`${ordinal(i + 1)}-level slots`}
              value={typeof slots[i] === "number" ? (slots[i] as number) : ""}
              disabled={readOnly}
              data-field={pathKey([...scPath, "slots", i])}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                const next = [...slots.map((x) => (typeof x === "number" ? x : 0))];
                while (next.length <= i) next.push(0);
                next[i] = Number.isFinite(n) ? n : 0;
                while (next.length && next[next.length - 1] === 0) next.pop();
                set([...scPath, "slots"], next);
              }}
            />
          ))}
          <span className={s.slotHead}>Table</span>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={s.slotSuggest}>
              {suggest.slots[i] ?? "–"}
            </span>
          ))}
        </div>
        <div className={s.helperRow}>
          {slotsMatch ? (
            <span>✓ Matches the class table for {ruleset}.</span>
          ) : (
            !readOnly && (
              <Button size="small" startIcon={<AutoFixHighIcon />} onClick={() => set([...scPath, "slots"], suggest.slots.length ? suggest.slots : undefined)}>
                Use the class table ({suggest.slots.length ? suggest.slots.join(" / ") : "no slots"})
              </Button>
            )
          )}
        </div>
      </FieldShell>
      {(suggest.pact || pact) && (
        <FieldShell path={[...scPath, "pact"]} wide>
          <div className={s.helperRow}>
            <span className={s.legend}>Pact magic</span>
            <span>
              {pact ? `${pact.count ?? "?"} slot(s) of level ${pact.level ?? "?"}` : "none"}
              {suggest.pact ? ` · the warlock table gives ${suggest.pact.count} of level ${suggest.pact.level}` : " · no warlock levels"}
            </span>
            {!readOnly && (suggest.pact?.count !== pact?.count || suggest.pact?.level !== pact?.level) && (
              <Button size="small" startIcon={<AutoFixHighIcon />} onClick={() => set([...scPath, "pact"], suggest.pact ?? undefined)}>
                {suggest.pact ? "Use the warlock table" : "Remove pact slots"}
              </Button>
            )}
          </div>
        </FieldShell>
      )}
      <div className={s.grid}>
        <Field path={[...scPath, "spells"]} />
        <Field path={[...scPath, "note"]} />
      </div>
      {!readOnly && (
        <Button size="small" sx={{ mt: 1 }} onClick={() => set(scPath, undefined)}>
          Remove spellcasting
        </Button>
      )}
    </>
  );
}

function SpellAbility({ path }: { path: DocPath }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const problems = useIssuesAt(path);
  return (
    <FieldShell path={path}>
      <TextField
        select
        size="small"
        fullWidth
        label="Spellcasting ability"
        value={typeof value === "string" ? value : ""}
        disabled={readOnly}
        error={problems.length > 0}
        onChange={(e) => set(path, e.target.value)}
        slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
      >
        {ABILITIES.map((a) => (
          <MenuItem key={a} value={a}>
            {ABILITY_NAMES[a]}
          </MenuItem>
        ))}
      </TextField>
    </FieldShell>
  );
}
