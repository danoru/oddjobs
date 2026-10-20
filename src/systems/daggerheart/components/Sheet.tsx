import { useState } from "react";
import type { Character } from "@/systems/daggerheart/schema";
import { TRAITS } from "@/systems/daggerheart/schema";
import { TRAIT_NAMES, TRAIT_USES, classLine, derive, goldWords, signed } from "@/systems/daggerheart/derive";
import { LICENSE_URL, MAX_HOPE, MODIFIED_NOTE, SRD_NOTICE, STARTING_HOPE, type DomainCardInfo } from "@/systems/daggerheart/srd";
import type { Marks, Track } from "@/systems/daggerheart/live";
import { dualitySpec, damageSpec, type DhRoll } from "@/systems/daggerheart/rolls";
import s from "@/systems/dnd5e/components/sheet/Sheet.module.css";
import t from "@/components/table/Toys.module.css";
import d from "./Dh.module.css";
import { DOMAIN_INK } from "../ink";

/** A number on the sheet; a button that rolls it when the sheet is at a table. */
function Rollable({ spec, onRoll, children }: { spec: DhRoll | null; onRoll?: (r: DhRoll) => void; children: React.ReactNode }) {
  if (!onRoll || !spec) return <>{children}</>;
  return (
    <button type="button" className={t.rollable} onClick={() => onRoll(spec)}>
      {children}
      <span className={s.srOnly}> Roll {spec.label}</span>
    </button>
  );
}

/**
 * A row of slots. On paper they're empty boxes to tick; at a table (`onMark`)
 * each is a button, and tapping the next empty one marks it, the last marked
 * one clears it.
 */
export function Slots({ track, n, marked = 0, onMark, label }: { track: Track; n: number; marked?: number; onMark?: (track: Track, delta: number) => void; label: string }) {
  const cls = track === "hope" ? d.hope : d.slot;
  if (!onMark)
    return (
      <span className={d.slots} role="img" aria-label={`${label}: ${n} ${track === "hope" ? "" : "slots "}to mark`}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={cls} data-track={track} data-on={i < marked} />
        ))}
      </span>
    );
  return (
    <span className={d.slots} role="group" aria-label={`${label}: ${marked} of ${n}`} data-testid={`slots-${track}`} data-marked={marked}>
      {Array.from({ length: n }, (_, i) => {
        const on = i < marked;
        return (
          <button
            key={i}
            type="button"
            className={cls}
            data-track={track}
            data-on={on}
            aria-pressed={on}
            aria-label={`${label} ${i + 1}`}
            onClick={() => onMark(track, on ? i - marked : i + 1 - marked)}
          />
        );
      })}
    </span>
  );
}

function CardLine({ card }: { card: DomainCardInfo & { note?: string } }) {
  return (
    <div className={d.domainCard} style={{ ["--accent" as string]: DOMAIN_INK[card.domain] }}>
      <div className={d.domainHead}>
        <span>
          {card.domain} · level {card.level} · {card.type}
        </span>
        <span className={d.recall} title="Recall cost">
          recall {card.recall}
        </span>
      </div>
      <div>
        <span className={d.domainName}>{card.name}.</span> {card.gist}
        {card.note && <span className={s.muted}> ({card.note})</span>}
      </div>
    </div>
  );
}

/** The DPCGL's notice, as every Daggerheart page carries it. */
export function SrdNotice({ className }: { className?: string }) {
  return (
    <p className={className ?? d.notice}>
      {SRD_NOTICE} Licence: <a href={LICENSE_URL}>{LICENSE_URL}</a>. {MODIFIED_NOTE}
    </p>
  );
}

