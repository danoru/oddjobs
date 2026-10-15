/**
 * import-draft.ts — write a cast drafted on /draft into content/.
 *
 *   pnpm import-draft <file>.draft.json            — refuses to overwrite
 *   pnpm import-draft <file>.draft.json --force    — replace an existing one-shot
 *
 * Then `pnpm validate <slug>` runs, so you see straight away what's left to fix.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { characterSchema, oneShotSchema } from "../src/lib/schema";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: pnpm import-draft <file>.draft.json [--force]");
  process.exit(1);
}
const bundle = z
  .object({ oneshot: oneShotSchema, cast: z.array(characterSchema).min(1) })
  .parse(JSON.parse(fs.readFileSync(file, "utf8")));

const dir = path.join(process.cwd(), "content", "oneshots", bundle.oneshot.slug);
if (fs.existsSync(dir) && !args.includes("--force")) {
  console.error(`content/oneshots/${bundle.oneshot.slug} already exists. Pass --force to replace it.`);
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, "characters"), { recursive: true });
const write = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
write(path.join(dir, "oneshot.json"), bundle.oneshot);
for (const c of bundle.cast) write(path.join(dir, "characters", `${c.id}.json`), c);
console.log(`wrote content/oneshots/${bundle.oneshot.slug} (${bundle.cast.length} characters)`);

try {
  execFileSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/validate.ts", bundle.oneshot.slug], {
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}
