import fs from "node:fs";
import path from "node:path";
import { survivorFileSchema, type Survivor } from "./legacy";

/**
 * Survivors recorded in git: content/legacy/*.json (each an array of records,
 * as downloaded from the epilogue page). Read at build time only.
 */
export const LEGACY_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "legacy");

export function loadSurvivors(root = LEGACY_ROOT): Survivor[] {
  if (!fs.existsSync(root)) return [];
  const byId = new Map<string, Survivor>();
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".json")).sort()) {
    const file = path.join(root, f);
    const parsed = survivorFileSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`content/legacy/${f} is invalid:\n${issues}`);
    }
    // A later file with the same record id wins, so re-downloading an epilogue just updates it.
    for (const s of parsed.data) byId.set(s.id, s);
  }
  return [...byId.values()];
}
