/**
 * The shared runner for scripts/import-*.ts: runs the imports in order,
 * prints what each wrote and skipped, and exits 1 if anything failed.
 */
import { db } from "../src/lib/prisma";
import { describe, importOneShots, importSpells, importSurvivors, type ImportReport } from "../src/lib/store/importContent";

const KINDS = {
  spells: ["Spell book", importSpells],
  survivors: ["Survivors", importSurvivors],
  oneshots: ["One-shots", importOneShots],
} as const satisfies Record<string, readonly [string, (o: { overwrite?: boolean }) => Promise<ImportReport>]>;

export async function runImports(kinds: (keyof typeof KINDS)[]) {
  const overwrite = process.argv.includes("--overwrite");
  if (!process.env.DATABASE_URL) {
    console.error("No DATABASE_URL: run this through scripts/db-env.mts (pnpm db:import), which finds the database.");
    process.exit(1);
  }
  console.log(`Importing into ${new URL(process.env.DATABASE_URL).hostname}${overwrite ? " (overwriting)" : ""}`);
  let failed = false;
  try {
    for (const k of kinds) {
      const [label, run] = KINDS[k];
      const report = await run({ overwrite });
      console.log(describe(label, report));
      failed ||= report.failed.length > 0;
    }
  } finally {
    await db().$disconnect();
  }
  process.exit(failed ? 1 : 0);
}
