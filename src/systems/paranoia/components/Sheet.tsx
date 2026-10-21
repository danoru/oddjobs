import { useState } from "react";
import type { Character, Naughty, Skill, Stat } from "@/systems/paranoia/schema";
import { STATS } from "@/systems/paranoia/schema";
import { SKILL_NAMES, STAT_NAMES, cloneName, signed, skillsOf, stats } from "@/systems/paranoia/derive";
import { CLEARANCE_INK, CLEARANCE_NAMES, CLONES, FLAG_NAMES, STARTING_MOXIE, WOUND_NAMES } from "@/systems/paranoia/rules";
import type { PMarks, PTrack } from "@/systems/paranoia/live";
import s from "@/systems/dnd5e/components/sheet/Sheet.module.css";
import t from "@/components/table/Toys.module.css";
import p from "./Pa.module.css";

/** What a tap on the sheet rolls: a stat on its own, or a stat with one of its skills. */
export interface NodeSpec {
  label: string;
  stat: Stat;
  skill: Skill | null;
}

/** The play aid's notice: there's no licence for Paranoia, so we say what this is. */
export function PlayAidNotice({ className }: { className?: string }) {
  return (
    <p className={className ?? p.notice}>
      A play aid for PARANOIA (Mongoose Publishing) for tables that own the Core Book. Not affiliated with or endorsed by Mongoose Publishing or the
      game&apos;s owners. Every rule and description here is our own paraphrase. Friend Computer reminds you that reading this notice is mandatory.
    </p>
  );
}

function Roll({ spec, onRoll, children }: { spec: NodeSpec; onRoll?: (r: NodeSpec) => void; children: React.ReactNode }) {
  if (!onRoll) return <>{children}</>;
  return (
    <button type="button" className={t.rollable} onClick={() => onRoll(spec)}>
      {children}
      <span className={s.srOnly}> Roll {spec.label}</span>
    </button>
  );
}

/** A track of named steps (wounds, Flags): on paper boxes to tick; at a table each step is a button. */
function Steps({ names, at, kind, onSet, label }: { names: readonly string[]; at?: number; kind: string; onSet?: (n: number) => void; label: string }) {
  return (
    <span className={p.track} role="group" aria-label={`${label}${at !== undefined ? `: ${names[at]}` : ""}`} data-testid={`track-${kind}`} data-at={at}>
      {names.map((n, i) =>
        onSet ? (
          <button key={n} type="button" className={p.step} data-kind={kind} data-on={at === i} aria-pressed={at === i} onClick={() => onSet(i)}>
            {n}
          </button>
        ) : (
          <span key={n} className={p.step} data-kind={kind} data-on={at === i}>
            {n}
          </span>
        ),
      )}
    </span>
  );
}

