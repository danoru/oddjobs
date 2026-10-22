import { FATE_LABEL, type Fate } from "@/lib/legacy";
import type { PublicAnyOneShot } from "@/lib/public";
import { PosterIcon } from "@/components/PosterIcon";
import s from "./Gazette.module.css";

export interface EpilogueEntry {
  fate?: Fate;
  line?: string;
  title?: string;
  scar?: string;
  playedBy?: string;
  /** The GM's note that this character's secret came out at the table: it may then show in its player's own history. */
  revealed?: boolean;
}

export interface Epilogue {
  headline: string;
  subhead: string;
  lead: string;
  date: string;
  entries: Record<string, EpilogueEntry>;
}

/** The morning-after front page, typeset from the table's epilogue. */
export function Gazette({ os, ep }: { os: PublicAnyOneShot; ep: Epilogue }) {
  const g = os.gazette ?? { name: `The ${os.title.replace(/^the\s+/i, "")} Gazette`, town: os.setting.split(/[(;,.]/)[0].trim(), price: "One penny" };
  const shown = os.cast.filter((c) => ep.entries[c.id]?.fate || ep.entries[c.id]?.line);
  const living = shown.filter((c) => ep.entries[c.id].fate !== "fell");
  const fallen = shown.filter((c) => ep.entries[c.id].fate === "fell");
  const nice = new Date(`${ep.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const item = (id: string) => {
    const c = os.cast.find((x) => x.id === id)!;
    const e = ep.entries[id];
    const known = e.title ? `the ${e.title}` : c.poster.epithet;
    return (
      <div key={id} className={s.item}>
        <div className={s.itemHead}>
          {c.name.toUpperCase()}, {known.toUpperCase()}
          {e.fate ? ` · ${FATE_LABEL[e.fate].toUpperCase()}` : ""}
        </div>
        {e.line && <span className={s.quote}>&ldquo;{e.line}&rdquo;</span>}
        {e.scar && <span> They carry a mark of the night: {e.scar}.</span>}
      </div>
    );
  };

  return (
    <article className={s.paper}>
      <div className={s.ears}>
        <span>{g.town.toUpperCase()}</span>
        <span>{g.price.toUpperCase()}</span>
      </div>
      <h1 className={s.masthead}>{g.name}</h1>
      <div className={s.dateline}>
        {/* A blank paper is dated today, which the server and the browser can see differently around midnight. */}
        <span suppressHydrationWarning>{nice}</span>
        <span>Morning edition</span>
      </div>
      <h2 className={s.headline}>{ep.headline || os.title}</h2>
      {ep.subhead && <p className={s.subhead}>{ep.subhead}</p>}
      <div className={s.woodcut} aria-hidden="true">
        {os.cast.map((c) => (
          <PosterIcon key={c.id} icon={c.poster.icon} size={34} />
        ))}
      </div>
      <div className={s.cols}>
        {ep.lead && (
          <p className={s.lead} style={{ marginTop: 0 }}>
            {ep.lead}
          </p>
        )}
        {living.map((c) => item(c.id))}
        {fallen.length > 0 && (
          <>
            <div className={s.section}>In Memoriam</div>
            {fallen.map((c) => item(c.id))}
          </>
        )}
      </div>
      <div className={s.foot}>
        Printed the morning after {os.title} · {shown.filter((c) => ep.entries[c.id].playedBy).length > 0 ? "Correspondents: " + shown.map((c) => ep.entries[c.id].playedBy).filter(Boolean).join(", ") : "Oddjobs"}
      </div>
    </article>
  );
}
