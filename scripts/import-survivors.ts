/**
 * import-survivors.ts — copy the shared world's survivors (content/legacy/*.json).
 * Skips what's already in the database unless given --overwrite.
 *
 *   pnpm exec tsx scripts/db-env.mts tsx scripts/import-survivors.ts [--overwrite]
 *   pnpm exec tsx scripts/db-env.mts --remote tsx scripts/import-survivors.ts   — the hosted database (ask first!)
 *
 * `pnpm db:import` runs all three in order.
 */
import { runImports } from "./import-run";

void runImports(["survivors"]);
