import { useMemo } from "react";
import { Button, Chip, MenuItem, TextField, Tooltip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { getAt, pathKey } from "@/lib/store/doc";
import type { DocPath } from "@/lib/oneShotCheck";
import { CLASSES, TRAITS, type ClassName, type Trait } from "@/systems/daggerheart/schema";
import { TRAIT_NAMES, expected, signed } from "@/systems/daggerheart/derive";
import { ARMOR, CLASS_INFO, DOMAIN_CARDS, MAX_LOADOUT, TRAIT_SPREAD, WEAPONS } from "@/systems/daggerheart/srd";
import { Field, FieldShell, useIssuesAt } from "../Fields";
import { useEditor } from "../EditorContext";
import s from "../Admin.module.css";

/** Which traits a class usually leans on, best first, for the "spread for a…" helper. */
const TRAIT_PRIORITY: Record<ClassName, Trait[]> = {
  Bard: ["presence", "agility", "knowledge", "finesse", "instinct", "strength"],
  Druid: ["instinct", "agility", "knowledge", "strength", "finesse", "presence"],
  Guardian: ["strength", "agility", "instinct", "presence", "finesse", "knowledge"],
  Ranger: ["agility", "instinct", "finesse", "strength", "knowledge", "presence"],
  Rogue: ["finesse", "agility", "presence", "instinct", "knowledge", "strength"],
  Seraph: ["strength", "presence", "instinct", "agility", "knowledge", "finesse"],
  Sorcerer: ["instinct", "presence", "agility", "knowledge", "finesse", "strength"],
  Warrior: ["strength", "agility", "instinct", "finesse", "presence", "knowledge"],
  Wizard: ["knowledge", "instinct", "presence", "agility", "finesse", "strength"],
};

const spreadFor = (order: Trait[]) => Object.fromEntries(order.map((t, i) => [t, TRAIT_SPREAD[i]])) as Record<Trait, number>;

type Loose = {
  class?: string;
  subclass?: string;
  level?: number;
  traits?: Partial<Record<Trait, number>>;
  armor?: { name?: string; score?: number; major?: number; severe?: number; evasionMod?: number };
  bonuses?: Record<string, number | string | undefined>;
  domainCards?: { name?: string; where?: string }[];
  features?: { hope?: boolean }[];
  weapons?: unknown[];
};

/**
 * Daggerheart mechanics with the rules worked out live: the class's
 * subclasses and domains, the level-1 trait spread, what Evasion, Hit
 * Points, Stress, Armor and the thresholds should be (with a button to take
 * the rules' numbers), domain cards picked from the class's two domains, and
 * tier-1 armor and weapons from the SRD tables.
 */
export function MechDh({ index }: { index: number }) {
  const { doc } = useEditor();
  const mp: DocPath = ["cast", index, "mech"];
  if (!doc.cast[index]) return null;
  return <MechBody mp={mp} />;
}

function MechBody({ mp }: { mp: DocPath }) {
  const { doc, set, readOnly } = useEditor();
  const m = (getAt(doc, mp) as Loose | undefined) ?? {};
  const at = (...k: (string | number)[]) => [...mp, ...k];
  const klass = (CLASSES as readonly string[]).includes(m.class ?? "") ? (m.class as ClassName) : null;
  const info = klass ? CLASS_INFO[klass] : null;
  const level = typeof m.level === "number" ? m.level : 1;
  const want = useMemo(
    () =>
      klass
        ? expected({
            class: klass,
            level,
            armor: m.armor && typeof m.armor.score === "number" ? (m.armor as Parameters<typeof expected>[0]["armor"]) : undefined,
            bonuses: (m.bonuses ?? {}) as Parameters<typeof expected>[0]["bonuses"],
          })
        : null,
    [klass, level, m.armor, m.bonuses],
  );

  return (
    <div className={s.wide}>
      <h4 className={s.subhead}>Class and heritage</h4>
      <div className={s.grid}>
        <Field path={at("class")} />
        <FieldShell path={at("subclass")}>
          <TextField
            select
            size="small"
            label="Subclass"
            value={info && m.subclass && m.subclass in info.subclasses ? m.subclass : ""}
            disabled={readOnly || !info}
            onChange={(e) => set(at("subclass"), e.target.value)}
            slotProps={{ htmlInput: { "data-field": pathKey(at("subclass")) } }}
            fullWidth
          >
            {Object.entries(info?.subclasses ?? {}).map(([name, trait]) => (
              <MenuItem key={name} value={name}>
                {name}
                {trait ? ` (Spellcast: ${TRAIT_NAMES[trait]})` : ""}
              </MenuItem>
            ))}
          </TextField>
        </FieldShell>
        <Field path={at("level")} />
        <Field path={at("ancestry")} />
        <Field path={at("community")} />
      </div>
      {info && (
        <p className={s.ruleNote}>
          {klass}: Evasion {info.evasion}, {info.hp} Hit Points, domains {info.domains.join(" and ")}. Hope feature: <b>{info.hopeFeature.name}</b>,{" "}
          {info.hopeFeature.gist}
        </p>
      )}

      <h4 className={s.subhead}>Traits</h4>
      <Traits mp={mp} klass={klass} />

      <h4 className={s.subhead}>Armor, Evasion, Hit Points and Stress</h4>
      <div className={s.helperRow}>
        {!readOnly && (
          <TextField
            select
            size="small"
            label="Wear tier-1 armor"
            value=""
            sx={{ minWidth: 220 }}
            onChange={(e) => {
              const a = ARMOR.find((x) => x.name === e.target.value);
              set(at("armor"), a ? { ...a } : undefined);
            }}
          >
            <MenuItem value="(none)">No armor</MenuItem>
            {ARMOR.map((a) => (
              <MenuItem key={a.name} value={a.name}>
                {a.name} ({a.major}/{a.severe}, Armor {a.score}
                {a.evasionMod ? `, Evasion ${signed(a.evasionMod)}` : ""})
              </MenuItem>
            ))}
          </TextField>
        )}
        {want && !readOnly && (
          <Tooltip describeChild title="Evasion, Hit Points, Stress, Armor Score and thresholds as the class, armor, level and bonuses make them">
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={() => {
                set(at("evasion"), want.evasion);
                set(at("hp"), want.hp);
                set(at("stress"), want.stress);
                set(at("armorScore"), want.armorScore);
                set(at("thresholds"), want.thresholds);
              }}
            >
              Use the rules&apos; numbers
            </Button>
          </Tooltip>
        )}
      </div>
      {want && (
        <div className={s.derived} aria-label="What the rules make them">
          <span className={s.derivedItem}>
            Evasion <span className={s.derivedValue}>{want.evasion}</span>
          </span>
          <span className={s.derivedItem}>
            Hit Points <span className={s.derivedValue}>{want.hp}</span>
          </span>
          <span className={s.derivedItem}>
            Stress <span className={s.derivedValue}>{want.stress}</span>
          </span>
          <span className={s.derivedItem}>
            Armor Score <span className={s.derivedValue}>{want.armorScore}</span>
          </span>
          <span className={s.derivedItem}>
            Thresholds{" "}
            <span className={s.derivedValue}>
              {want.thresholds.major}/{want.thresholds.severe}
            </span>
          </span>
        </div>
      )}
      <div className={s.grid} style={{ marginTop: 12 }}>
        <Field path={at("evasion")} />
        <Field path={at("hp")} />
        <Field path={at("stress")} />
        <Field path={at("armorScore")} />
        <Field path={at("thresholds")} />
        <Field path={at("proficiency")} />
        <Field path={at("armor")} />
        <Field path={at("bonuses")} />
      </div>
      <p className={s.ruleNote}>
        Thresholds are the armor&apos;s base plus the level (no armor: Major is the level, Severe twice it). Put ancestry or subclass extras in Bonuses (a
        Giant&apos;s extra Hit Point, a Vengeance Guardian&apos;s extra Stress, a shield&apos;s Armor), so the checks know where they come from.
      </p>

      <h4 className={s.subhead}>Experiences</h4>
      <div className={s.grid}>
        <Field path={at("experiences")} label="Experiences (two at +2 for a new character)" />
      </div>

      <h4 className={s.subhead}>Domain cards</h4>
      <DomainCards mp={mp} klass={klass} level={level} />

      <h4 className={s.subhead}>Weapons</h4>
      {!readOnly && (
        <div className={s.helperRow}>
          <TextField
            select
            size="small"
            label="Add a tier-1 weapon"
            value=""
            sx={{ minWidth: 260 }}
            onChange={(e) => {
              const w = WEAPONS.find((x) => x.name === e.target.value);
              if (w) set(at("weapons"), [...((m.weapons as unknown[]) ?? []), { ...w }]);
            }}
          >
            {WEAPONS.map((w) => (
              <MenuItem key={w.name} value={w.name}>
                {w.name} · {w.slot} · {TRAIT_NAMES[w.trait]} · {w.die}
                {w.mod ? `+${w.mod}` : ""} {w.damageType === "magic" ? "mag" : "phy"} · {w.burden}
              </MenuItem>
            ))}
          </TextField>
        </div>
      )}
      <div className={s.grid}>
        <Field path={at("weapons")} label="Weapons (one primary; a secondary only beside a one-handed primary)" />
      </div>

      <h4 className={s.subhead}>Features</h4>
      {info && !readOnly && !(m.features ?? []).some((f) => f?.hope) && (
        <div className={s.helperRow}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoFixHighIcon />}
            onClick={() => set(at("features"), [...(m.features ?? []), { name: info.hopeFeature.name, source: "class", hope: true, text: info.hopeFeature.gist }])}
          >
            Add the {klass} Hope feature
          </Button>
        </div>
      )}
      <div className={s.grid}>
        <Field path={at("features")} label="Features (class, subclass, ancestry, community), in your own words" />
      </div>

      <h4 className={s.subhead}>Inventory</h4>
      <div className={s.grid}>
        <Field path={at("equipment")} />
        <Field path={at("gold")} />
      </div>
    </div>
  );
}

