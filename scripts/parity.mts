/**
 * parity.mts — snapshot what the 5e pages show, so a refactor can prove it
 * changed nothing. LOCAL ONLY, like pnpm pdf: run it against a dev or prod server.
 *
 *   pnpm parity snap <dir>        — every 5e page's visible text, every printable's PDF
 *                                   page count (Letter), and screenshots of a few pages
 *   pnpm parity diff <before> <after>
 *                                 — compare two snapshots; exits 1 on any difference
 *
 * Signs in as the e2e admin (scripts/e2e-auth.mts), so the GM page is included.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { loadOneShot, publishedSlugs } from "../src/lib/content";
import { levelsOf } from "../src/systems/dnd5e/variants";
import { ensureE2eUsers, signInAs } from "./e2e-auth.mts";

const BASE = process.env.BASE_URL ?? "http://localhost:3004";


const countPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
const fileFor = (route: string) => route.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home";

async function snap(dir: string) {
  fs.mkdirSync(path.join(dir, "text"), { recursive: true });
  fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ensureE2eUsers(["admin"]);
  await signInAs(context, BASE, "admin");
  const page = await context.newPage();

  const routes: string[] = ["board"];
  const printables: string[] = [];
  for (const slug of publishedSlugs()) {
    const os = loadOneShot(slug);
    if (os.system !== "dnd5e") continue;
    for (const { level } of levelsOf(os)) {
      const q = `?level=${level}`;
      routes.push(`${slug}${q}`, `${slug}/gm${q}`, `${slug}/tv${q}`, `${slug}/sounds`, `${slug}/epilogue`);
      for (const c of os.cast) routes.push(`${slug}/${c.id}${q}`, `${slug}/${c.id}/cards${q}`, `${slug}/${c.id}/tent${q}`);
      for (const r of ["print", "cards", "tents", "flyer"]) printables.push(`${slug}/${r}${q}`);
    }
  }

  const pages: Record<string, number> = {};
  for (const route of [...routes, ...printables]) {
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(dir, "text", `${fileFor(route)}.txt`), text);
    if (printables.includes(route)) {
      await page.emulateMedia({ media: "print" });
      pages[route] = countPages(await page.pdf({ format: "Letter", printBackground: true }));
      await page.emulateMedia({ media: "screen" });
    }
    console.log(`ok   ${route}${route in pages ? ` (${pages[route]} pages)` : ""}`);
  }
  fs.writeFileSync(path.join(dir, "pages.json"), JSON.stringify(pages, null, 2) + "\n");

  for (const route of ["", "the-drowned-bell/merryn-vane?level=5", "lot-thirteen/odalys-quill?level=3", "the-cooling-concord?level=4"]) {
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, "shots", `${fileFor(route)}.png`), fullPage: true });
  }
  await browser.close();
}

function diff(a: string, b: string): number {
  let problems = 0;
  const pa = JSON.parse(fs.readFileSync(path.join(a, "pages.json"), "utf8")) as Record<string, number>;
  const pb = JSON.parse(fs.readFileSync(path.join(b, "pages.json"), "utf8")) as Record<string, number>;
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)]))
    if (pa[k] !== pb[k]) {
      problems++;
      console.error(`pages ${k}: ${pa[k]} → ${pb[k]}`);
    }
  const ta = fs.readdirSync(path.join(a, "text"));
  const tb = fs.readdirSync(path.join(b, "text"));
  for (const f of new Set([...ta, ...tb])) {
    const x = fs.existsSync(path.join(a, "text", f)) ? fs.readFileSync(path.join(a, "text", f), "utf8") : null;
    const y = fs.existsSync(path.join(b, "text", f)) ? fs.readFileSync(path.join(b, "text", f), "utf8") : null;
    if (x !== y) {
      problems++;
      const lx = (x ?? "").split("\n");
      const ly = (y ?? "").split("\n");
      const at = lx.findIndex((l, i) => l !== ly[i]);
      console.error(`text ${f}: first difference at line ${at + 1}\n  - ${lx[at] ?? "(missing)"}\n  + ${ly[at] ?? "(missing)"}`);
    }
  }
  for (const f of fs.readdirSync(path.join(a, "shots"))) {
    const x = fs.readFileSync(path.join(a, "shots", f));
    const y = fs.existsSync(path.join(b, "shots", f)) ? fs.readFileSync(path.join(b, "shots", f)) : null;
    if (!y || !x.equals(y)) {
      problems++;
      console.error(`screenshot ${f} differs`);
    }
  }
  console.log(`${Object.keys(pa).length} printables, ${ta.length} pages of text compared: ${problems ? `${problems} differences` : "identical"}`);
  return problems;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "snap" && rest[0]) await snap(path.resolve(rest[0]));
else if (cmd === "diff" && rest.length === 2) process.exit(diff(path.resolve(rest[0]), path.resolve(rest[1])) ? 1 : 0);
else {
  console.error("usage: pnpm parity snap <dir> | pnpm parity diff <before> <after>");
  process.exit(2);
}
