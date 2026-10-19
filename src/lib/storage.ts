import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { decodeTweaks, emptyTweaks, tweaksSchema, type Tweaks } from "@/systems/dnd5e/customize";
import { parseReading, type Reading, type ReadingMode } from "./reading";
import { levelsOf, pickLevel, withVariant, type HasLevels } from "@/systems/dnd5e/variants";
import type { Character } from "@/systems/dnd5e/schema";
import {
  normalizeCode,
  PLAYER_HEADER,
  playerIdSchema,
  playerNameSchema,
  POLL_MS,
  type TableClaim,
  type TableState,
} from "./tables";

/**
 * Browser state. Tweaks, the player's name and the table they joined live in
 * localStorage, which can be missing (private windows, blocked storage) —
 * every access is guarded and the UI works without it. Components read it
 * through useSyncExternalStore so the server render and first client render
 * agree. Claims are shared through the table API once a table code is set,
 * and fall back to this browser's localStorage when there's no table.
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
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
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
const tableKey = (slug: string) => `tearoff:table:${slug}`;
const tweaksKey = (slug: string, id: string) => `tearoff:tweaks:${slug}/${id}`;
const levelKey = (slug: string) => `tearoff:level:${slug}`;
const PLAYER_KEY = "tearoff:player";
const READING_KEY = "tearoff:reading";

/** Posters torn off in this browser only — the fallback when there's no table. */
function useLocalClaims(slug: string) {
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

  return { claims, toggle };
}

type Player = { id: string; name: string };

/** Who this browser is at the table: a made-up id plus the name they gave. */
export function usePlayer(): Player | null {
  const raw = useStored(PLAYER_KEY);
  return useMemo(() => {
    const v = parseJson(raw) as Partial<Player> | null;
    const id = playerIdSchema.safeParse(v?.id);
    const name = playerNameSchema.safeParse(v?.name);
    return id.success && name.success ? { id: id.data, name: name.data } : null;
  }, [raw]);
}

/** Works on plain-http LAN addresses too, where crypto.randomUUID is missing. */
function newPlayerId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The table code this browser joined (or opened) for a one-shot. */
export function useTableCode(slug: string): string | null {
  return normalizeCode(parseJson(useStored(tableKey(slug))));
}

export type ClaimInfo = { name: string | null; mine: boolean };

type Reply = { ok: boolean; status: number; json: { error?: string; state?: TableState } & Partial<TableState> };

/**
 * Who has torn which poster. With a table code this polls the table every few
 * seconds and tearing locks the poster for everyone there; without one it's
 * this browser's localStorage, as in v1.
 */