function Traits({ mp, klass }: { mp: DocPath; klass: ClassName | null }) {
  const { doc, set, readOnly } = useEditor();
  const traits = (getAt(doc, [...mp, "traits"]) as Partial<Record<Trait, number>> | undefined) ?? {};
  const problems = useIssuesAt([...mp, "traits"]);
  const got = TRAITS.map((t) => traits[t]);
  const spread = got.every((n) => typeof n === "number") && [...(got as number[])].sort((a, b) => b - a).join() === [...TRAIT_SPREAD].sort((a, b) => b - a).join();
  const ranked = [...TRAITS].sort((a, b) => (traits[b] ?? -9) - (traits[a] ?? -9));
  return (
    <FieldShell path={[...mp, "traits"]} wide>
      <div className={s.abilityRow}>
        {TRAITS.map((t) => (
          <label key={t} className={s.abilityBox}>
            <div className={s.abilityName}>{TRAIT_NAMES[t].slice(0, 3)}</div>
            <input
              className={s.abilityInput}
              type="number"
              min={-3}
              max={6}
              value={typeof traits[t] === "number" ? traits[t] : ""}
              aria-label={`${TRAIT_NAMES[t]} modifier`}
              aria-invalid={problems.length > 0 || undefined}
              disabled={readOnly}
              data-field={pathKey([...mp, "traits", t])}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                set([...mp, "traits", t], Number.isFinite(n) ? n : undefined);
              }}
            />
          </label>
        ))}
      </div>
      <div className={s.helperRow}>
        {!readOnly && (
          <>
            <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} onClick={() => set([...mp, "traits"], spreadFor(ranked))}>
              Spread +2 +1 +1 +0 +0 −1 (keep order)
            </Button>
            {klass && (
              <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} onClick={() => set([...mp, "traits"], spreadFor(TRAIT_PRIORITY[klass]))}>
                Spread for a {klass}
              </Button>
            )}
          </>
        )}
        <span>{spread ? "✓ The level-1 spread." : "A new character spreads +2, +1, +1, +0, +0 and −1 across the six traits."}</span>
      </div>
    </FieldShell>
  );
}

