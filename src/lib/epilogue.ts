import { useCallback, useMemo, useSyncExternalStore } from "react";
import { FATES, survivorSchema, type Survivor } from "./legacy";
import type { Epilogue } from "@/components/gazette/Gazette";
import type { PublicOneShot } from "./public";

/** The table's epilogue for a one-shot, kept on this device until it's printed and recorded. */

const key = (slug: string) => `tearoff:epilogue:${slug}`;
const EVENT = "tearoff:epilogue";

export const today = () => new Date().toISOString().slice(0, 10);

export const emptyEpilogue = (): Epilogue => ({ headline: "", subhead: "", lead: "", date: today(), entries: {} });

function parse(raw: string | null): Epilogue {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Epilogue>) : null;
    if (!v || typeof v !== "object") return emptyEpilogue();
    const entries: Epilogue["entries"] = {};
    for (const [id, e] of Object.entries(v.entries ?? {})) {
      if (!e || typeof e !== "object") continue;
      entries[id] = {
        fate: FATES.includes(e.fate as never) ? e.fate : undefined,
        line: typeof e.line === "string" ? e.line : undefined,
        title: typeof e.title === "string" ? e.title : undefined,
        scar: typeof e.scar === "string" ? e.scar : undefined,
        playedBy: typeof e.playedBy === "string" ? e.playedBy : undefined,
      };
    }
    return {
      headline: typeof v.headline === "string" ? v.headline : "",
      subhead: typeof v.subhead === "string" ? v.subhead : "",
      lead: typeof v.lead === "string" ? v.lead : "",
      date: typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : today(),
      entries,
    };
  } catch {
    return emptyEpilogue();
  }
}

export function useEpilogue(slug: string) {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(key(slug));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const ep = useMemo(() => parse(raw), [raw]);
  const setEp = useCallback(
    (next: Epilogue) => {
      try {
        window.localStorage.setItem(key(slug), JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [slug],
  );
  return { ep, setEp };
}

/** Records for the shared world: one per character the table gave a fate. */
export function survivorsFrom(os: PublicOneShot, ep: Epilogue): Survivor[] {
  return os.cast.flatMap((c) => {
    const e = ep.entries[c.id];
    if (!e?.fate) return [];
    const rec = survivorSchema.safeParse({
      id: `${os.slug}/${c.id}/${ep.date}`,
      oneshot: os.slug,
      oneshotTitle: os.title,
      characterId: c.id,
      name: c.name,
      epithet: c.poster.epithet,
      fate: e.fate,
      title: e.title?.trim() || undefined,
      scar: e.scar?.trim() || undefined,
      line: e.line?.trim() || undefined,
      playedBy: e.playedBy?.trim() || undefined,
      date: ep.date,
    });
    return rec.success ? [rec.data] : [];
  });
}