/** Front: what you roll and what you mark. */
export function SheetFront({
  c,
  oneshotTitle,
  titleAs: Title = "h2",
  onRoll,
  marks,
  onMark,
}: {
  c: Character;
  oneshotTitle: string;
  titleAs?: "h1" | "h2";
  /** At a table: tapping a trait or weapon rolls it. */
  onRoll?: (r: DhRoll) => void;
  /** At a table: what's marked now. */
  marks?: Marks;
  onMark?: (track: Track, delta: number) => void;
}) {
  const m = c.mech;
  const x = derive(c);
  const Section = Title === "h1" ? "h2" : "h3";

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
            {m.ancestry} · {m.community}
          </div>
          <div>Level {m.level} · Daggerheart</div>
        </div>
      </header>

      <div className={d.traits}>
        {TRAITS.map((k) => (
          <div key={k} className={d.trait}>
            <div className={d.traitName}>{TRAIT_NAMES[k]}</div>
            <div className={d.traitMod}>
              <Rollable spec={dualitySpec(TRAIT_NAMES[k], m.traits[k])} onRoll={onRoll}>
                {signed(m.traits[k])}
              </Rollable>
            </div>
            <div className={d.traitUse}>{TRAIT_USES[k]}</div>
            {x.spellcast === k && <span className={d.spellcast}>SPELLCAST</span>}
          </div>
        ))}
      </div>

      <div className={s.vitals}>
        <div className={s.vital}>
          <div className={s.label}>Evasion</div>
          <div className={s.vitalValue}>{m.evasion}</div>
          <div className={s.vitalNote}>to hit you</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Armor</div>
          <div className={s.vitalValue}>{m.armorScore}</div>
          <div className={s.vitalNote}>{m.armor?.name ?? "unarmored"}</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Proficiency</div>
          <div className={s.vitalValue}>{m.proficiency}</div>
          <div className={s.vitalNote}>damage dice</div>
        </div>
        <div className={s.vital}>
          <div className={s.label}>Spellcast</div>
          <div className={s.vitalValue} style={{ fontSize: 17 }}>
            {x.spellcast ? TRAIT_NAMES[x.spellcast] : "—"}
          </div>
        </div>
      </div>

      <div className={d.track}>
        <div className={d.thresholds} aria-label={`Damage thresholds: Major ${m.thresholds.major}, Severe ${m.thresholds.severe}`}>
          <span className={d.band}>
            MINOR <b>mark 1 HP</b>
          </span>
          <span className={d.cut}>{m.thresholds.major}</span>
          <span className={d.band}>
            MAJOR <b>mark 2 HP</b>
          </span>
          <span className={d.cut}>{m.thresholds.severe}</span>
          <span className={d.band}>
            SEVERE <b>mark 3 HP</b>
          </span>
        </div>
        <div className={d.slotsRow}>
          <span className={d.slotsLabel}>Hit Points</span>
          <Slots track="hp" n={m.hp} marked={marks?.hp} onMark={onMark} label="Hit Points marked" />
        </div>
        <div className={d.slotsRow}>
          <span className={d.slotsLabel}>Stress</span>
          <Slots track="stress" n={m.stress} marked={marks?.stress} onMark={onMark} label="Stress marked" />
        </div>
        <div className={d.slotsRow}>
          <span className={d.slotsLabel}>Armor</span>
          <Slots track="armor" n={m.armorScore} marked={marks?.armor} onMark={onMark} label="Armor Slots marked" />
          <span className={d.slotsNote}>mark one to drop damage a step</span>
        </div>
        <div className={d.slotsRow}>
          <span className={d.slotsLabel}>Hope</span>
          <Slots track="hope" n={MAX_HOPE} marked={marks?.hope} onMark={onMark} label="Hope" />
          {!marks && <span className={d.slotsNote}>start with {STARTING_HOPE}</span>}
        </div>
      </div>

      <div className={d.cols}>
        <div>
          <Section className={s.sectionTitle}>Experiences</Section>
          <div className={d.experiences}>
            {m.experiences.map((e) => (
              <span key={e.name} className={d.experience}>
                {e.name}
                <b>{signed(e.bonus)}</b>
              </span>
            ))}
          </div>
          <div className={s.muted}>Spend a Hope to add one to a roll.</div>

          <Section className={s.sectionTitle}>Weapons</Section>
          {x.weapons.length === 0 ? (
            <p className={s.muted}>Unarmed: Strength or Finesse, {m.proficiency}d4.</p>
          ) : (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Weapon</th>
                  <th>Attack</th>
                  <th>Damage</th>
                </tr>
              </thead>
              <tbody>
                {x.weapons.map((w) => (
                  <tr key={w.name}>
                    <td>
                      <b>{w.name}</b>
                      <div className={s.muted}>{[w.slot, w.range, w.burden, w.feature].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Rollable spec={dualitySpec(`${w.name} attack`, w.attack)} onRoll={onRoll}>
                        {signed(w.attack)}
                      </Rollable>{" "}
                      <span className={s.muted}>{TRAIT_NAMES[w.trait]}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Rollable spec={damageSpec(`${w.name} damage`, w.dice)} onRoll={onRoll}>
                        {w.damage}
                      </Rollable>{" "}
                      {w.damageType === "magic" ? "mag" : "phy"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {m.armor?.feature && (
            <p className={s.muted} style={{ marginTop: 6 }}>
              <b>{m.armor.name}:</b> {m.armor.feature}
            </p>
          )}
        </div>

        <div>
          <Section className={s.sectionTitle}>Loadout · {x.domains.join(" & ")}</Section>
          {x.loadout.map((card) => (
            <CardLine key={card.name} card={card} />
          ))}
        </div>
      </div>

      <Section className={s.sectionTitle}>Features</Section>
      <div className={s.features}>
        {m.features.map((f) => (
          <p key={f.name} className={s.feature}>
            <span className={s.featureName}>
              {f.name}
              {f.hope ? " (3 Hope)" : ""}.
            </span>{" "}
            {f.text}
            {f.uses && (
              <span className={s.muted}>
                {" "}
                {f.uses.max}× per {f.uses.per}
              </span>
            )}
          </p>
        ))}
        {x.hopeFeature && !m.features.some((f) => f.hope) && (
          <p className={s.feature}>
            <span className={s.featureName}>{x.hopeFeature.name} (3 Hope).</span> {x.hopeFeature.gist}
          </p>
        )}
      </div>
      <div className={s.footer}>
        <span>{oneshotTitle}</span>
        <span>Tear-Off · front</span>
      </div>
    </section>
  );
}

/** Back: who they are, ties, the secret, kit and the vault. */
export function SheetBack({
  c,
  oneshotTitle,
  names,
  sealedSecret = false,
  sectionAs: Section = "h3",
}: {
  c: Character;
  oneshotTitle: string;
  names: Record<string, string>;
  sealedSecret?: boolean;
  sectionAs?: "h2" | "h3";
}) {
  const m = c.mech;
  const x = derive(c);
  const [open, setOpen] = useState(!sealedSecret);
  return (
    <section className={s.page}>
      <div className={s.storyGrid}>
        <div className={s.story}>
          <Section className={s.sectionTitle} style={{ marginTop: 0 }}>
            Who you are
          </Section>
          {c.story.intro && <p className={s.quote}>{c.story.intro}</p>}
          <p>{c.story.concept}</p>
          <p>
            <b>Tonight:</b> {c.story.stake}
          </p>
          <p>
            <b>You want:</b> {c.story.goal}
          </p>
          <Section className={s.sectionTitle}>Ties</Section>
          {c.story.ties.map((tie) => (
            <p key={tie.to}>
              <b>{names[tie.to] ?? tie.to}:</b> {tie.text}
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
          {c.story.background.length > 0 && (
            <>
              <Section className={s.sectionTitle}>Background</Section>
              {c.story.background.map((q) => (
                <p key={q.question}>
                  <i>{q.question}</i> {q.answer}
                </p>
              ))}
            </>
          )}
        </div>
        <div className={s.story}>
          <Section className={s.sectionTitle} style={{ marginTop: 0 }}>
            Look &amp; voice
          </Section>
          <p>{c.story.appearance}</p>
          <p>
            <b>Voice:</b> {c.story.voice}
          </p>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            {c.story.mannerisms.map((y) => (
              <li key={y}>{y}</li>
            ))}
          </ul>
          <Section className={s.sectionTitle}>Inventory</Section>
          <ul className={s.list}>
            {m.equipment.map((e) => (
              <li key={e.name + (e.note ?? "")}>
                <span>
                  {e.qty > 1 ? `${e.qty} × ` : ""}
                  {e.name}
                  {e.note && <span className={s.muted}> — {e.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 6 }}>
            <b>Gold:</b> {goldWords(m.gold)}
          </p>
          {x.vault.length > 0 && (
            <>
              <Section className={s.sectionTitle}>The vault</Section>
              {x.vault.map((card) => (
                <CardLine key={card.name} card={card} />
              ))}
            </>
          )}
          {m.bonuses.note && (
            <p className={s.muted} style={{ marginTop: 6 }}>
              <b>Bonuses:</b> {m.bonuses.note}
            </p>
          )}
          <SrdNotice />
        </div>
      </div>
      <div className={s.footer}>
        <span>{oneshotTitle}</span>
        <span>Tear-Off · back</span>
      </div>
    </section>
  );
}
