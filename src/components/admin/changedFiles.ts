import { useCallback, useSyncExternalStore } from "react";

/**
 * The content files the builder has written on this machine since you last
 * said you'd committed them: the "remember to commit" note. Kept per
 * browser; the files themselves are what git sees.
 */
const KEY = "tearoff:admin:changed";
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* private mode */
  }
  if (raw !== cache.raw) {
    let list: string[] = [];
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      list = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      list = [];
    }
    cache = { raw, list };
  }
  return cache.list;
}

function write(list: string[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

const EMPTY: string[] = [];

export function useChangedFiles() {
  const files = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => EMPTY,
  );
  const add = useCallback((more: string[] | undefined) => {
    if (!more?.length) return;
    write([...new Set([...read(), ...more])].sort());
  }, []);
  const clear = useCallback(() => write([]), []);
  return { files, add, clear };
}
