/**
 * db-env.mts — run a Prisma command against the right database.
 *
 *   tsx scripts/db-env.mts prisma migrate deploy            — .env locally, Supabase on Vercel
 *   tsx scripts/db-env.mts --remote prisma migrate deploy   — the hosted Supabase database, on purpose
 *
 * The Prisma CLI reads DATABASE_URL and DIRECT_URL; this fills them in from
 * src/lib/dbUrl.ts (which derives them from the Supabase integration's
 * variables when they aren't set) and then runs the command.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveDbUrls } from "../src/lib/dbUrl";

const args = process.argv.slice(2);
const remote = args[0] === "--remote";
const command = remote ? args.slice(1) : args;
if (command.length === 0) {
  console.error("usage: tsx scripts/db-env.mts [--remote] <command…>");
  process.exit(1);
}

// Locally the variables are in .env; on Vercel they're already in the environment.
const envFile = path.join(import.meta.dirname, "..", ".env");
const env: Record<string, string | undefined> = { ...process.env };
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}

const { url, directUrl, source, ignoredLocal } = resolveDbUrls(env, { remote });
if (ignoredLocal) {
  console.warn("db-env: ignoring DATABASE_URL — it points at localhost, which can't work on Vercel. Delete DATABASE_URL and DIRECT_URL from the Vercel project's environment variables.");
}
if (!url || !directUrl) {
  console.error(
    remote
      ? "No hosted database: POSTGRES_PRISMA_URL and POSTGRES_URL_NON_POOLING aren't set."
      : "No database: set DATABASE_URL/DIRECT_URL in .env, or connect Supabase in Vercel.",
  );
  process.exit(1);
}
console.log(`db-env: using ${source === "env" ? `DATABASE_URL (${new URL(url).hostname})` : `the Supabase integration's database (${new URL(url).hostname})`}`);

// Shell out through the package manager's bin path, as pnpm scripts do.
const run = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: directUrl },
});
process.exit(run.status ?? 1);
