import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { decodeTweaks, emptyTweaks, tweaksSchema, type Tweaks } from "./customize";

/**
 * Per-browser state. v1 has no server: claims and tweaks live in localStorage,
 * which can be missing (private windows, blocked storage) — every access is
 * guarded and the UI works without it. Components read it through
 * useSyncExternalStore so the server render and first client render agree.
 */

const CHANGED = "tearoff:storage";

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the change just won't stick */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
}

function parseJson(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const claimsKey = (slug: string) => `tearoff:claims:${slug}`;
const tweaksKey = (slug: string, id: string) => `tearoff:tweaks:${slug}/${id}`;

/** Which posters this browser has torn off for a one-shot. */
export function useClaims(slug: string) {
  const raw = useStored(claimsKey(slug));
  const claims = useMemo(() => {
    const v = parseJson(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  }, [raw]);

  const toggle = useCallback(
    (id: string) =>
      write(claimsKey(slug), claims.includes(id) ? claims.filter((x) => x !== id) : [...claims, id]),
    [slug, claims],
  );
  const reset = useCallback(() => write(claimsKey(slug), []), [slug]);

  return { claims, toggle, reset };
}

/**
 * A player's tweaks to one character. A `#t=<encoded>` share link in the URL
 * is saved over what's stored, then stripped from the address bar.
 */
export function useTweaks(slug: string, id: string) {
  useEffect(() => {
    const hash = window.location.hash.match(/[#&]t=([^&]+)/);
    const shared = hash ? decodeTweaks(hash[1]) : null;
    if (!shared) return;
    write(tweaksKey(slug, id), shared);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [slug, id]);

  const raw = useStored(tweaksKey(slug, id));
  const tweaks = useMemo(() => {
    const parsed = tweaksSchema.safeParse(parseJson(raw));
    return parsed.success ? parsed.data : emptyTweaks();
  }, [raw]);

  const setTweaks = useCallback((t: Tweaks) => write(tweaksKey(slug, id), t), [slug, id]);

  return { tweaks, setTweaks };
}