/** The public side: what Friend Computer is cleared to know. */
export function PublicSide({
  c,
  team,
  objectives,
  oneshotTitle,
  titleAs: Title = "h2",
  onRoll,
  marks,
  onMark,
  wanted = FLAG_NAMES,
}: {
  c: Character | Omit<Character, "naughty">;
  team: string;
  objectives: string[];
  oneshotTitle: string;
  titleAs?: "h1" | "h2";
  onRoll?: (r: NodeSpec) => void;
  /** At a table: the record as it stands. */
  marks?: PMarks;
  onMark?: (track: PTrack, delta: number) => void;
  /** The treason track's step names (five Flags, or six levels). */
  wanted?: readonly string[];
}) {
  const m = c.mech;
  const st = stats(m);
  const ink = CLEARANCE_INK[m.clone.clearance];
  const Section = Title === "h1" ? "h2" : "h3";
  const clone = marks?.clone ?? m.clone.number;
  const moxie = marks?.moxie ?? m.moxie;
  const set = (track: PTrack, now: number) => (n: number) => onMark?.(track, n - now);
  return (
    <section className={`${s.page} ${p.form}`} style={{ ["--clearance-bg" as string]: ink.bg, ["--clearance-fg" as string]: ink.fg }}>
      <div className={p.band}>
        <div>
          <Title className={p.cloneName}>{cloneName(m, Math.min(clone, CLONES))}</Title>
          <div style={{ fontSize: 13 }}>
            &ldquo;{c.name}&rdquo; · {c.poster.epithet} · {c.story.pronouns}
          </div>
        </div>
        <div className={p.clearance}>
          Clearance <b>{CLEARANCE_NAMES[m.clone.clearance]}</b>
          {clone > CLONES ? "out of clones" : `clone ${clone} of ${CLONES}`}
        </div>
      </div>
      <div className={p.pii}>
        <span className={p.field}>
          <span className={p.fieldLabel}>Team</span>
          {team}
        </span>
        <span className={p.field}>
          <span className={p.fieldLabel}>Service group</span>
          {m.serviceGroup}
        </span>
        <span className={p.field}>
          <span className={p.fieldLabel}>Mandatory Bonus Duty</span>
          {m.bonusDuty}
        </span>
        <span className={p.field} style={{ gridColumn: "span 2" }}>
          <span className={p.fieldLabel}>Treason Button</span>
          {c.story.treasonButton}
        </span>
        <span className={p.field}>
          <span className={p.fieldLabel}>Violence Button</span>
          {c.story.violenceButton}
        </span>
      </div>

      <div className={p.stats}>
        {STATS.map((stat) => (
          <div key={stat} className={p.stat}>
            <div className={p.statHead}>
              <span>{STAT_NAMES[stat]}</span>
              <span className={p.statValue}>
                <Roll spec={{ label: STAT_NAMES[stat], stat, skill: null }} onRoll={onRoll}>
                  {st[stat]}
                </Roll>
              </span>
            </div>
            {skillsOf(stat).map((k) => (
              <div key={k} className={p.skill} data-zero={m.skills[k] === 0}>
                <span>{SKILL_NAMES[k]}</span>
                <Roll spec={{ label: SKILL_NAMES[k], stat, skill: k }} onRoll={onRoll}>
                  {signed(m.skills[k])}
                </Roll>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={s.muted} style={{ marginBottom: 8 }}>
        Roll {onRoll ? "(tap a stat or skill)" : ""}: stat + skill + gear dice, plus the Computer die. Every 5 or 6 succeeds.
      </div>

      <div className={p.wellness}>
        <div className={p.track}>
          <span className={p.trackLabel}>Wounds</span>
          <Steps names={WOUND_NAMES} at={marks?.wounds} kind="wounds" label="Wounds" onSet={onMark && marks ? set("wounds", marks.wounds) : undefined} />
        </div>
        <div className={p.track}>
          <span className={p.trackLabel}>Moxie</span>
          <span className={p.track} role={onMark ? "group" : "img"} aria-label={`Moxie ${moxie} of ${STARTING_MOXIE}`} data-testid="track-moxie" data-at={moxie}>
            {Array.from({ length: Math.max(STARTING_MOXIE, m.moxie) }, (_, i) =>
              onMark && marks ? (
                <button key={i} type="button" className={p.pip} data-on={i < moxie} aria-label={`Moxie ${i + 1}`} onClick={() => onMark("moxie", (i < moxie ? i : i + 1) - moxie)} />
              ) : (
                <span key={i} className={p.pip} data-on={marks ? i < moxie : false} />
              ),
            )}
          </span>
        </div>
        <div className={p.track}>
          <span className={p.trackLabel}>Flags</span>
          <Steps names={wanted} at={marks?.treason} kind="flag" label="Treason" />
        </div>
        <div className={p.track}>
          <span className={p.trackLabel}>XP Points</span>
          <span data-testid="track-xp">{marks?.xp ?? m.xp}</span>
        </div>
      </div>

      <div className={s.cols} style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <Section className={s.sectionTitle}>Mission objectives</Section>
          {objectives.map((o) => (
            <div key={o} className={p.checkLine}>
              <span className={p.checkBox} aria-hidden="true" />
              <span>{o}</span>
            </div>
          ))}
        </div>
        <div>
          <Section className={s.sectionTitle}>Assigned gear</Section>
          <ul className={s.list}>
            {m.gear.map((g) => (
              <li key={g.name}>
                <span>
                  {g.name}
                  {g.level ? <b> +{g.level}</b> : null}
                  {g.note && <span className={s.muted}> — {g.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={s.footer}>
        <span>{oneshotTitle}</span>
        <span>Troubleshooter sheet · public side</span>
      </div>
    </section>
  );
}

/** The naughty side: never in a page a player didn't earn. Sealed until they break it. */
export function NaughtySide({
  c,
  naughty,
  oneshotTitle,
  sealed = false,
  sectionAs: Section = "h3",
}: {
  c: Pick<Character, "id" | "name" | "mech" | "story">;
  naughty: Naughty;
  oneshotTitle: string;
  sealed?: boolean;
  sectionAs?: "h2" | "h3";
}) {
  const [open, setOpen] = useState(!sealed);
  const objectives = [naughty.societyObjective, ...naughty.objectives].filter((x): x is string => Boolean(x));
  return (
    <section className={`${s.page} ${p.form} ${p.naughty}`} data-testid="naughty-side">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Section className={s.sectionTitle} style={{ margin: 0 }}>
          {cloneName(c.mech)} · the naughty side
        </Section>
        <span className={p.stamp}>Do not show the Computer</span>
      </div>
      {!open ? (
        <div className={s.secret}>
          <p className={s.sealed} aria-hidden="true">
            Your secret society, your mutant power and what they really want from you tonight.
          </p>
          <button type="button" className={`${s.seal} no-print`} onClick={() => setOpen(true)} aria-label="break seal: read your naughty side">
            <span className={s.sealDisc} aria-hidden="true">
              break seal
            </span>
          </button>
        </div>
      ) : (
        <div className={s.storyGrid}>
          <div className={s.story}>
            <p>
              <span className={p.fieldLabel}>Secret society</span>
              <b data-testid="my-society">{naughty.society}</b>
            </p>
            <p>
              <span className={p.fieldLabel}>Mutant power</span>
              <b>{naughty.mutantPower.name}.</b> {naughty.mutantPower.text}
            </p>
            <Section className={s.sectionTitle}>Secret objectives</Section>
            {objectives.map((o) => (
              <div key={o} className={p.checkLine}>
                <span className={p.checkBox} aria-hidden="true" />
                <span>{o}</span>
              </div>
            ))}
            {naughty.secret && (
              <p style={{ marginTop: 8 }}>
                <b>Only you know:</b> {naughty.secret}
              </p>
            )}
          </div>
          <div className={s.story}>
            {naughty.treasonousGear.length > 0 && (
              <>
                <Section className={s.sectionTitle} style={{ marginTop: 0 }}>
                  Treasonous gear (do not use openly)
                </Section>
                <ul className={s.list}>
                  {naughty.treasonousGear.map((g) => (
                    <li key={g.name}>
                      <span>
                        {g.name}
                        {g.level ? <b> +{g.level}</b> : null}
                        {g.note && <span className={s.muted}> — {g.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {naughty.favours.serviceGroup.length > 0 && (
              <>
                <Section className={s.sectionTitle}>Service group favours</Section>
                {naughty.favours.serviceGroup.map((f) => (
                  <div key={f} className={p.checkLine}>
                    <span className={p.checkBox} aria-hidden="true" />
                    <span>{f}</span>
                  </div>
                ))}
              </>
            )}
            {naughty.favours.society.length > 0 && (
              <>
                <Section className={s.sectionTitle}>Secret society favours</Section>
                {naughty.favours.society.map((f) => (
                  <div key={f} className={p.checkLine}>
                    <span className={p.checkBox} aria-hidden="true" />
                    <span>{f}</span>
                  </div>
                ))}
              </>
            )}
            <Section className={s.sectionTitle}>Evidence (for blackmail and accusations)</Section>
            <div className={p.lines} />
            <div className={p.lines} />
            <div className={p.lines} />
          </div>
        </div>
      )}
      <PlayAidNotice />
      <div className={s.footer}>
        <span>{oneshotTitle}</span>
        <span>Troubleshooter sheet · naughty side</span>
      </div>
    </section>
  );
}
