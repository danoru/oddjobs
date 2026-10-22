import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { foldLive, type LiveAction, type LiveEvent, type PublicPerson } from "./live";

/** The log is chattier than claims (dice, bells): poll as fast as live play does. */
export const LIVE_POLL_MS = 2000;

type Reply = {
  error?: string;
  you?: string | null;
  people?: PublicPerson[];
  events?: LiveEvent[];
  redacted?: number[];
  cursor?: number;
};

type State = {
  code: string | null;
  events: LiveEvent[];
  people: PublicPerson[];
  you: string | null;
  cursor: number;
  redacted: number[];
  /** The cursor when this page first loaded: bells at or before it have already rung. */
  baseline: number | null;
};

const empty = (code: string | null): State => ({ code, events: [], people: [], you: null, cursor: 0, redacted: [], baseline: null });

/**
 * A table's event log (/api/tables/<code>/live), polled with a cursor so each
 * poll only carries what's new. `as` picks the view as `useGame` does: the
 * phone asks as a player even in a GM's browser, the TV as the table, the GM
 * page as whoever the cookie says. A roll the GM hides after it arrived is
 * blanked here too; one un-hidden makes the hook fetch the log afresh.
 */
export function useLive(code: string | null, as: "player" | "table" | "gm") {
  const [state, setState] = useState<State>(() => empty(code));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  });
  const url = code ? `/api/tables/${code}/live` : null;
  const query = as === "gm" ? "" : `&as=${as}`;

  const merge = useCallback((json: Reply, fresh: boolean) => {
    setState((prev) => {
      const base = fresh || prev.code !== code ? empty(code) : prev;
      const redacted = json.redacted ?? [];
      const known = new Set(base.events.map((e) => e.id));
      const events = [...base.events, ...(json.events ?? []).filter((e) => !known.has(e.id))].map((e) =>
        e.kind === "roll" && redacted.includes(e.id) && !e.redacted ? { ...e, by: null, to: null, mine: false, redacted: true, data: null } : e,
      );
      const cursor = Math.max(base.cursor, json.cursor ?? 0);
      return {
        code,
        events,
        people: json.people ?? base.people,
        you: json.you ?? null,
        cursor,
        redacted,
        baseline: base.baseline ?? cursor,
      };
    });
  }, [code]);

  const request = useCallback(
    async (method: "GET" | "POST", after: number, body?: unknown): Promise<{ ok: boolean; json: Reply }> => {
      const res = await fetch(`${url}?after=${after}${query}`, {
        method,
        cache: "no-store",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Reply };
    },
    [url, query],
  );

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; json: Reply }> => {
      const after = live.current.code === code ? live.current.cursor : 0;
      const r = await request(method, after, body);
      if (r.json.events) {
        // A roll un-hidden since we last looked: start the log over to get its dice.
        const unhidden = live.current.redacted.some((id) => !(r.json.redacted ?? []).includes(id));
        if (unhidden) {
          const fresh = await request("GET", 0);
          if (fresh.json.events) merge(fresh.json, true);
        } else merge(r.json, after === 0);
      }
      return r;
    },
    [request, code, merge],
  );

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const r = await call("GET");
        if (!alive) return;
        if (!r.ok) setError(r.json.error ?? "Couldn't reach the table — retrying.");
        else setError((e) => (e?.startsWith("Couldn't reach") ? null : e));
      } catch {
        if (alive) setError("Couldn't reach the table — retrying.");
      }
    };
    void poll();
    const t = window.setInterval(poll, LIVE_POLL_MS);
    const onVisible = () => !document.hidden && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, call]);

  /** Do something at the table. Resolves to an error message, or null when it worked. */
  const act = useCallback(
    async (action: LiveAction): Promise<string | null> => {
      if (!url) return "Join a table first";
      setBusy(true);
      try {
        const r = await call("POST", { action });
        const problem = r.ok ? null : (r.json.error ?? "That didn't work — try again.");
        setError(problem);
        return problem;
      } catch {
        const problem = "Couldn't reach the table — try again.";
        setError(problem);
        return problem;
      } finally {
        setBusy(false);
      }
    },
    [url, call],
  );

  const current = state.code === code ? state : empty(code);
  const fold = useMemo(() => foldLive(current.events), [current.events]);
  return {
    events: current.events,
    people: current.people,
    you: current.you,
    baseline: current.baseline,
    loaded: current.baseline !== null,
    fold,
    error,
    busy,
    act,
    clearError: () => setError(null),
  };
}
