import { useState } from "react";
import { ABILITIES, SKILLS, type Character, type Ruleset, type Skill, type Spell } from "@/systems/dnd5e/schema";
import { ABILITY_NAMES, SKILL_NAMES, classLine, derive, ordinal, signed } from "@/systems/dnd5e/derive";
import { attackRolls, checkRoll, initiativeRoll, saveRoll, skillRoll, type RollSpec } from "@/systems/dnd5e/rolls";
import s from "./Sheet.module.css";
import t from "@/components/table/Toys.module.css";

/** A number on the sheet; a button that rolls it when the sheet is at a table. */
function Rollable({ spec, onRoll, children }: { spec: RollSpec | null; onRoll?: (r: RollSpec) => void; children: React.ReactNode }) {
  if (!onRoll || !spec) return <>{children}</>;
  return (
    <button type="button" className={t.rollable} onClick={() => onRoll(spec)}>
      {children}
      <span className={s.srOnly}> Roll {spec.label}</span>
    </button>
  );
}

function Boxes({ n }: { n: number }) {
  return (
    <span className={s.uses} role="img" aria-label={`${n} ${n === 1 ? "use" : "uses"} to tick off`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={s.box} />
      ))}
    </span>
  );
}

const PER: Record<string, string> = { short: "short rest", long: "long rest", day: "day", turn: "turn" };

