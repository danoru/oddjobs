/**
 * Which Postgres to talk to.
 *
 * Locally, DATABASE_URL and DIRECT_URL in .env point at `prisma dev`. On
 * Vercel, the Supabase integration provides POSTGRES_PRISMA_URL (pooled, for
 * the app) and POSTGRES_URL_NON_POOLING (direct, for migrations) and keeps
 * them current, so we derive ours from those instead of copying secrets.
 *
 * Everything lives in the `tearoff` schema: Supabase exposes `public` through
 * its REST API with the public anon key, and these tables have no row-level
 * security, so they must stay out of it.
 */

export const DB_SCHEMA = "tearoff";

type Env = Record<string, string | undefined>;

function withParams(raw: string, params: Record<string, string>): string {
  const u = new URL(raw);
  for (const [k, v] of Object.entries(params)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * `remote: true` ignores DATABASE_URL/DIRECT_URL and uses the integration's
 * variables, for deliberately migrating the hosted database from a laptop.
 */
export function resolveDbUrls(
  env: Env,
  { remote = false } = {},
): { url?: string; directUrl?: string; source: "env" | "supabase" | "none"; ignoredLocal?: boolean } {
  // A localhost URL can't work on Vercel (it's someone's `prisma dev`, usually
  // copied over with the rest of .env), so there it falls through to Supabase.
  const ignoredLocal = Boolean(env.VERCEL && env.DATABASE_URL && isLocal(env.DATABASE_URL));
  if (!remote && env.DATABASE_URL && !ignoredLocal) {
    return { url: env.DATABASE_URL, directUrl: env.DIRECT_URL || env.DATABASE_URL, source: "env" };
  }
  const pooled = env.POSTGRES_PRISMA_URL;
  const direct = env.POSTGRES_URL_NON_POOLING;
  if (!pooled && !direct) return { source: "none", ...(ignoredLocal ? { ignoredLocal } : {}) };
  return {
    // Supavisor's transaction pooler: Prisma must skip prepared statements, and
    // each serverless instance should hold a single connection.
    url: pooled ? withParams(pooled, { schema: DB_SCHEMA, pgbouncer: "true", connection_limit: "1" }) : undefined,
    directUrl: direct ? withParams(direct, { schema: DB_SCHEMA }) : undefined,
    source: "supabase",
    ...(ignoredLocal ? { ignoredLocal } : {}),
  };
}

function isLocal(raw: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(raw).hostname);
  } catch {
    return false;
  }
}
