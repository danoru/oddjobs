/**
 * import-oneshots.ts — copy the one-shots (content/oneshots published, content/drafts as drafts). Publishing checks their spells against the database's spell book, so import the spell book first.
 * Skips what's already in the database unless given --overwrite.
 *
 *   pnpm exec tsx scripts/db-env.mts tsx scripts/import-oneshots.ts [--overwrite]
 *   pnpm exec tsx scripts/db-env.mts --remote tsx scripts/import-oneshots.ts   — the hosted database (ask first!)
 *
 * `pnpm db:import` runs all three in order.
 */
import { runImports } from "./import-run";

void runImports(["oneshots"]);
