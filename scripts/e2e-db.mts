/**
 * e2e-db.mts — the database store end to end, in headless Chromium, against a
 * running server with TEAROFF_STORE=db and the git content imported
 * (`pnpm db:import`). LOCAL ONLY. Run it against a production server
 * (`pnpm build && pnpm start`, both with TEAROFF_STORE=db) to prove the pages
 * change with no rebuild; it works against `pnpm dev` too.
 *
 *   pnpm e2e:db                 — against http://localhost:3004
 *   SHOTS=dir pnpm e2e:db       — also save screenshots there
 *
 * It checks the imported one-shots are on the board, then, in the builder:
 * duplicates a Ten Candles module, renames and publishes it (on the board at
 * once), publishes a revision, restores the first version from the history
 * panel and publishes that (the board follows), unpublishes it (its pages
 * are 404s and it's off the board) and deletes it. It edits a spell in the
 * spell book and finds the new text on a one-shot's cards, saves a survivor
 * from an epilogue and finds them on the board, reads a GM page and the
 * table API from the database, and checks players can't reach the builder,
 * its history, or the shared world's API. Everything it changes is put back.
 * Exits 1 on the first failure. (`pnpm e2e:builder` against the same server
 * writes a 5e, Ten Candles, Daggerheart and Paranoia one-shot from nothing.)
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const SLUG = "db-test-night";
const SOURCE = "lights-out-at-marrowby";
const SPELL = "Guidance";
const SPELL_USER = "the-drowned-bell";
const MARK = "Chalk-marked by the database test.";

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = path.join(ROOT, ".env");
  const line = fs.existsSync(file) ? fs.readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m")) : null;
  if (!line) throw new Error(`Set ${name} (or put it in .env)`);
  return line[1].trim().replace(/^"|"$/g, "");
}

function check(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok   ${what}`);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

const browser = await chromium.launch();
const gm = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
{
  const r = await gm.request.post(`${BASE}/api/login`, { data: { password: env("GM_PASSWORD") } });
  if (!r.ok()) throw new Error(`Login failed (${r.status()}) — is the server running at ${BASE}?`);
}
const api = gm.request;
const gate = ((await (await api.get(`${BASE}/api/admin/oneshots`)).json()) as { gate?: { kind?: string } }).gate;
if (gate?.kind !== "db") throw new Error("The server isn't using the database store: start it with TEAROFF_STORE=db");
if ((await api.get(`${BASE}/api/admin/oneshots/${SLUG}`)).status() !== 404) throw new Error(`${SLUG} already exists; delete it first`);

const page = await gm.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (e) => void (/Route change aborted/.test(String(e)) || pageErrors.push(String(e))));
page.on("dialog", (d) => void d.accept());

/** A page's text, as a stranger to the builder would get it: a fresh load. */
async function textOf(url: string): Promise<string> {
  const r = await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 120000 });
  if (r?.status() !== 200) throw new Error(`${url} answered ${r?.status()}`);
  return page.locator("body").innerText();
}
const status = async (url: string) => (await api.get(`${BASE}${url}`, { maxRedirects: 0 })).status();
const stored = async (slug: string) =>
  (await (await api.get(`${BASE}/api/admin/oneshots/${slug}`)).json()) as { status: string; draft: { oneshot: { title: string } } | null; published: { oneshot: { title: string } } | null };
