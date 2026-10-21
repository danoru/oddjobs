/**
 * import-content.ts — copy what's in git into the database: the spell book,
 * the shared world's survivors (content/legacy) and the one-shots, in that
 * order. What's already in the database is skipped, so running it twice
 * changes nothing. Run it through db-env so it finds the database:
 *
 *   pnpm db:import                   — the local database in .env
 *   pnpm db:import --overwrite       — replace what's there with git's version
 *   pnpm db:import:remote            — the hosted Supabase database (ask first!)
 *
 * scripts/import-oneshots.ts, import-spells.ts and import-survivors.ts do one each.
 */
import { runImports } from "./import-run";

void runImports(["spells", "survivors", "oneshots"]);
