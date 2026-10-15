import { createHash, timingSafeEqual } from "node:crypto";
import type { OneShotWithCast } from "./schema";
import type { TableState } from "./tables";

/**
 * Pure parts of the Foundry table-sync API (src/pages/api/foundry/tables/[code].ts):
 * the bearer-token check and the response shape. Kept free of Next and Prisma
 * so they can be unit-tested.
 */

export type FoundryCastEntry = {
  id: string;
  /** The character's real name (the module matches actors by `id`, not name). */
  name: string;
  /** Shown on the board instead of the name for mystery characters ("????"). */
  alias: string | null;
  epithet: string;
  header: string;
  hook: string;
  icon: string;
  /** Name the claiming player gave when they tore the poster, or null. */
  claimedBy: string | null;
  /** The character's private secret. Present ONLY when the poster is claimed. */
  secret?: string;
};

export type FoundryTable = {
  code: string;
  oneshot: string;
  title: string;
  cast: FoundryCastEntry[];
};

export type TokenCheck = "ok" | "unauthorized" | "unconfigured";

/** Pull the token out of an `Authorization: Bearer <token>` header value. */
export function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/**
 * Constant-time comparison. Both sides are hashed first so the buffers are
 * always the same length (timingSafeEqual throws otherwise) and length
 * doesn't leak.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * "unconfigured" (route answers 503) when FOUNDRY_TOKEN is unset or empty, so
 * an unset env var can never be matched by an empty bearer token.
 */
export function checkFoundryToken(
  authorization: string | string[] | undefined,
  expected: string | undefined,
): TokenCheck {
  if (!expected) return "unconfigured";
  const given = bearerToken(authorization);
  if (given === null) return "unauthorized";
  return safeEqual(given, expected) ? "ok" : "unauthorized";
}

/**
 * The table as Foundry sees it. Secrets are included only for claimed
 * characters: the module copies them into a journal that only the claiming
 * player can see, so an unclaimed secret must never leave the server.
 */
export function shapeFoundryTable(
  oneshot: Pick<OneShotWithCast, "title" | "cast">,
  state: Pick<TableState, "code" | "oneshot" | "claims">,
): FoundryTable {
  // Earliest claim wins if there were ever two for one character (claims arrive oldest first).
  const claimedBy = new Map<string, string>();
  for (const c of state.claims) if (!claimedBy.has(c.characterId)) claimedBy.set(c.characterId, c.name);

  return {
    code: state.code,
    oneshot: state.oneshot,
    title: oneshot.title,
    cast: oneshot.cast.map((c) => {
      const by = claimedBy.get(c.id) ?? null;
      const entry: FoundryCastEntry = {
        id: c.id,
        name: c.name,
        alias: c.poster.alias ?? null,
        epithet: c.poster.epithet,
        header: c.poster.header,
        hook: c.poster.hook,
        icon: c.poster.icon,
        claimedBy: by,
      };
      if (by !== null) entry.secret = c.story.secret;
      return entry;
    }),
  };
}
