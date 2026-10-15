/**
 * pdf.mts — render printable PDFs of every one-shot into public/pdf/.
 * LOCAL ONLY: Vercel's build image has no Chromium, so this never runs in
 * vercel-build. Run it against a dev or prod server, then commit the output.
 *
 *   pnpm dev                       (in another terminal)
 *   pnpm pdf                       — every one-shot: <slug>-sheets.pdf and <slug>-flyer.pdf
 *   pnpm pdf the-drowned-bell      — just one
 *   pnpm pdf --a4                  — A4 instead of US Letter
 *   BASE_URL=http://localhost:3000 pnpm pdf
 *
 * Signs in with APP_PASSWORD from .env.local (or the environment).
 * First run on a new machine: pnpm exec playwright install chromium
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { publishedSlugs } from "../src/lib/content";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "pdf");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";

function password(): string {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const env = path.join(ROOT, ".env.local");
  const line = fs.existsSync(env) ? fs.readFileSync(env, "utf8").match(/^APP_PASSWORD=(.*)$/m) : null;
  if (!line) throw new Error("Set APP_PASSWORD (or put it in .env.local)");
  return line[1].trim();
}

const args = process.argv.slice(2);
const a4 = args.includes("--a4");
const slugs = args.filter((a) => !a.startsWith("--"));
const targets = slugs.length ? slugs : publishedSlugs();

const browser = await chromium.launch();
const context = await browser.newContext();
const login = await context.request.post(`${BASE}/api/login`, { data: { password: password() } });
if (!login.ok()) throw new Error(`Login failed (${login.status()}) — is the server running at ${BASE}?`);

fs.mkdirSync(OUT, { recursive: true });
const page = await context.newPage();
let failed = false;
for (const slug of targets) {
  for (const [kind, route] of [
    ["sheets", "print"],
    ["flyer", "flyer"],
  ] as const) {
    const file = path.join(OUT, `${slug}-${kind}${a4 ? "-a4" : ""}.pdf`);
    try {
      await page.goto(`${BASE}/${slug}/${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.pdf({ path: file, format: a4 ? "A4" : "Letter", printBackground: true, margin: { top: "0.45in", bottom: "0.45in", left: "0.45in", right: "0.45in" } });
      console.log(`ok   ${path.relative(ROOT, file)}`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${slug}/${route}: ${(e as Error).message}`);
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
