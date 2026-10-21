import { Button, MenuItem, TextField } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { getAt, pathKey } from "@/lib/store/doc";
import type { DocPath } from "@/lib/oneShotCheck";
import { SKILL_KEYS, STATS, type Skill } from "@/systems/paranoia/schema";
import { SKILL_NAMES, STAT_NAMES, signed, skillsOf, stats } from "@/systems/paranoia/derive";
import { CLEARANCE_NAMES } from "@/systems/paranoia/rules";
import { Field, FieldShell, useIssuesAt } from "../Fields";
import { useEditor } from "../EditorContext";
import s from "../Admin.module.css";

const VALUES = [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5];

/**
 * A Troubleshooter's public side with the skill draft worked out live: each
 * skill picks a value from +5 to −5, the values still to place are shown,
 * and the stats follow (each is the number of positive skills under it).
 * The clone name is previewed as it will be written.
 */
export function MechParanoia({ index }: { index: number }) {
  const { doc } = useEditor();
  if (!doc.cast[index]) return null;
  const mp: DocPath = ["cast", index, "mech"];
  return <Body mp={mp} />;
}

function Body({ mp }: { mp: DocPath }) {
  const { doc } = useEditor();
  const at = (...k: (string | number)[]) => [...mp, ...k];
  const clone = (getAt(doc, at("clone")) as { name?: string; clearance?: string; sector?: string; number?: number } | undefined) ?? {};
  return (
    <div className={s.wide}>
      <h4 className={s.subhead}>Clone name</h4>
      <div className={s.grid}>
        <Field path={at("clone")} />
      </div>
      <p className={s.ruleNote} data-testid="clone-preview">
        {clone.name || "Name"}-{clone.clearance || "R"}-{clone.sector || "SEC"}-{clone.number ?? 1}
        {clone.clearance ? `: ${CLEARANCE_NAMES[clone.clearance as keyof typeof CLEARANCE_NAMES] ?? "?"} clearance` : ""}. Troubleshooters start at Red, with clone 1 of 6.
      </p>
      <div className={s.grid}>
        <Field path={at("serviceGroup")} />
        <Field path={at("bonusDuty")} />
        <Field path={at("moxie")} />
        <Field path={at("xp")} />
      </div>

      <h4 className={s.subhead}>The skill draft</h4>
      <Skills mp={mp} />

      <h4 className={s.subhead}>Assigned gear</h4>
      <div className={s.grid}>
        <Field path={at("gear")} label="Assigned gear (a level gives that many extra dice when it's the tool for the job)" />
      </div>
    </div>
  );
}

function Skills({ mp }: { mp: DocPath }) {
  const { doc, set, readOnly } = useEditor();
  const raw = (getAt(doc, [...mp, "skills"]) as Partial<Record<Skill, number>> | undefined) ?? {};
  const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, typeof raw[k] === "number" ? raw[k] : 0])) as Record<Skill, number>;
  const problems = useIssuesAt([...mp, "skills"]);
  const used = new Set(SKILL_KEYS.map((k) => skills[k]).filter((v) => v !== 0));
  const left = VALUES.filter((v) => v !== 0 && !used.has(v));
  const st = stats({ skills });
  return (
    <FieldShell path={[...mp, "skills"]} wide>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {STATS.map((stat) => (
          <div key={stat}>
            <div className={s.legend}>
              {STAT_NAMES[stat]} <b data-testid={`stat-${stat}`}>{st[stat]}</b>
            </div>
            {skillsOf(stat).map((k) => (
              <TextField
                key={k}
                select
                size="small"
                label={SKILL_NAMES[k]}
                value={skills[k]}
                disabled={readOnly}
                error={problems.length > 0}
                onChange={(e) => set([...mp, "skills", k], Number(e.target.value) || undefined)}
                slotProps={{ htmlInput: { "data-field": pathKey([...mp, "skills", k]) } }}
                sx={{ width: "100%", mt: 1 }}
              >
                {VALUES.map((v) => (
                  <MenuItem key={v} value={v} disabled={v !== 0 && v !== skills[k] && used.has(v)}>
                    {signed(v)}
                  </MenuItem>
                ))}
              </TextField>
            ))}
          </div>
        ))}
      </div>
      <div className={s.helperRow}>
        <span data-testid="draft-left">{left.length ? `Still to place: ${left.map(signed).join(", ")}.` : "✓ The draft: +1 to +5 and −1 to −5, once each."}</span>
        {!readOnly && (
          <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} onClick={() => set([...mp, "skills"], {})}>
            Clear the draft
          </Button>
        )}
      </div>
      <p className={s.ruleNote}>
        At the table the draft is competitive: each skill you take at +n goes to the next player at −n. For a pre-made, give each value from +5 to −5 once; the six
        skills left are 0. Each stat is how many positive skills sit under it, so the four add up to 5.
      </p>
    </FieldShell>
  );
}
