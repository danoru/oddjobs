import { useState } from "react";
import { ABILITIES, SKILLS, type Character, type Ruleset, type Skill, type Spell } from "@/lib/schema";
import { ABILITY_NAMES, SKILL_NAMES, classLine, derive, ordinal, signed } from "@/lib/derive";
import s from "./Sheet.module.css";

function Boxes({ n }: { n: number }) {
  return (
    <span className={s.uses} aria-label={`${n} uses`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={s.box} />
      ))}
    </span>
  );
}

const PER: Record<string, string> = { short: "short rest", long: "long rest", day: "day", turn: "turn" };

/** Front: what you roll. */
export function SheetFront({ c, ruleset, oneshotTitle }: { c: Character; ruleset: Ruleset; oneshotTitle: string }) {
  const d = derive(c);
  const m = c.mech;
  const speciesLabel = ruleset === "2014" ? "Race" : "Species";

  return (
    <section className={s.page}>
      <header className={s.head}>
        <div>
          <h2 className={s.name}>{c.name}</h2>
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
            <div className={s.abilityMod}>{signed(d.mods[a])}</div>
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
          <div className={s.vitalValue}>{signed(d.initiative)}</div>
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
          <div className={s.sectionTitle}>Saving throws</div>
          <ul className={s.list}>
            {ABILITIES.map((a) => (
              <li key={a}>
                <span className={d.saves[a].proficient ? s.dotOn : s.dot} />
                <span className={s.bonus}>{signed(d.saves[a].total)}</span>
                {ABILITY_NAMES[a]}
              </li>
            ))}
          </ul>
          <div className={s.sectionTitle}>Skills</div>
          <ul className={s.list}>
            {(Object.keys(SKILLS) as Skill[]).map((k) => {
              const sk = d.skills[k];
              return (
                <li key={k}>
                  <span className={sk.expertise ? s.dotX : sk.proficient ? s.dotOn : s.dot} />
                  <span className={s.bonus}>{signed(sk.total)}</span>
                  {SKILL_NAMES[k]} <span className={s.muted}>{sk.ability}</span>
                </li>
              );
            })}
          </ul>
          <div className={s.muted} style={{ marginTop: 4 }}>
            ● proficient · ◉ expertise{m.jackOfAllTrades ? " · Jack of All Trades applied" : ""}
          </div>
          <div className={s.sectionTitle}>Training</div>
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
              <div className={s.sectionTitle}>Attacks &amp; cantrips</div>
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
                  {d.attacks.map((a) => (
                    <tr key={a.name}>
                      <td>
                        <b>{a.name}</b>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{a.toHit}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {a.damage} {a.damageType}
                      </td>
                      <td className={s.muted}>
                        {[a.range, ...a.properties, a.mastery && `Mastery: ${a.mastery}`, a.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className={s.sectionTitle}>Features &amp; traits</div>
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
}: {
  c: Character;
  oneshotTitle: string;
  /** id → display name for ties. */
  names: Record<string, string>;
  sealedSecret?: boolean;
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
          <div className={s.sectionTitle} style={{ marginTop: 0 }}>
            Spellcasting · {ABILITY_NAMES[sc.ability]} · save DC {d.spell.dc} · attack {signed(d.spell.attack)}
          </div>
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
                        {sp.always && <sup title="always prepared">◆</sup>}
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
          <div className={s.muted}>◆ always prepared</div>
        </>
      )}

      <div className={s.storyGrid}>
        <div className={s.story}>
          <div className={s.sectionTitle}>Who you are</div>
          {c.story.intro && <p className={s.quote}>{c.story.intro}</p>}
          <p>{c.story.concept}</p>
          <p>
            <b>Tonight:</b> {c.story.stake}
          </p>
          <p>
            <b>You want:</b> {c.story.goal}
          </p>
          <div className={s.sectionTitle}>Ties</div>
          {c.story.ties.map((t) => (
            <p key={t.to}>
              <b>{names[t.to] ?? t.to}:</b> {t.text}
            </p>
          ))}
          <div className={s.secret}>
            <div className={s.label} style={{ color: "var(--wax)" }}>
              Your secret — for your eyes
            </div>
            <p className={open ? undefined : s.sealed}>{c.story.secret}</p>
            {!open && (
              <button type="button" className={`${s.seal} no-print`} onClick={() => setOpen(true)}>
                <span className={s.sealDisc}>break seal</span>
              </button>
            )}
          </div>
        </div>
        <div className={s.story}>
          <div className={s.sectionTitle}>Look &amp; voice</div>
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
          <div className={s.sectionTitle}>Equipment</div>
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
