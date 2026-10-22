import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FATES, survivorSchema, type Survivor } from "./legacy";
import type { Epilogue } from "@/components/gazette/Gazette";
import type { PublicAnyOneShot } from "./public";

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
export function survivorsFrom(os: PublicAnyOneShot, ep: Epilogue): Survivor[] {
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

type Shared = { epilogue: Epilogue | null; canEdit: "all" | string[] };

/**
 * The epilogue for a one-shot: kept per table on the server when this browser
 * is at a table (so the chronicle can gather it), else on this device. At a
 * table the GM writes the whole front page and each player only their own
 * character's line; edits save a moment after typing stops.
 */
const JSON_HEADERS = { "Content-Type": "application/json" };

export function useSharedEpilogue(slug: string, code: string | null, playerId: string | null) {
  const local = useEpilogue(slug);
  const [shared, setShared] = useState<Shared | null>(null);
  const [draft, setDraft] = useState<Epilogue | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "error" | null>(null);
  const lastEdit = useRef(0);
  const headers = JSON_HEADERS;

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const poll = async () => {
      if (Date.now() - lastEdit.current < 4000) return;
      const res = await fetch(`/api/tables/${code}/epilogue`, { cache: "no-store", headers }).catch(() => null);
      if (!alive || !res?.ok) return;
      const json = (await res.json()) as Shared;
      setShared(json);
      setDraft(null);
    };
    void poll();
    const t = window.setInterval(poll, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // Who is asking is the session or guest pass: sitting down (a new player) asks again.
  }, [code, headers, playerId]);

  const ep = draft ?? shared?.epilogue ?? emptyEpilogue();
  const canEdit = useMemo(() => shared?.canEdit ?? [], [shared]);

  // Save a moment after the last keystroke.
  useEffect(() => {
    if (!code || !draft) return;
    const t = window.setTimeout(async () => {
      setSaved("saving");
      let res: Response | null;
      if (canEdit === "all") {
        res = await fetch(`/api/tables/${code}/epilogue`, { method: "PUT", headers, body: JSON.stringify({ epilogue: draft }) }).catch(() => null);
      } else {
        res = null;
        for (const id of canEdit) {
          const e = draft.entries[id] ?? {};
          res = await fetch(`/api/tables/${code}/epilogue`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ characterId: id, entry: { line: e.line ?? "", playedBy: e.playedBy ?? "" } }),
          }).catch(() => null);
        }
      }
      setSaved(res?.ok ? "saved" : "error");
    }, 700);
    return () => window.clearTimeout(t);
  }, [code, draft, canEdit, headers]);

  if (!code) return { ep: local.ep, setEp: local.setEp, canEdit: "all" as const, shared: false, saved: null };
  return {
    ep,
    setEp: (next: Epilogue) => {
      lastEdit.current = Date.now();
      setDraft(next);
    },
    canEdit,
    shared: true,
    saved,
  };
}
