import { useCallback, useEffect, useRef, useState } from "react";

/** Live play changes faster than claims do; poll a little quicker (the actor's own phone updates at once). */
export const GAME_POLL_MS = 2000;

type Reply<V> = { error?: string; game?: V } & Record<string, unknown>;

/**
 * A table's live game (/api/tables/<code>/game), polled. `as` says which view
 * to ask for: the phone asks as a player even in a GM's browser, the TV as
 * the table, and the GM page as whoever the cookie says. `act` sends an action
 * and shows the answer straight away.
 */
export function useGame<V, X extends Record<string, unknown> = Record<string, unknown>>(
  code: string | null,
  as: "player" | "table" | "gm",
) {
  const [game, setGame] = useState<V | null>(null);
  const [extras, setExtras] = useState<Partial<X>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sent = useRef(0);
  const applied = useRef(0);
  const url = code ? `/api/tables/${code}/game${as === "gm" ? "" : `?as=${as}`}` : null;

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; json: Reply<V> }> => {
      const seq = ++sent.current;
      const res = await fetch(url!, {
        method,
        cache: "no-store",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as Reply<V>;
      if (json.game && seq >= applied.current) {
        applied.current = seq;
        const { game: g, error: _e, ...rest } = json; // eslint-disable-line @typescript-eslint/no-unused-vars
        setGame(g as V);
        setExtras(rest as Partial<X>);
      }
      return { ok: res.ok, json };
    },
    [url],
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
    const t = window.setInterval(poll, GAME_POLL_MS);
    const onVisible = () => !document.hidden && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, call]);

  /** Send an action. Resolves to an error message, or null when it worked. */
  const act = useCallback(
    async (action: unknown): Promise<string | null> => {
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

  return { game, extras, error, busy, act, clearError: () => setError(null) };
}
