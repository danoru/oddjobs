/**
 * a11y-check.mts — run axe-core over the main pages in a headless browser and
 * walk the first stops of the keyboard Tab order, checking each focused
 * element shows a focus ring. LOCAL ONLY, against a dev or prod server.
 *
 *   pnpm dev                     (in another terminal)
 *   pnpm a11y-check              — board, job pages, a sheet, cards, tents and the GM page
 *   pnpm a11y-check lot-thirteen/odalys-quill the-drowned-bell/print
 *
 * Signs in with GM_PASSWORD (so the GM page is included) from .env.local or the
 * environment. Exits 1 on any axe violation or focus stop without a ring.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadOneShot, publishedSlugs } from "../src/lib/content";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const TABS = 12;

function gmPassword(): string {
  if (process.env.GM_PASSWORD) return process.env.GM_PASSWORD;
  const env = path.join(ROOT, ".env.local");
  const line = fs.existsSync(env) ? fs.readFileSync(env, "utf8").match(/^GM_PASSWORD=(.*)$/m) : null;
  if (!line) throw new Error("Set GM_PASSWORD (or put it in .env.local)");
  return line[1].trim();
}

function defaultRoutes(): string[] {
  const slugs = publishedSlugs();
  const first = loadOneShot(slugs[0]);
  return [
    "",
    ...slugs,
    `${first.slug}/${first.cast[0].id}`,
    `${first.slug}/cards`,
    `${first.slug}/tents`,
    `${first.slug}/gm`,
  ];
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const routes = args.length ? args : defaultRoutes();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const login = await context.request.post(`${BASE}/api/login`, { data: { password: gmPassword() } });
if (!login.ok()) throw new Error(`Login failed (${login.status()}) — is the server running at ${BASE}?`);
const page = await context.newPage();
let problems = 0;

for (const route of routes) {
  await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
  await page.addScriptTag({ path: AXE });
  const violations: string[] = await page.evaluate(async () => {
    // @ts-expect-error axe is the global the script tag adds
    const out = await window.axe.run(document, { resultTypes: ["violations"] });
    return out.violations.map(
      (v: { impact: string; id: string; help: string; nodes: { target: string[] }[] }) =>
        `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×, e.g. ${v.nodes[0].target.join(" ")})`,
    );
  });

  const unringed: string[] = [];
  await page.mouse.click(1, 1);
  for (let i = 0; i < TABS; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.tagName.toLowerCase().startsWith("nextjs")) return null;
      const cs = getComputedStyle(el);
      // MUI text fields show focus on the outline drawn round the input, not on the input itself.
      const outline = el.closest(".Mui-focused")?.querySelector("fieldset");
      const fieldRing = outline ? parseFloat(getComputedStyle(outline).borderTopWidth) >= 2 : false;
      const ring = (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px") || cs.boxShadow !== "none" || fieldRing;
      const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      return { name, ring };
    });
    if (!stop) break;
    if (!stop.ring) unringed.push(stop.name);
  }

  problems += violations.length + unringed.length;
  const ok = violations.length === 0 && unringed.length === 0;
  console.log(`${ok ? "ok  " : "FAIL"} /${route}`);
  for (const v of violations) console.log(`       axe: ${v}`);
  for (const u of unringed) console.log(`       no focus ring on "${u}"`);
}

await browser.close();
console.log(problems ? `\n${problems} problems` : "\nno axe violations; every focus stop shows a ring");
process.exit(problems ? 1 : 0);