const field = (p: string) => page.locator(`[data-field="${p}"]`).first();
/** The builder for a slug, ready to type in. */
async function openBuilder(slug: string) {
  await page.goto(`${BASE}/admin/${slug}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("[data-issue-count]").waitFor({ timeout: 60000 });
  await page.locator('[data-testid="history"] li').first().waitFor({ timeout: 30000 });
}
async function saved() {
  await page.locator('[data-save-state="saved"]').waitFor({ timeout: 15000 });
}
async function publishInBuilder() {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByText("Published. It's on the board now").waitFor({ timeout: 60000 });
}
async function rename(title: string) {
  await field("oneshot.title").fill(title);
  await page.waitForTimeout(300);
  await saved();
}

let spellBefore: unknown = null;
let survivorId: string | null = null;
try {
  // ======================= The imported content =======================
  const board = await textOf("/");
  for (const t of ["The Drowned Bell", "Lights Out at Marrowby", "A Vow Before Dawn"]) check(board.includes(t), `the imported "${t}" is on the board`);
  check((await textOf(`/${SPELL_USER}`)).includes("The Drowned Bell"), "a job page renders from the database");
  const gmPage = await textOf(`/${SPELL_USER}/gm`);
  check(gmPage.includes("Behind the screen"), "the GM page reads the one-shot from the database");

  // ======================= Publish, revise, restore =======================
  {
    const r = await api.post(`${BASE}/api/admin/oneshots/${SOURCE}/duplicate`, { data: { to: SLUG } });
    check(r.status() === 201, "a Ten Candles module duplicates into a new draft");
  }
  check((await status(`/${SLUG}`)) === 404, "a draft has no player page");
  check((await status(`/${SLUG}/gm`)) === 404, "…nor a GM page");
  await openBuilder(SLUG);
  check((await page.locator('[data-testid="history"] li').count()) === 1, "the history panel shows the new draft");
  await rename("DB Test Night");
  await publishInBuilder();
  await shot(page, "01-published");
  check((await textOf("/")).includes("DB Test Night"), "the published module is on the board at once, with no rebuild");
  check((await textOf(`/${SLUG}`)).includes("DB Test Night"), "…and its job page");
  check((await textOf(`/${SLUG}/play`)).length > 0, "…and its phone page");

  await openBuilder(SLUG);
  await rename("DB Test Night, Revised");
  await publishInBuilder();
  const revised = await textOf("/");
  check(revised.includes("DB Test Night, Revised"), "a revision is published over it");

  const hist = ((await (await api.get(`${BASE}/api/admin/oneshots/${SLUG}/history`)).json()) as { revisions: { id: string; action: string; title: string }[] }).revisions;
  check(hist[0].action === "publish" && hist[0].title === "DB Test Night, Revised", "the history has the newest publish on top");
  const first = hist.find((h) => h.action === "publish" && h.title === "DB Test Night")!;
  check(first, "…and the first publish below it");
  await openBuilder(SLUG);
  await page.locator(`[data-revision="${first.id}"]`).waitFor({ timeout: 15000 });
  await shot(page, "02-history");
  await Promise.all([page.waitForEvent("load", { timeout: 60000 }), page.locator(`[data-revision="${first.id}"] button`).click()]);
  await page.locator("[data-issue-count]").waitFor({ timeout: 60000 });
  check((await field("oneshot.title").inputValue()) === "DB Test Night", "restoring opens that version as the draft");
  check((await stored(SLUG)).published?.oneshot.title === "DB Test Night, Revised", "…without touching the board yet");
  await publishInBuilder();
  const restored = await textOf("/");
  check(restored.includes("DB Test Night") && !restored.includes("DB Test Night, Revised"), "publishing the restored version puts it back on the board");

  // ======================= Unpublish and delete =======================
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator(`[data-slug="${SLUG}"]`).getByRole("button", { name: "Unpublish" }).click();
  await page.locator(`[data-slug="${SLUG}"] [data-status="draft"]`).waitFor({ timeout: 60000 });
  check((await status(`/${SLUG}`)) === 404, "after unpublishing, its job page is a 404");
  check((await status(`/${SLUG}/play`)) === 404, "…and so is its phone page");
  check(!(await textOf("/")).includes("DB Test Night"), "…and it's off the board");

  // ======================= The spell book =======================
  spellBefore = ((await (await api.get(`${BASE}/api/admin/spells`)).json()) as { spells: Record<string, unknown> }).spells[SPELL];
  check(spellBefore, `${SPELL} is in the database's spell book`);
  check(!(await textOf(`/${SPELL_USER}/cards`)).includes(MARK), "the cards don't have the new text yet");
  await page.goto(`${BASE}/admin/spells`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator(`[data-spell="${SPELL}"]`).getByRole("button", { name: "Edit" }).click();
  await field("text").fill(`${(spellBefore as { text: string }).text.slice(0, 200)} ${MARK}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  check((await textOf(`/${SPELL_USER}/cards`)).includes(MARK), "an edited spell shows on the one-shot's cards");
  await shot(page, "03-cards");

  // ======================= The shared world =======================
  await page.goto(`${BASE}/${SPELL_USER}/epilogue`, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Fate" }).first().click();
  await page.getByRole("option", { name: "Survived", exact: true }).click();
  await page.getByLabel("Their line for the paper").first().fill("I rang it once, and that was plenty.");
  const name = (await page.locator("main h2").first().innerText()).split("\n")[0].trim();
  const saveReq = page.waitForResponse((r) => r.url().endsWith("/api/admin/survivors"));
  await page.getByRole("button", { name: "Save to the shared world" }).click();
  const saveRes = await saveReq;
  survivorId = ((await saveRes.json()) as { saved?: string[] }).saved?.[0] ?? null;
  await page.getByText(/Saved 1 record to the shared world/).waitFor({ timeout: 30000 });
  check(survivorId?.startsWith(`${SPELL_USER}/`), `the epilogue saves a survivor to the database (${survivorId})`);
  await shot(page, "04-epilogue");
  const home = await textOf("/");
  check(home.includes("Notable survivors") && home.includes(name.replace(/\s+the .*/, "").split(" ")[0]), `the survivor (${name}) is on the home board`);
  await shot(page, "05-board-survivor");

  // ======================= Players stay out =======================
  const player = await browser.newContext();
  await player.request.post(`${BASE}/api/login`, { data: { password: env("APP_PASSWORD") } });
  const pp = await player.newPage();
  for (const url of ["/admin", `/admin/${SLUG}`, "/admin/spells"]) {
    await pp.goto(`${BASE}${url}`);
    check(new URL(pp.url()).pathname === "/login", `a player opening ${url} is sent to the login page`);
  }
  for (const [method, url, data] of [
    ["GET", `/api/admin/oneshots/${SLUG}/history`, undefined],
    ["POST", `/api/admin/oneshots/${SLUG}/restore`, { revision: first.id }],
    ["POST", `/api/admin/oneshots/${SLUG}/publish`, undefined],
    ["PUT", "/api/admin/spells", { name: SPELL, info: spellBefore }],
    ["POST", "/api/admin/survivors", { records: [] }],
    ["DELETE", "/api/admin/survivors", { ids: [survivorId] }],
  ] as const) {
    const r = await player.request.fetch(`${BASE}${url}`, { method, data });
    check(r.status() === 403, `a player gets 403 from ${method} ${url}`);
  }
  await pp.goto(`${BASE}/${SPELL_USER}/epilogue`, { waitUntil: "networkidle" });
  await pp.getByRole("combobox", { name: "Fate" }).first().click();
  await pp.getByRole("option", { name: "Fell", exact: true }).click();
  await pp.getByRole("button", { name: "Save to the shared world" }).click();
  await pp.getByText("Only the GM can save to the shared world.").waitFor({ timeout: 15000 });
  check(true, "a player saving from the epilogue is told only the GM can");
  await player.close();

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
} finally {
  // ======================= Put everything back =======================
  if (spellBefore) await api.put(`${BASE}/api/admin/spells`, { data: { name: SPELL, info: spellBefore } });
  if (survivorId) await api.delete(`${BASE}/api/admin/survivors`, { data: { ids: [survivorId] } });
  if ((await api.get(`${BASE}/api/admin/oneshots/${SLUG}`)).status() === 200)
    await api.delete(`${BASE}/api/admin/oneshots/${SLUG}`, { data: { confirm: SLUG } });
  await browser.close();
}
console.log("\nThe database store works end to end.");