function DomainCards({ mp, klass, level }: { mp: DocPath; klass: ClassName | null; level: number }) {
  const { doc, set, readOnly } = useEditor();
  const cards = ((getAt(doc, [...mp, "domainCards"]) as { name?: string; where?: string }[] | undefined) ?? []).filter((x) => x && typeof x === "object");
  const bonus = Number(((getAt(doc, [...mp, "bonuses"]) as { cards?: number } | undefined) ?? {}).cards ?? 0) || 0;
  const want = level + 1 + bonus;
  const loadout = cards.filter((x) => (x.where ?? "loadout") === "loadout").length;
  const info = klass ? CLASS_INFO[klass] : null;
  const pool = info ? DOMAIN_CARDS.filter((c) => info.domains.includes(c.domain) && c.level <= level) : [];
  const has = (name: string) => cards.some((x) => x.name === name);
  const toggle = (name: string) =>
    set([...mp, "domainCards"], has(name) ? cards.filter((x) => x.name !== name) : [...cards, { name, where: loadout < MAX_LOADOUT ? "loadout" : "vault" }]);
  return (
    <>
      {info ? (
        <div role="group" aria-label={`${klass} domain cards`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {pool.map((c) => (
            <Tooltip key={c.name} describeChild title={`${c.domain} ${c.level} · ${c.type} · recall ${c.recall}: ${c.gist}`}>
              <Chip
                label={`${c.name} (${c.domain})`}
                color={has(c.name) ? "secondary" : "default"}
                variant={has(c.name) ? "filled" : "outlined"}
                aria-pressed={has(c.name)}
                disabled={readOnly}
                onClick={() => toggle(c.name)}
              />
            </Tooltip>
          ))}
        </div>
      ) : (
        <p className={s.muted}>Pick a class to see its domain cards.</p>
      )}
      <p className={s.ruleNote}>
        {cards.length} of {want} cards{bonus ? ` (with ${bonus} extra)` : ""} · {loadout} in the loadout (at most {MAX_LOADOUT}). Cards come from the class&apos;s
        two domains, at the character&apos;s level or lower.
      </p>
      <div className={s.grid}>
        <Field path={[...mp, "domainCards"]} label="Domain cards (loadout or vault)" />
      </div>
    </>
  );
}
