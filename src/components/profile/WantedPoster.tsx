import Link from "next/link";
import { PosterIcon } from "@/components/PosterIcon";
import { tiltFor } from "@/components/board/Poster";
import { FATE_LABEL } from "@/lib/legacy";
import { ROLE_LABEL, type HistoryEntry } from "@/lib/history";
import type { Profile } from "@/lib/profile.server";
import b from "@/components/board/Board.module.css";
import s from "./Profile.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "21 Oct 2026", the same on the server and in the browser. */
export function nightOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return m ? `${d} ${MONTHS[m - 1]} ${y}` : day;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The poster itself: the woodcut, the name, the aliases and scars they earned, and the bounty. */
export function WantedPoster({ profile: p }: { profile: Profile }) {
  const { summary } = p;
  return (
    <article className={`${b.paper} ${s.wanted}`} style={{ ["--tilt" as string]: `${tiltFor(p.username, 1.2)}deg` }} aria-labelledby="wanted-name">
      <span className={b.pin} aria-hidden="true" />
      <div className={s.header} aria-hidden="true">
        WANTED
      </div>
      <p className={s.subhead}>for odd jobs, at any table</p>
      <div className={s.portrait}>
        {p.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.portrait} alt={`Woodcut portrait of ${p.displayName}`} width={240} height={240} />
        ) : (
          <PosterIcon icon="eye" size={96} />
        )}
      </div>
      <h1 id="wanted-name" className={s.name}>
        {p.displayName}
      </h1>
      {p.pronouns && <p className={s.pronouns}>{p.pronouns}</p>}
      <hr className={s.rule} />
      <p className={s.label}>Also known as</p>
      {summary.aliases.length ? (
        <ul className={s.aliases}>
          {summary.aliases.map((a) => (
            <li key={a.title} title={`${a.character}, after ${a.oneshot}`}>
              the {a.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.none}>No titles yet</p>
      )}
      <p className={s.label}>Distinguishing marks</p>
      {summary.scars.length ? (
        <ul className={s.scars}>
          {summary.scars.map((x, i) => (
            <li key={i} title={`${x.character}, after ${x.oneshot}`}>
              {x.scar}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.none}>Not a scratch</p>
      )}
      <div className={s.bounty}>
        <span className={s.bountyLabel}>BOUNTY</span>
        <span className={s.bountyCount}>{summary.bounty}</span>
        <span className={s.bountyLabel}>{summary.bounty === 1 ? "JOB SURVIVED" : "JOBS SURVIVED"}</span>
        <p className={s.tally}>
          {plural(summary.played, "seat")} played to the end · {plural(summary.ran, "game")} run
        </p>
      </div>
      {p.own && (
        <Link href="/settings" prefetch={false} className={s.edit}>
          Change your name, pronouns or portrait
        </Link>
      )}
    </article>
  );
}

/** One job on the record: when, which one-shot, how they sat, and for a player what became of the character. */
function Job({ e, own }: { e: HistoryEntry; own: boolean }) {
  const c = e.character;
  return (
    <li className={s.job}>
      <span className={s.jobTitle}>{e.title}</span>
      <span className={s.jobMeta}>
        {nightOf(e.date)} · {e.role === "player" ? (own ? "you played" : "played") : own ? `you were ${e.role === "gm" ? "the" : "a"} ${ROLE_LABEL[e.role]}` : `as ${e.role === "gm" ? "the" : "a"} ${ROLE_LABEL[e.role]}`}
        {e.inPaper ? " · in the paper" : ""}
      </span>
      {c && (
        <>
          <p className={s.as}>
            as <b>{c.name}</b>
            {c.epithet && <i>, {c.epithet}</i>}
            {c.fate && (
              <span className={s.fate} data-fate={c.fate}>
                {FATE_LABEL[c.fate]}
              </span>
            )}
          </p>
          {(c.title || c.scar) && (
            <p className={s.as}>
              {c.title && <>the {c.title}</>}
              {c.title && c.scar && " · "}
              {c.scar && <i>{c.scar}</i>}
            </p>
          )}
          {c.line && <p className={s.line}>&ldquo;{c.line}&rdquo;</p>}
          {c.secret && (
            <p className={s.secret}>
              <b>Your secret, out at the table:</b> {c.secret}
            </p>
          )}
        </>
      )}
      <span className={s.links}>
        <Link href={`/${e.oneshot}/epilogue?table=${e.code}`} prefetch={false}>
          {e.inPaper ? "the broadsheet" : "the morning after"}
        </Link>
        <Link href={`/${e.oneshot}/tapestry?table=${e.code}`} prefetch={false}>
          the tapestry
        </Link>
      </span>
    </li>
  );
}

/** Every job they saw to the end, newest first. */
export function JobRecord({ profile: p }: { profile: Profile }) {
  return (
    <section className={b.note} style={{ ["--tilt" as string]: "0.6deg" }} aria-labelledby="record-title">
      <span className={b.pin} aria-hidden="true" />
      <h2 id="record-title" className={b.noteTitle}>
        {p.own ? "Your record" : "The record"}
      </h2>
      {p.history.length === 0 ? (
        <p className={s.none}>{p.own ? "No jobs finished yet. The board has work." : "No jobs finished yet."}</p>
      ) : (
        <ul className={b.yarnList} style={{ listStyle: "none" }}>
          {p.history.map((e) => (
            <Job key={`${e.code}:${e.role}:${e.character?.id ?? ""}`} e={e} own={p.own} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The cabinet: phase 13's keepsakes, one small object per job per role,
 * drawn from these same history entries (oneshot, role, character, fate).
 * Nothing to show until then, so it isn't drawn.
 */
export function Cabinet({ entries }: { entries: HistoryEntry[] }) {
  void entries;
  return null;
}
