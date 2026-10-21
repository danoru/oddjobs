/**
 * a11y-check.mts — run axe-core over the main pages in a headless browser and
 * walk the first stops of the keyboard Tab order, checking each focused
 * element shows a focus ring. LOCAL ONLY, against a dev or prod server.
 *
 *   pnpm dev                     (in another terminal)
 *   pnpm a11y-check              — board, job pages, a sheet, cards, tents and the GM page
 *   pnpm a11y-check lot-thirteen/odalys-quill the-drowned-bell/print
 *
 * Signs in as the e2e admin (scripts/e2e-auth.mts, made in the local
 * database if needed), so the GM pages, the builder and the people page are
 * included; the public pages (the landing page, the door, an invite) are
 * checked without a session. Exits 1 on any axe violation or focus stop
 * without a ring.
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { loadOneShot, publishedSlugs } from "../src/lib/content";
import { ensureE2eUsers, signInAs } from "./e2e-auth.mts";

const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const TABS = 12;


function defaultRoutes(): string[] {
  const slugs = publishedSlugs();
  const all = slugs.map((s) => loadOneShot(s));
  const first = all.find((os) => os.system === "dnd5e")!;
  const candles = all.filter((os) => os.system === "tencandles");
  const dh = all.filter((os) => os.system === "daggerheart");
  const pa = all.filter((os) => os.system === "paranoia");
  return [
    "board",
    "settings",
    "admin/people",
    ...slugs,
    `${first.slug}/${first.cast[0].id}`,
    `${first.slug}/cards`,
    `${first.slug}/tents`,
    `${first.slug}/gm`,
    ...candles.flatMap((os) => [`${os.slug}/play`, `${os.slug}/kit`, `${os.slug}/gm`, `${os.slug}/tv`]),
    ...[...dh, ...pa].flatMap((os) => [`${os.slug}/${os.cast[0].id}`, `${os.slug}/cards`, `${os.slug}/tents`, `${os.slug}/gm`, `${os.slug}/tv`]),
  ];
}

/** Pages anyone may open: checked without a session. */
const PUBLIC_ROUTES = ["", "login", "join/not-a-real-invite", "reset/not-a-real-token"];

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const routes = args.length ? args : defaultRoutes();

await ensureE2eUsers(["admin"]);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await signInAs(context, BASE, "admin");
const signedInPage = await context.newPage();
const anonPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let problems = 0;

for (const [route, page] of [
  ...(args.length ? [] : PUBLIC_ROUTES.map((r) => [r, anonPage] as const)),
  ...routes.map((r) => [r, signedInPage] as const),
]) {
  // Settled enough to check: with the database store, pages are ISR and Next quietly re-fetches stale
  // page data in the background, which never counts as idle, so give "networkidle" a few seconds at most.
  await page.goto(`${BASE}/${route}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
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
  console.log(`${ok ? "ok  " : "FAIL"} /${route}${page === anonPage ? " (signed out)" : ""}`);
  for (const v of violations) console.log(`       axe: ${v}`);
  for (const u of unringed) console.log(`       no focus ring on "${u}"`);
}

await browser.close();
console.log(problems ? `\n${problems} problems` : "\nno axe violations; every focus stop shows a ring");
process.exit(problems ? 1 : 0);
