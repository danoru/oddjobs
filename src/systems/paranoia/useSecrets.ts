import { useEffect, useState } from "react";
import type { Naughty } from "./schema";

/**
 * The naughty side of a Troubleshooter this browser holds at a table, from
 * /api/tables/<code>/secrets (the server only answers for characters the
 * asker has claimed). Asked again when the claim changes; it doesn't change
 * during a mission, so it isn't polled.
 */
export function useSecret(code: string | null, playerId: string | null, characterId: string, held: boolean) {
  const [secret, setSecret] = useState<Naughty | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code || !playerId || !held) return;
    let alive = true;
    fetch(`/api/tables/${code}/secrets?as=player`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { secrets?: Record<string, Naughty>; error?: string }) => {
        if (!alive) return;
        setSecret(j.secrets?.[characterId] ?? null);
        setError(j.error ?? null);
      })
      .catch(() => alive && setError("Couldn't reach the Computer — reload to try again."));
    return () => {
      alive = false;
    };
  }, [code, playerId, characterId, held]);
  return { secret: held ? secret : null, error };
}
