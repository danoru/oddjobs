/**
 * pdf.mts — render printable PDFs of every one-shot into public/pdf/.
 * LOCAL ONLY: Vercel's build image has no Chromium, so this never runs in
 * vercel-build. Run it against a dev or prod server, then commit the output.
 *
 *   pnpm dev                       (in another terminal)
 *   pnpm pdf                       — every 5e one-shot: <slug>-sheets, -cards, -tents and -flyer PDFs,
 *                                    plus <slug>-l<N>-… for each level variant; Ten Candles:
 *                                    <slug>-kit and -flyer
 *   pnpm pdf the-drowned-bell      — just one
 *   pnpm pdf --a4                  — A4 instead of US Letter
 *   BASE_URL=http://localhost:3000 pnpm pdf
 *
 * Signs in as the e2e admin (scripts/e2e-auth.mts; the Ten Candles kit is GM-only).
 * PDF_OUT=dir writes somewhere other than public/pdf.
 * First run on a new machine: pnpm exec playwright install chromium
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { loadOneShot, publishedSlugs } from "../src/lib/content";
import { levelsOf } from "../src/systems/dnd5e/variants";
import { ensureE2eUsers, signInAs } from "./e2e-auth.mts";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = process.env.PDF_OUT ? path.resolve(process.env.PDF_OUT) : path.join(ROOT, "public", "pdf");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";


const args = process.argv.slice(2);
const a4 = args.includes("--a4");
const slugs = args.filter((a) => !a.startsWith("--"));
const targets = slugs.length ? slugs : publishedSlugs();

const browser = await chromium.launch();
const context = await browser.newContext();
await ensureE2eUsers(["admin"]);
await signInAs(context, BASE, "admin");

fs.mkdirSync(OUT, { recursive: true });
const page = await context.newPage();
let failed = false;
for (const slug of targets) {
  const base = loadOneShot(slug);
  // Ten Candles: the table kit and the missing poster.
  const levels = base.system === "dnd5e" ? levelsOf(base).map((l) => l.level) : [null];
  for (const level of levels) {
    // The page reads its level from ?level= (and remembers it), like a GM's link.
    const tag = level === null || (base.system === "dnd5e" && level === base.level) ? "" : `-l${level}`;
    const kinds =
      base.system !== "tencandles"
        ? ([
            ["sheets", "print"],
            ["cards", "cards"],
            ["tents", "tents"],
            ["flyer", "flyer"],
          ] as const)
        : ([
            ["kit", "kit"],
            ["flyer", "flyer"],
          ] as const);
    for (const [kind, route] of kinds) {
      const file = path.join(OUT, `${slug}${tag}-${kind}${a4 ? "-a4" : ""}.pdf`);
      try {
        await page.goto(`${BASE}/${slug}/${route}${level === null ? "" : `?level=${level}`}`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        // Margins come from the pages' own @page rules (0.45in for sheets, 0.25in for cards).
        await page.pdf({ path: file, format: a4 ? "A4" : "Letter", printBackground: true });
        console.log(`ok   ${path.relative(ROOT, file)}`);
      } catch (e) {
        failed = true;
        console.error(`FAIL ${slug}/${route}: ${(e as Error).message}`);
      }
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
