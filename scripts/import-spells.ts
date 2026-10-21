/**
 * import-spells.ts — copy the spell book (content/rules/spells.json), one row per spell.
 * Skips what's already in the database unless given --overwrite.
 *
 *   pnpm exec tsx scripts/db-env.mts tsx scripts/import-spells.ts [--overwrite]
 *   pnpm exec tsx scripts/db-env.mts --remote tsx scripts/import-spells.ts   — the hosted database (ask first!)
 *
 * `pnpm db:import` runs all three in order.
 */
import { runImports } from "./import-run";

void runImports(["spells"]);
