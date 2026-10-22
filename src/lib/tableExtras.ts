import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_MS } from "./tables";
import type { FlashbackView, LetterView } from "./letters";

/**
 * Letters and session-zero answers at a table, polled like the claims are.
 * The server decides what each asker may see (GM: everything; player: what's
 * addressed to characters they hold), so the hooks are the same for both.
 */

function usePolled<T>(url: string | null, pick: (json: unknown) => T, empty: T) {
  const [data, setData] = useState<T>(empty);
  const [error, setError] = useState<string | null>(null);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  const call = useCallback(
    async (method: string, body?: unknown, query = ""): Promise<boolean> => {
      if (!url) return false;
      try {
        const res = await fetch(url + query, {
          method,
          cache: "no-store",
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((json as { error?: string }).error ?? "That didn't work — try again.");
          return false;
        }
        setData(pickRef.current(json));
        setError(null);
        return true;
      } catch {
        setError("Couldn't reach the table — retrying.");
        return false;
      }
    },
    [url],
  );

  useEffect(() => {
    if (!url) return;
    const poll = () => {
      if (!document.hidden) void call("GET");
    };
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(t);
  }, [url, call]);

  return { data, error, call };
}

export function useLetters(code: string | null) {
  const { data, error, call } = usePolled<LetterView[]>(
    code ? `/api/tables/${code}/letters` : null,
    (j) => (j as { letters?: LetterView[] }).letters ?? [],
    [],
  );
  return {
    letters: data,
    error,
    deliver: (letterId: string) => call("POST", { letterId }),
    takeBack: (letterId: string) => call("DELETE", undefined, `?letterId=${encodeURIComponent(letterId)}`),
    open: (letterId: string) => call("PATCH", { letterId }),
  };
}

export function useFlashbacks(code: string | null) {
  const { data, error, call } = usePolled<FlashbackView[]>(
    code ? `/api/tables/${code}/flashbacks` : null,
    (j) => (j as { flashbacks?: FlashbackView[] }).flashbacks ?? [],
    [],
  );
  return { flashbacks: data, error, answer: (characterId: string, answer: string) => call("POST", { characterId, answer }) };
}