export function useClaims(slug: string) {
  const local = useLocalClaims(slug);
  const code = useTableCode(slug);
  const player = usePlayer();
  const playerId = player?.id ?? null;
  const [state, setState] = useState<TableState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Responses can land out of order; only the newest request may set state.
  const sent = useRef(0);
  const applied = useRef(0);

  const request = useCallback(
    async (method: string, path: string, body?: unknown): Promise<Reply & { seq: number }> => {
      const seq = ++sent.current;
      const res = await fetch(path, {
        method,
        cache: "no-store",
        headers: {
          ...(playerId ? { [PLAYER_HEADER]: playerId } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json, seq };
    },
    [playerId],
  );

  const apply = useCallback((seq: number, next: TableState | undefined) => {
    if (!next || seq < applied.current) return;
    applied.current = seq;
    setState(next);
  }, []);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const r = await request("GET", `/api/tables/${code}`);
        if (!alive) return;
        if (r.ok) {
          apply(r.seq, r.json as TableState);
          setError(null);
        } else {
          setError(r.status === 404 ? `There's no table ${code} any more.` : "Couldn't reach the table — retrying.");
        }
      } catch {
        if (alive) setError("Couldn't reach the table — retrying.");
      }
    };
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, request, apply]);

  // A state left over from a previous code doesn't count.
  const live = state && state.code === code ? state : null;

  const claimedBy = useMemo<Record<string, ClaimInfo>>(() => {
    if (!code) return Object.fromEntries(local.claims.map((id) => [id, { name: null, mine: true }]));
    return Object.fromEntries((live?.claims ?? []).map((c) => [c.characterId, { name: c.name, mine: c.mine }]));
  }, [code, live, local.claims]);

  /** Send a claim change, showing it straight away and correcting from the reply. */
  const change = useCallback(
    async (id: string, tear: boolean) => {
      if (!code) return;
      setError(null);
      if (live) {
        const others = live.claims.filter((c) => c.characterId !== id);
        const optimistic: TableClaim = { characterId: id, name: player?.name ?? "you", mine: true, claimedAt: "" };
        setState({ ...live, claims: tear ? [...others, optimistic] : others });
        applied.current = sent.current; // polls already in flight are older than this
      }
      try {
        const r = tear
          ? await request("POST", `/api/tables/${code}/claims`, { characterId: id, name: player?.name ?? "" })
          : await request("DELETE", `/api/tables/${code}/claims?characterId=${encodeURIComponent(id)}`);
        apply(r.seq, r.ok ? (r.json as TableState) : r.json.state);
        if (!r.ok) setError(r.json.error ?? "That didn't work — try again.");
      } catch {
        setError("Couldn't reach the table — try again.");
      }
    },
    [code, live, player, request, apply],
  );

  /** Tear an open poster, or pin your own back up. Someone else's stays put. */
  const toggle = useCallback(
    (id: string) => {
      if (!code) return local.toggle(id);
      const held = claimedBy[id];
      if (held && !held.mine) return setError(`${held.name ?? "Someone"} already tore that one down.`);
      void change(id, !held);
    },
    [code, local, claimedBy, change],
  );

  /** Pin any poster back up — the server only allows this for its tearer or the GM. */
  const release = useCallback((id: string) => void change(id, false), [change]);

  /** Join a table by code under a name. Returns an error, or null when joined. */
  const join = useCallback(
    async (rawCode: string, rawName: string): Promise<{ error: string; oneshot?: string } | null> => {
      const c = normalizeCode(rawCode);
      if (!c) return { error: "Table codes are five letters and numbers." };
      const name = playerNameSchema.safeParse(rawName);
      if (!name.success) return { error: "Tell the table your name (up to 40 letters)." };
      const res = await fetch(`/api/tables/${c}`, { cache: "no-store" }).catch(() => null);
      if (!res) return { error: "Couldn't reach the tavern — try again." };
      if (res.status === 404) return { error: `There's no table ${c}.` };
      const table = (await res.json()) as TableState;
      if (table.oneshot !== slug) return { error: `Table ${c} is playing a different one-shot.`, oneshot: table.oneshot };
      write(PLAYER_KEY, { id: playerId ?? newPlayerId(), name: name.data });
      write(tableKey(slug), c);
      return null;
    },
    [slug, playerId],
  );

  /** GM: open a fresh table for this one-shot and switch to it. */
  const openTable = useCallback(async (): Promise<string | null> => {
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oneshot: slug }),
    }).catch(() => null);
    if (!res?.ok) return (await res?.json().catch(() => null))?.error ?? "Couldn't open a table — try again.";
    write(tableKey(slug), ((await res.json()) as TableState).code);
    return null;
  }, [slug]);

  /** Back to claims on this device only. */
  const leave = useCallback(() => write(tableKey(slug), null), [slug]);

  return {
    /** The table code, or null for this-device-only claims. */
    table: code,
    /** True until the first answer from the table arrives. */
    loading: Boolean(code && !live),
    claims: Object.keys(claimedBy),
    claimedBy,
    player,
    error,
    clearError: () => setError(null),
    toggle,
    release,
    join,
    leave,
    openTable,
  };
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

/**
 * The level this browser plays a one-shot at. A `?level=N` in the URL (the GM's
 * join link carries one) is saved for next time. Returns the one-shot with the
 * cast's mechanics at that level, so every sheet, card and export follows it.
 * One-shots without levels (Ten Candles) come back as they are, at level 0
 * with no choices.
 */
export function useLevel<T extends { slug: string }>(os: T) {
  const slug = os.slug;
  const leveled = hasLevels(os) ? os : null;
  useEffect(() => {
    if (!leveled) return;
    const wanted = new URLSearchParams(window.location.search).get("level");
    if (wanted && pickLevel(leveled, wanted) === Number(wanted)) write(levelKey(slug), Number(wanted));
  }, [leveled, slug]);

  const stored = parseJson(useStored(levelKey(slug)));
  const level = leveled ? pickLevel(leveled, stored) : 0;
  const at = useMemo(() => (leveled ? (withVariant(leveled, level) as unknown as T) : os), [os, leveled, level]);
  const base = leveled?.level;
  const setLevel = useCallback((n: number) => write(levelKey(slug), n === base ? null : n), [slug, base]);
  return { os: at, level, setLevel, levels: leveled ? levelsOf(leveled) : [] };
}

type Leveled = HasLevels<Pick<Character, "id" | "mech" | "options">>;
function hasLevels(os: object): os is Leveled {
  return "level" in os && typeof os.level === "number" && "variants" in os && Array.isArray(os.variants);
}

/** This viewer's reading modes (large print, high contrast, dyslexia-friendly), for every sheet and printable. */
export function useReading() {
  const raw = useStored(READING_KEY);
  const reading = useMemo(() => parseReading(parseJson(raw)), [raw]);
  const setMode = useCallback(
    (mode: ReadingMode, on: boolean) => write(READING_KEY, { ...reading, [mode]: on } satisfies Reading),
    [reading],
  );
  return { reading, setMode };
}
