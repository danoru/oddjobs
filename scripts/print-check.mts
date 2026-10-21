/**
 * print-check.mts — render every printable to PDF in a headless browser and
 * check it lays out as promised. LOCAL ONLY, like pnpm pdf: run it against a
 * dev or prod server.
 *
 *   pnpm dev                          (in another terminal)
 *   pnpm print-check                  — every one-shot, every level, Letter and A4
 *   pnpm print-check the-drowned-bell
 *
 * What it checks, per one-shot × level × paper:
 *   sheets  — each face on one page (2 per character); with large print, at most 2 pages a face
 *   cards   — 9 to a page (4 in large print), each character from a fresh page, and no card's text overflows
 *   tents   — 2 to a page
 * Sheets and cards are also checked in high-contrast and dyslexia-friendly modes,
 * for 5e (every level variant), Daggerheart and Paranoia one-shots. Paranoia's public
 * print view is one face per Troubleshooter (the naughty sides are in the GM's box).
 * Exits 1 on any failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { loadOneShot, loadSpellBook, publishedSlugs } from "../src/lib/content";
import { cardsFor, paginate } from "../src/systems/dnd5e/cards";
import { levelsOf, withVariant } from "../src/systems/dnd5e/variants";
import { cardsFor as dhCardsFor } from "../src/systems/daggerheart/cards";
import { cardsFor as paCardsFor } from "../src/systems/paranoia/cards";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";

function password(): string {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const env = [".env.local", ".env"].map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f)) ?? path.join(ROOT, ".env");
  const line = fs.existsSync(env) ? fs.readFileSync(env, "utf8").match(/^APP_PASSWORD=(.*)$/m) : null;
  if (!line) throw new Error("Set APP_PASSWORD (or put it in .env)");
  return line[1].trim();
}

/** Chromium writes one "/Type /Page" object per page (and "/Type /Pages" for the tree). */
export const countPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

type Mode = { name: string; reading: Record<string, boolean> };
const MODES: Mode[] = [
  { name: "plain", reading: {} },
  { name: "large", reading: { large: true } },
  { name: "contrast", reading: { contrast: true } },
  { name: "dyslexia", reading: { dyslexia: true } },
];

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = slugs.length ? slugs : publishedSlugs();
const book = loadSpellBook();

const browser = await chromium.launch();
let failures = 0;
const rows: string[] = [];

async function render(page: Page, route: string, format: "Letter" | "A4") {
  await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  // Card text that doesn't fit its card, measured in print layout.
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("article[data-fit]")]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.querySelector("h3")?.textContent ?? "?"),
  );
  const pdf = await page.pdf({ format, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  return { pages: countPages(pdf), overflow };
}

function report(ok: boolean, what: string, detail: string) {
  if (!ok) failures++;
  rows.push(`${ok ? "ok  " : "FAIL"} ${what.padEnd(58)} ${detail}`);
}

for (const mode of MODES) {
  const context = await browser.newContext();
  const login = await context.request.post(`${BASE}/api/login`, { data: { password: password() } });
  if (!login.ok()) throw new Error(`Login failed (${login.status()}) — is the server running at ${BASE}?`);
  const page = await context.newPage();

  for (const slug of targets) {
    const base = loadOneShot(slug);
    // The Ten Candles table kit has no per-character layout promises to check.
    if (base.system === "tencandles") continue;
    const large = Boolean(mode.reading.large);
    const perPage = large ? 4 : 9;
    const layouts =
      base.system === "paranoia"
        ? [{ level: 0, n: base.cast.length, faces: 1, cardPages: base.cast.reduce((sum, c) => sum + paginate(paCardsFor(c, null, ["feature", "item"]), perPage).length, 0) }]
        : base.system === "daggerheart"
        ? [{ level: base.level, n: base.cast.length, faces: 2, cardPages: base.cast.reduce((sum, c) => sum + paginate(dhCardsFor(c), perPage).length, 0) }]
        : levelsOf(base).map(({ level }) => {
            const os = withVariant(base, level);
            return { level, n: os.cast.length, faces: 2, cardPages: os.cast.reduce((sum, c) => sum + paginate(cardsFor(c, os.ruleset, book), perPage).length, 0) };
          });
    for (const { level, n, faces, cardPages } of layouts) {
      await context.addInitScript(
        ([s, l, r]) => {
          localStorage.setItem(`tearoff:level:${s}`, String(l));
          localStorage.setItem("tearoff:reading", JSON.stringify(r));
        },
        [slug, level, mode.reading] as const,
      );

      for (const format of ["Letter", "A4"] as const) {
        const tag = `${slug} L${level} ${format} ${mode.name}`;
        const sheets = await render(page, `${slug}/print`, format);
        if (large) report(sheets.pages <= 2 * faces * n, `${tag} sheets`, `${sheets.pages} pages (≤ ${2 * faces * n})`);
        else report(sheets.pages === faces * n, `${tag} sheets`, `${sheets.pages} pages (want ${faces * n})`);

        const cards = await render(page, `${slug}/cards`, format);
        report(
          cards.pages === cardPages && cards.overflow.length === 0,
          `${tag} cards`,
          `${cards.pages} pages (want ${cardPages})${cards.overflow.length ? `; overflowing: ${cards.overflow.join(", ")}` : ""}`,
        );

        if (mode.name === "plain" || mode.name === "dyslexia") {
          const tents = await render(page, `${slug}/tents`, format);
          report(tents.pages === Math.ceil(n / 2), `${tag} tents`, `${tents.pages} pages (want ${Math.ceil(n / 2)})`);
        }
      }
    }
  }
  await context.close();
}

await browser.close();
console.log(rows.join("\n"));
console.log(failures ? `\n${failures} failed` : "\nall printables fit");
process.exit(failures ? 1 : 0);