/** Front: what you roll. */
export function SheetFront({
  c,
  ruleset,
  oneshotTitle,
  titleAs: Title = "h2",
  onRoll,
}: {
  c: Character;
  ruleset: Ruleset;
  oneshotTitle: string;
  /** The page's own heading on a single sheet; h2 when a page holds several. */
  titleAs?: "h1" | "h2";
  /** At a table: tapping a number rolls it (src/components/table/DiceTray.tsx). */
  onRoll?: (r: RollSpec) => void;
}) {
  const d = derive(c);
  const m = c.mech;
  const Section = Title === "h1" ? "h2" : "h3";
  const speciesLabel = ruleset === "2014" ? "Race" : "Species";

  return (
    <section className={s.page}>
      <header className={s.head}>
        <div>
          <Title className={s.name}>{c.name}</Title>
          <div className={s.epithet}>
            {c.poster.epithet} · {c.story.pronouns}
          </div>
        </div>
        <div className={s.headMeta}>
          <div>
            <b>{classLine(c)}</b>
          </div>
          <div>
            {speciesLabel}: {m.species}
            {m.lineage ? ` (${m.lineage})` : ""} · Background: {m.background}
          </div>
          <div>
            Level {d.level} · {ruleset} rules
          </div>
        </div>
      </header>

      <div className={s.abilities}>
        {ABILITIES.map((a) => (
          <div key={a} className={s.ability}>
            <div className={s.label}>{ABILITY_NAMES[a]}</div>
            <div className={s.abilityMod}>
              <Rollable spec={checkRoll(c, a)} onRoll={onRoll}>
                {signed(d.mods[a])}
              </Rollable>
            </div>
            <span className={s.abilityScore}>{m.abilities[a]}</span>
          </div>
        ))}
      </div>

      <div className={s.vitals}>
        <div className={s.vital}>
          <div className={s.label}>Armor Class</div>
          <div className={s.vitalValue}>{m.ac.value}</div>
          <div className={s.vitalNote}>{m.ac.note}</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Hit Points</div>
          <div className={s.vitalValue}>{m.hp}</div>
          <div className={s.vitalNote}>current ____</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Hit Dice</div>
          <div className={s.vitalValue} style={{ fontSize: 17 }}>
            {d.hitDice.map((h) => `${h.count}d${h.die}`).join(" + ")}
          </div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Initiative</div>
          <div className={s.vitalValue}>
            <Rollable spec={initiativeRoll(c)} onRoll={onRoll}>
              {signed(d.initiative)}
            </Rollable>
          </div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Speed</div>
          <div className={s.vitalValue}>{m.speed}</div>
          <div className={s.vitalNote}>ft · {m.size}</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Proficiency</div>
          <div className={s.vitalValue}>{signed(d.prof)}</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Passive Perc.</div>
          <div className={s.vitalValue}>{d.passive.perception}</div>
          <div className={s.vitalNote}>
            Ins {d.passive.insight} · Inv {d.passive.investigation}
          </div>
        </div>
      </div>

      <div className={s.cols}>
        <div>
          <Section className={s.sectionTitle}>Saving throws</Section>
          <ul className={s.list}>
            {ABILITIES.map((a) => (
              <li key={a}>
                <span className={d.saves[a].proficient ? s.dotOn : s.dot} aria-hidden="true" />
                <span className={s.bonus}>
                  <Rollable spec={saveRoll(c, a)} onRoll={onRoll}>
                    {signed(d.saves[a].total)}
                  </Rollable>
                </span>
                {ABILITY_NAMES[a]}
                {d.saves[a].proficient && <span className={s.srOnly}> (proficient)</span>}
              </li>
            ))}
          </ul>
          <Section className={s.sectionTitle}>Skills</Section>
          <ul className={s.list}>
            {(Object.keys(SKILLS) as Skill[]).map((k) => {
              const sk = d.skills[k];
              return (
                <li key={k}>
                  <span className={sk.expertise ? s.dotX : sk.proficient ? s.dotOn : s.dot} aria-hidden="true" />
                  <span className={s.bonus}>
                    <Rollable spec={skillRoll(c, k)} onRoll={onRoll}>
                      {signed(sk.total)}
                    </Rollable>
                  </span>
                  {SKILL_NAMES[k]} <span className={s.muted}>{sk.ability}</span>
                  {(sk.expertise || sk.proficient) && (
                    <span className={s.srOnly}> ({sk.expertise ? "expertise" : "proficient"})</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={s.muted} style={{ marginTop: 4 }} aria-hidden="true">
            ● proficient · ◉ expertise{m.jackOfAllTrades ? " · Jack of All Trades applied" : ""}
          </div>
          <Section className={s.sectionTitle}>Training</Section>
          <div>
            {m.armorTraining.length > 0 && <div>Armor: {m.armorTraining.join(", ")}</div>}
            {m.weaponTraining.length > 0 && <div>Weapons: {m.weaponTraining.join(", ")}</div>}
            {m.tools.length > 0 && <div>Tools: {m.tools.join(", ")}</div>}
            <div>Languages: {m.languages.join(", ")}</div>
            {m.senses.length > 0 && <div>Senses: {m.senses.join(", ")}</div>}
          </div>
        </div>

        <div>
          {d.attacks.length > 0 && (
            <>
              <Section className={s.sectionTitle}>Attacks &amp; cantrips</Section>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Hit / DC</th>
                    <th>Damage</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {d.attacks.map((a) => {
                    const r = onRoll ? attackRolls(c, a.name) : { hit: null, damage: null };
                    return (
                    <tr key={a.name}>
                      <td>
                        <b>{a.name}</b>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Rollable spec={r.hit} onRoll={onRoll}>
                          {a.toHit}
                        </Rollable>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Rollable spec={r.damage} onRoll={onRoll}>
                          {a.damage}
                        </Rollable>{" "}
                        {a.damageType}
                      </td>
                      <td className={s.muted}>
                        {[a.range, ...a.properties, a.mastery && `Mastery: ${a.mastery}`, a.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <Section className={s.sectionTitle}>Features &amp; traits</Section>
          <div className={s.features}>
            {m.originFeat && (
              <p className={s.feature}>
                <span className={s.featureName}>Origin feat:</span> {m.originFeat}
              </p>
            )}
            {m.feats.length > 0 && (
              <p className={s.feature}>
                <span className={s.featureName}>Feats:</span> {m.feats.join(", ")}
              </p>
            )}
            {m.weaponMasteries.length > 0 && (
              <p className={s.feature}>
                <span className={s.featureName}>Weapon mastery:</span> {m.weaponMasteries.join(", ")}
              </p>
            )}
            {m.features.map((f) => (
              <p key={f.name} className={s.feature}>
                <span className={s.featureName}>{f.name}.</span>
                {f.uses && (
                  <>
                    <Boxes n={f.uses.max} />
                    <span className={s.muted}> / {PER[f.uses.per]}</span>
                  </>
                )}{" "}
                {f.text}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div className={s.footer}>
        <span>{oneshotTitle}</span>
        <span>Tear-Off · front</span>
      </div>
    </section>
  );
}

/** Back: spells, kit, and who they are. */
export function SheetBack({
  c,
  oneshotTitle,
  names,
  sealedSecret = false,
  sectionAs: Section = "h3",
}: {
  c: Character;
  oneshotTitle: string;
  /** id → display name for ties. */
  names: Record<string, string>;
  sealedSecret?: boolean;
  /** h2 when the front's name is the page's h1. */
  sectionAs?: "h2" | "h3";
}) {
  const d = derive(c);
  const m = c.mech;
  const sc = m.spellcasting;
  const [open, setOpen] = useState(!sealedSecret);
  const byLevel = new Map<number, Spell[]>();
  for (const sp of sc?.spells ?? []) byLevel.set(sp.level, [...(byLevel.get(sp.level) ?? []), sp]);

  return (
    <section className={s.page}>
      {sc && d.spell && (
        <>
          <Section className={s.sectionTitle} style={{ marginTop: 0 }}>
            Spellcasting · {ABILITY_NAMES[sc.ability]} · save DC {d.spell.dc} · attack {signed(d.spell.attack)}
          </Section>
          {sc.note && <p className={s.muted} style={{ margin: "0 0 6px" }}>{sc.note}</p>}
          <div className={s.features}>
            {[...byLevel.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([lvl, spells]) => (
                <div key={lvl} className={s.spellLevel}>
                  <div className={s.spellHead}>
                    <b>{lvl === 0 ? "Cantrips" : `${ordinal(lvl)} level`}</b>
                    {lvl > 0 && sc.slots[lvl - 1] ? <Boxes n={sc.slots[lvl - 1]} /> : null}
                    {lvl > 0 && sc.pact && sc.pact.level === lvl && (
                      <span className={s.muted}>
                        pact <Boxes n={sc.pact.count} />
                      </span>
                    )}
                  </div>
                  <p className={s.spellNames}>
                    {spells.map((sp, i) => (
                      <span key={sp.name}>
                        {i > 0 && ", "}
                        {sp.name}
                        {sp.always && (
                          <sup title="always prepared">
                            <span aria-hidden="true">◆</span>
                            <span className={s.srOnly}> (always prepared)</span>
                          </sup>
                        )}
                        {sp.note && <span className={s.muted}> ({sp.note})</span>}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            {sc.pact && !byLevel.has(sc.pact.level) && (
              <div className={s.spellHead}>
                Pact slots ({ordinal(sc.pact.level)} level) <Boxes n={sc.pact.count} />
              </div>
            )}
          </div>
          <div className={s.muted} aria-hidden="true">
            ◆ always prepared
          </div>
        </>
      )}

      <div className={s.storyGrid}>
        <div className={s.story}>
          <Section className={s.sectionTitle}>Who you are</Section>
          {c.story.intro && <p className={s.quote}>{c.story.intro}</p>}
          <p>{c.story.concept}</p>
          <p>
            <b>Tonight:</b> {c.story.stake}
          </p>
          <p>
            <b>You want:</b> {c.story.goal}
          </p>
          <Section className={s.sectionTitle}>Ties</Section>
          {c.story.ties.map((t) => (
            <p key={t.to}>
              <b>{names[t.to] ?? t.to}:</b> {t.text}
            </p>
          ))}
          <div className={s.secret}>
            <div className={s.label} style={{ color: "var(--wax)" }}>
              Your secret — for your eyes
            </div>
            <p className={open ? undefined : s.sealed} aria-hidden={open ? undefined : true} id={`secret-${c.id}`}>
              {c.story.secret}
            </p>
            {!open && (
              <button
                type="button"
                className={`${s.seal} no-print`}
                onClick={() => setOpen(true)}
                aria-label="break seal: read your secret"
                aria-controls={`secret-${c.id}`}
                aria-expanded={false}
              >
                <span className={s.sealDisc} aria-hidden="true">
                  break seal
                </span>
              </button>
            )}
          </div>
        </div>
        <div className={s.story}>
          <Section className={s.sectionTitle}>Look &amp; voice</Section>
          <p>
            {c.story.appearance}
            {c.story.age ? ` Age ${c.story.age}.` : ""}
          </p>
          <p>
            <b>Voice:</b> {c.story.voice}
          </p>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            {c.story.mannerisms.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {c.story.trinket && (
            <p>
              <b>Trinket:</b> {c.story.trinket}
            </p>
          )}
          <Section className={s.sectionTitle}>Equipment</Section>
          <ul className={s.list}>
            {m.equipment.map((e) => (
              <li key={e.name + (e.note ?? "")}>
                <span>
                  {e.qty > 1 ? `${e.qty} × ` : ""}
                  {e.name}
                  {e.equipped ? " (worn)" : ""}
                  {e.note && <span className={s.muted}> — {e.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 6 }}>
            <b>Gold:</b> {m.gold} gp
          </p>
        </div>
      </div>
      <div className={s.footer}>
        <span>{oneshotTitle}</span>
        <span>Tear-Off · back</span>
      </div>
    </section>
  );
}

export const sheetStyles = s;
