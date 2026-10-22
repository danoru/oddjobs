import { useEffect, useState } from "react";
import { fullLoad } from "./fullLoad";
import type { Prefs } from "./prefs";

/**
 * Who's signed in, for navigation only (the GM bar, the header): asks
 * /api/whoami once per page load and shares the answer. Asking also
 * refreshes the session; if it has ended (account disabled, password changed
 * elsewhere) a member page sends the browser to the door. Pages and APIs
 * check the user again themselves.
 */

export interface Whoami {
  user: { username: string; displayName: string; role: "admin" | "member"; author: boolean; canInvite: boolean } | null;
  /** Games the user runs or co-runs that aren't over. */
  running: { code: string; oneshot: string }[];
  /** The account's defaults for reading, dice and sound; null if never saved (or not signed in). */
  prefs: Prefs | null;
  /** Sitting at a game without an account. */
  guest: { name: string; code: string; oneshot: string } | null;
  signedOut: boolean;
}

/** Pages anyone may see: no trip to the door from these. */
const PUBLIC = /^\/(?:$|login|join\/|reset\/|t\/)/;

const NOBODY: Whoami = { user: null, running: [], prefs: null, guest: null, signedOut: false };

let cached: Whoami | undefined;
let pending: Promise<Whoami> | null = null;

function ask(): Promise<Whoami> {
  pending ??= fetch("/api/whoami", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Whoami>) : NOBODY))
    .catch(() => NOBODY)
    .then((w) => {
      if (w.user) cached = w;
      pending = null;
      if (w.signedOut && typeof window !== "undefined" && !PUBLIC.test(window.location.pathname)) {
        fullLoad(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
      return w;
    });
  return pending;
}

/** undefined while asking. `key` asks again when it changes and nobody was signed in yet (say, on the door). */
export function useWhoami(key?: string): Whoami | undefined {
  const [who, setWho] = useState<Whoami | undefined>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    void ask().then((w) => alive && setWho(w));
    return () => {
      alive = false;
    };
  }, [key]);
  return who;
}
