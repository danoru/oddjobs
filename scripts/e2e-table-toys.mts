/**
 * e2e-table-toys.mts — phase 6's table toys, end to end in headless Chromium:
 * a GM, two phones and the TV on real local tables, for a 5e one-shot (The
 * Drowned Bell) and a Ten Candles one (Lights Out at Marrowby). LOCAL ONLY,
 * like pnpm e2e:candles: run it against a dev or prod server with a database.
 *
 *   pnpm e2e:toys                 — against http://localhost:3004
 *   SHOTS=dir pnpm e2e:toys       — also save screenshots there
 *
 * It plays each feature where it applies — phone dice and the shared tray,
 * notes under the table, the bell on every phone, act cards, the spotlight,
 * the rumor mill, the living town board, inspiration coins, the epilogue kept
 * per table, the tapestry and the chronicle — and page-checks the printed
 * box (Letter and A4), the tapestry and the chronicle. All along it checks,
 * over HTTP and on screen, that players never see GM-only data, other
 * players' notes, hidden rolls or rumor truths. Exits 1 on the first failure.
 */
import { chromium, type APIRequestContext, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadOneShot, loadSpellBook } from "../src/lib/content";
import { cardsFor, paginate } from "../src/systems/dnd5e/cards";
import { extraPages } from "../src/lib/box";
import type { OneShotWithCast } from "../src/lib/schema";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const PLAYER = "x-tearoff-player";

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = path.join(ROOT, ".env");
  const line = fs.existsSync(file) ? fs.readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m")) : null;
  if (!line) throw new Error(`Set ${name} (or put it in .env)`);
  return line[1].trim().replace(/^"|"$/g, "");
}

let passed = 0;
function check(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAILED: ${what}`);
  passed++;
  console.log(`ok   ${what}`);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** axe-core's violations on a page, as one line each. */
async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe is the global the script tag adds
    const out = await window.axe.run(document, { resultTypes: ["violations"] });
    return out.violations.map(
      (v: { impact: string; id: string; help: string; nodes: { target: string[] }[] }) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×, e.g. ${v.nodes[0].target.join(" ")})`,
    );
  });
}

/** Chromium writes one "/Type /Page" object per page. */
const countPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

async function pdfPages(page: Page, route: string, format: "Letter" | "A4") {
  await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  return countPages(pdf);
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function signedIn(password: string, phone = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { password } });
  if (!r.ok()) throw new Error(`Login failed (${r.status()}) — is the server running at ${BASE}?`);
  return ctx;
}

/** Wait until `fn` is true, polling (the app polls every 2–3 s). */
async function until(what: string, fn: () => Promise<unknown>, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`FAILED: timed out waiting for ${what}`);
}

const text = (p: Page) => p.evaluate(() => document.body.innerText);
const playerIdOf = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem("tearoff:player")!).id as string);
const tableOf = (p: Page, slug: string) => p.evaluate((s) => JSON.parse(localStorage.getItem(`tearoff:table:${s}`) ?? "null") as string, slug);

async function live(req: APIRequestContext, code: string, playerId: string | null, as?: "table" | "player") {
  const q = as ? `?as=${as}` : "";
  const r = await req.get(`${BASE}/api/tables/${code}/live${q}`, { headers: playerId ? { [PLAYER]: playerId } : {} });
  return { status: r.status(), json: (await r.json()) as Record<string, unknown>, raw: JSON.stringify(await r.json()) };
}

async function act(req: APIRequestContext, code: string, action: unknown, playerId: string | null, as?: "player") {
  const r = await req.post(`${BASE}/api/tables/${code}/live${as ? `?as=${as}` : ""}`, {
    data: { action },
    headers: playerId ? { [PLAYER]: playerId } : {},
  });
  return { status: r.status(), json: (await r.json()) as { error?: string } };
}

async function openTable(gm: Page, slug: string) {
  await gm.goto(`${BASE}/${slug}/gm`, { waitUntil: "networkidle" });
  await gm.getByRole("button", { name: /^Open a (new )?table$/ }).first().click();
  await until("a table code", async () => /^[A-Z2-9]{5}$/.test((await tableOf(gm, slug)) ?? ""));
  return tableOf(gm, slug);
}

const pages: Page[] = [];

try {
  const gmCtx = await signedIn(env("GM_PASSWORD"));
  const gm = await gmCtx.newPage();
  pages.push(gm);
  gm.on("dialog", (d) => void d.accept());

  // =====================================================================================
  // Part one: D&D 5e — The Drowned Bell
  // =====================================================================================
  const SLUG = "the-drowned-bell";
  const os = loadOneShot(SLUG) as OneShotWithCast & { system: "dnd5e" };
  await gm.clock.install();
  await gm.clock.resume();
  const code = await openTable(gm, SLUG);
  check(true, `GM opened 5e table ${code}`);

  // Two phones join and tear posters.
  const phones: Page[] = [];
  const who = [
    { name: "Ann", id: "rook", char: "Rook" },
    { name: "Bo", id: "marrow", char: "Marrow" },
  ];
  for (const w of who) {
    const ctx = await signedIn(env("APP_PASSWORD"), true);
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    pages.push(p);
    await p.goto(`${BASE}/${SLUG}?table=${code}`, { waitUntil: "networkidle" });
    await p.getByLabel("Your name").fill(w.name);
    await p.getByRole("button", { name: "Join table" }).click();
    await p.getByText(`You're ${w.name}`).waitFor();
    await p.waitForLoadState("networkidle");
    await until(`${w.char} torn`, async () => {
      const strip = p.getByRole("button", { name: new RegExp(`: ${w.char}$`) });
      if (await strip.count()) await strip.click();
      await p.waitForTimeout(800);
      return (await text(p)).includes("by you");
    });
    phones.push(p);
  }
  const [p1, p2] = phones;
  const ids = await Promise.all(phones.map(playerIdOf));
  check(true, "two players joined and tore Rook and Marrow");

  // The job page carries none of the GM-only extras.
  const jobHtml = await (await p1.context().request.get(`${BASE}/${SLUG}`)).text();
  for (const r of os.rumors) check(!jobHtml.includes(r.text.slice(0, 40)), `the job page doesn't carry rumor "${r.id}"`);
  for (const n of os.notices) check(!jobHtml.includes(n.title), `the job page doesn't carry notice preset "${n.id}"`);
  for (const a of os.acts) check(!jobHtml.includes(a.subtitle ?? a.title), `the job page doesn't carry act "${a.id}" before it's shown`);
  check(!jobHtml.includes('"truth"'), "no rumor truths anywhere in the page data");

  // Each phone opens its sheet and lets the bell in.
  for (let i = 0; i < 2; i++) {
    await phones[i].goto(`${BASE}/${SLUG}/${who[i].id}`, { waitUntil: "networkidle" });
    await phones[i].getByRole("button", { name: "Let the bell ring here" }).click();
    await until("bell unlocked", async () => (await phones[i].locator('[data-testid="bells-rung"]').getAttribute("data-sound")) === "on");
  }
  check(true, "both phones tapped once to let the bell in");

  // The TV in the GM's browser.
  const tv = await gmCtx.newPage();
  pages.push(tv);
  await tv.goto(`${BASE}/${SLUG}/tv`, { waitUntil: "networkidle" });

  // ---- 1. Phone dice, shared tray ----
  await p1.getByRole("button", { name: "Roll Stealth" }).click();
  await until("Rook's roll on the phone", async () => (await p1.locator('[data-testid="my-roll-total"]').count()) > 0);
  const total = Number(await p1.locator('[data-testid="my-roll-total"]').innerText());
  check(Number.isFinite(total), `Rook rolls Stealth from the sheet: ${total}`);
  await until("the roll on the TV log", async () => (await tv.locator('[data-testid="tv-roll-log"]').innerText()).includes("Stealth"));
  check(true, "the TV's roll log shows Rook's Stealth roll");
  await p1.getByRole("button", { name: "Advantage" }).click();
  await p1.getByRole("button", { name: "Roll Athletics" }).click();
  await until("advantage roll", async () => (await p1.locator('[aria-label="Dice tray"]').innerText()).includes("with advantage"));
  {
    const v = await live(p1.context().request, code, ids[0], "player");
    const rolls = (v.json.events as { kind: string; data: { mode: string; dice: { kept: boolean }[] } }[]).filter((e) => e.kind === "roll");
    const adv = rolls.at(-1)!.data;
    check(adv.mode === "adv" && adv.dice.length === 2 && adv.dice.filter((d) => d.kept).length === 1, "advantage rolls two d20s and keeps one, on the server");
  }
  await shot(p1, "5e-phone-dice");

  // The GM rolls behind the screen.
  await gm.goto(`${BASE}/${SLUG}/gm`, { waitUntil: "networkidle" });
  await gm.getByLabel("Roll label").fill("AMBUSH-CHECK");
  await gm.getByLabel("Dice to roll").fill("1d20+3");
  await gm.getByRole("button", { name: "Roll", exact: true }).click();
  await until("GM's hidden roll in the GM log", async () => (await gm.locator('[data-testid="gm-roll-log"]').innerText()).includes("AMBUSH-CHECK"));
  for (const [label, req, id] of [
    ["Rook", p1.context().request, ids[0]],
    ["Marrow", p2.context().request, ids[1]],
  ] as const) {
    const v = await live(req, code, id, "player");
    check(!v.raw.includes("AMBUSH-CHECK"), `${label}'s phone never receives the GM's hidden roll`);
  }
  {
    const v = await live(gmCtx.request, code, null, "table");
    check(!v.raw.includes("AMBUSH-CHECK"), "the TV's view never receives the hidden roll, even from the GM's browser");
    check(v.raw.includes('"redacted":true'), "the TV gets a blank 'behind the screen' placeholder instead");
  }
  await until("TV placeholder", async () => (await tv.locator('[data-testid="tv-roll-log"]').innerText()).includes("behind the screen"));
  check(!(await text(tv)).includes("AMBUSH-CHECK"), "the TV screen shows a die rattling behind the screen, not the roll");
  // The GM hides a player's roll after the fact.
  await gm.locator('[data-testid="gm-roll-log"] li', { hasText: "Stealth" }).getByRole("button", { name: "Hide" }).click();
  await until("Stealth hidden from Marrow", async () => !(await live(p2.context().request, code, ids[1], "player")).raw.includes("Stealth"));
  check((await live(p1.context().request, code, ids[0], "player")).raw.includes("Stealth"), "a roll the GM hides stays visible to the player who rolled it");
  check(
    (await act(p1.context().request, code, { type: "roll", label: "x", count: 1, sides: 20, mod: 0, mode: "normal", hidden: true }, ids[0], "player")).status === 409,
    "players can't roll behind the screen",
  );

  // ---- 2. Notes under the table ----
  await p1.getByLabel("Pass the note to").selectOption({ label: "Marrow (Bo)" });
  await p1.getByLabel("Your note").fill("NOTE-ROOK-TO-MARROW meet me at the rope");
  await p1.getByRole("button", { name: "Fold and pass" }).click();
  await until("Marrow reads the note", async () => (await text(p2)).includes("NOTE-ROOK-TO-MARROW"));
  check(true, "Marrow reads Rook's note on their phone");
  await until("TV shows a note changing hands", async () => (await tv.locator('[data-testid="tv-notes-passed"]').textContent()) !== "0");
  check(!(await text(tv)).includes("NOTE-ROOK-TO-MARROW"), "the TV shows only that a note changed hands");
  check(!(await live(gmCtx.request, code, null)).raw.includes("NOTE-ROOK-TO-MARROW"), "the GM can't read a note between two players");
  await p2.getByRole("button", { name: "Reply" }).first().click();
  await p2.getByLabel("Your note").fill("NOTE-REPLY-MARROW aye");
  await p2.getByRole("button", { name: "Fold and pass" }).click();
  await until("Rook reads the reply", async () => (await text(p1)).includes("NOTE-REPLY-MARROW"));
  check(true, "Marrow replies; Rook reads it");
  await p1.getByLabel("Pass the note to").selectOption({ label: "The GM" });
  await p1.getByLabel("Your note").fill("NOTE-TO-GM can I steal the coin");
  await p1.getByRole("button", { name: "Fold and pass" }).click();
  await until("GM reads the note", async () => (await text(gm)).includes("NOTE-TO-GM"));
  check(!(await live(p2.context().request, code, ids[1], "player")).raw.includes("NOTE-TO-GM"), "Marrow can't read Rook's note to the GM");
  await gm.locator('[data-testid="note"]', { hasText: "NOTE-TO-GM" }).getByRole("button", { name: "Reply" }).click();
  await gm.getByLabel("Your note").fill("NOTE-GM-REPLY roll Sleight of Hand");
  await gm.getByRole("button", { name: "Fold and pass" }).click();
  await until("Rook reads the GM's reply", async () => (await text(p1)).includes("NOTE-GM-REPLY"));
  check(!(await live(p2.context().request, code, ids[1], "player")).raw.includes("NOTE-GM-REPLY"), "the GM's reply reaches only Rook");
  await shot(p2, "5e-phone-notes");

  // ---- 3. The bell on every phone ----
  await gm.getByLabel("Stinger").selectOption({ index: 0 });
  await gm.getByLabel("Ring for").selectOption({ label: "Everyone" });
  await gm.getByRole("button", { name: "Ring the bell" }).click();
  for (let i = 0; i < 2; i++) await until(`phone ${i} rings`, async () => (await phones[i].locator('[data-testid="bells-rung"]').innerText()) === "1");
  check(true, "the GM's bell rings (and buzzes) on both phones at once");
  await gm.getByLabel("Ring for").selectOption({ label: "Only Marrow (Bo)" });
  await gm.getByRole("button", { name: "Ring the bell" }).click();
  await until("Marrow rings again", async () => (await p2.locator('[data-testid="bells-rung"]').innerText()) === "2");
  await p1.waitForTimeout(2500);
  check((await p1.locator('[data-testid="bells-rung"]').innerText()) === "1", "a bell for Marrow alone doesn't ring on Rook's phone");
  await p1.reload({ waitUntil: "networkidle" });
  await p1.waitForTimeout(2500);
  check((await p1.locator('[data-testid="bells-rung"]').innerText()) === "0", "reloading a phone doesn't ring old bells again");

  // ---- 4. Act cards on the TV ----
  await gm.getByRole("button", { name: "Next act" }).click();
  await until("act card on the TV", async () => (await tv.locator('[data-testid="tv-act-card"]').count()) > 0);
  check((await tv.locator('[data-testid="tv-act-card"]').innerText()).includes(os.acts[0].title), `the TV raises "${os.acts[0].title}"`);
  await tv.waitForTimeout(3600);
  await shot(tv, "5e-tv-act-card");
  await gm.getByRole("button", { name: "Next act" }).click();
  await until("second act", async () => (await tv.locator('[data-testid="tv-act-card"]').innerText().catch(() => "")).includes(os.acts[1].title));
  check(true, `the GM advances to "${os.acts[1].title}"`);

  // ---- 6. Rumor mill ----
  await p1.getByRole("button", { name: "Listen at the bar" }).click();
  await until("two rumors", async () => (await p1.locator('[data-testid="rumor"]').count()) === 2);
  const heard = await p1.locator('[data-testid="rumor"]').allInnerTexts();
  check(true, "Rook hears two rumors at the bar");
  {
    const v1 = await live(p1.context().request, code, ids[0], "player");
    check(!v1.raw.includes('"truth"'), "Rook's phone gets the rumors without the truth");
    const v2 = await live(p2.context().request, code, ids[1], "player");
    for (const h of heard) check(!v2.raw.includes(h.replace(/[“”"]/g, "").slice(0, 30)), "Marrow can't see the rumors Rook drew");
    check((await act(p1.context().request, code, { type: "rumors" }, ids[0], "player")).status === 409, "a player only draws once");
  }
  await until("GM sees who heard what", async () => (await text(gm)).includes("Heard by Rook"));
  check((await gm.getByText(/HALF TRUE|TRUE|FALSE/).count()) > 0, "the GM sees every rumor's truth");
  await p2.getByRole("button", { name: "Listen at the bar" }).click();
  await until("Marrow's rumors", async () => (await p2.locator('[data-testid="rumor"]').count()) === 2);

  // ---- 7. Living town board ----
  const preset = os.notices[0];
  await gm.locator("li", { hasText: preset.title }).getByRole("button", { name: "Pin" }).click();
  await gm.getByLabel("Notice headline").fill("MISSING: ONE ROWING BOAT");
  await gm.getByRole("button", { name: "Pin a new notice" }).click();
  await until("TV town board", async () => (await tv.locator('[data-testid="tv-notices"]').innerText()).includes("ONE ROWING BOAT"));
  await p1.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
  await until("job page board", async () => (await p1.locator('[data-testid="job-notices"]').innerText()).includes(preset.title));
  check(true, "pinned notices show on the job page and the TV");
  await gm.locator("li", { hasText: preset.title }).getByRole("button", { name: "Stamp settled" }).click();
  await until("SETTLED stamp", async () => (await tv.locator('[data-testid="tv-notices"]').innerText()).includes("SETTLED"));
  check(true, "the GM stamps a notice SETTLED on the TV");
  check((await act(p1.context().request, code, { type: "notice", title: "FORGED" }, ids[0], "player")).status === 409, "players can't pin notices");
  await p1.goto(`${BASE}/${SLUG}/rook`, { waitUntil: "networkidle" });

  // ---- 8. Inspiration coins ----
  await p1.getByLabel("Toss a coin to").selectOption({ label: "Marrow" });
  await p1.getByRole("button", { name: "Toss a coin" }).click();
  await until("Marrow's coin", async () => (await p2.locator('[data-testid="coin-count"]').innerText()) === "1");
  await until("coin flies on the TV", async () => (await tv.locator('[data-testid="tv-coin"]').count()) > 0, 6000).catch(async () => {
    // The flight lasts three seconds; if the poll missed it, the coin must at least be in the TV's log.
    check((await live(gmCtx.request, code, null, "table")).raw.includes('"kind":"coin"'), "the coin toss reached the TV");
  });
  check(true, "Rook tosses a brass coin; it flies across the TV and lands on Marrow's sheet");
  check(await p1.getByRole("button", { name: "Toss a coin" }).isDisabled(), "one toss per act");
  await shot(tv, "5e-tv-tray-board");
  for (const [label, page] of [
    ["the GM page's live tools", gm],
    ["the phone's sheet, toys and dice tray", p1],
    ["the TV's tray and town board", tv],
  ] as const) {
    const v = await axe(page);
    if (v.length) console.log(v.join(String.fromCharCode(10)));
    check(v.length === 0, `axe finds no violations on ${label}`);
  }
  await gm.locator("li", { hasText: "Rook (Ann)" }).getByRole("button", { name: "Grant a coin" }).click();
  await until("Rook's granted coin", async () => (await p1.locator('[data-testid="coin-count"]').innerText()) === "1");
  check(true, "the GM grants Rook a coin");
  await p1.getByRole("button", { name: "Roll Stealth" }).click();
  await p1.getByRole("button", { name: /Spend Heroic Inspiration: reroll/ }).click();
  await until("coin spent", async () => (await p1.locator('[data-testid="coin-count"]').innerText()) === "0");
  check((await p1.locator('[aria-label="Dice tray"]').innerText()).includes("rerolled"), "Rook spends Heroic Inspiration to reroll");

  // ---- 5. Spotlight ----
  await gm.locator('[data-testid="spotlight-row"]', { hasText: "Marrow (Bo)" }).getByLabel("Stake").click();
  await until("tick saved", async () => (await live(gmCtx.request, code, null)).raw.includes('"beat":"stake"'));
  check(!(await live(p2.context().request, code, ids[1], "player")).raw.includes('"beat"'), "spotlight ticks never reach a phone");
  const rows = await gm.locator('[data-testid="spotlight-row"]').allInnerTexts();
  check(rows.some((r) => r.includes("Rook") && /min since/.test(r)), "the spotlight shows minutes since each character's moment");
  await gm.clock.fastForward("25:00");
  await until("spotlight nudge", async () => (await gm.locator('[data-testid="spotlight-nudge"]').count()) > 0);
  const nudge = await gm.locator('[data-testid="spotlight-nudge"]').first().innerText();
  check(/Undelivered/.test(nudge), `after 25 minutes the spotlight nudges, suggesting a letter: "${nudge.slice(0, 80)}…"`);
  await gm.locator('[data-testid="spotlight-nudge"]').first().getByRole("button", { name: "Deliver it" }).click();
  await gm.clock.setSystemTime(new Date()); // back to real time for the rest of the night
  await shot(gm, "5e-gm-live");
  // The recipient breaks the seal.
  await until("a letter opened", async () => {
    for (const p of phones) {
      const seal = p.getByRole("button", { name: "Break the seal and read the letter" }).first();
      if (await seal.count()) {
        // Keep it clear of the dice tray fixed along the bottom of the sheet.
        await seal.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await seal.click({ timeout: 3000 }).catch(() => undefined);
      }
    }
    return (await text(p1)).includes("A LETTER, OPENED") || (await text(p2)).includes("A LETTER, OPENED");
  });
  check(true, "the nudged letter is delivered and opened");

  // ---- Players can't do GM things, or see GM pages ----
  check((await act(p2.context().request, code, { type: "bell", preset: "bell" }, ids[1], "player")).status === 409, "players can't ring the bell");
  check((await act(p2.context().request, code, { type: "act", index: 0 }, ids[1], "player")).status === 409, "players can't raise act cards");
  check((await act(p2.context().request, code, { type: "tick", to: "abcdef123456", beat: "stake", on: true }, ids[1], "player")).status !== 201, "players can't tick the spotlight");
  {
    const r = await p2.context().request.get(`${BASE}/${SLUG}/box`, { maxRedirects: 0 });
    check(r.status() >= 300 && r.status() < 400, "players are sent away from the printed box (it carries the letters)");
  }
  for (const [i, p] of phones.entries()) {
    const v = await live(p.context().request, code, ids[i], "player");
    for (const id of ids) check(!v.raw.includes(id), `phone ${i + 1}'s log carries no browser ids`);
  }

  // ---- 11 (part). The epilogue, kept per table ----
  await gm.goto(`${BASE}/${SLUG}/epilogue`, { waitUntil: "networkidle" });
  await gm.getByLabel("Headline").fill("BELL RINGS AGAIN; STORM BROKEN");
  const fates = gm.getByLabel("Fate");
  await fates.first().click();
  await gm.getByRole("option", { name: "Survived" }).click();
  await until("epilogue saved", async () => (await text(gm)).includes("Saved with the table."));
  await p1.goto(`${BASE}/${SLUG}/epilogue`, { waitUntil: "networkidle" });
  await until("player sees the GM's headline", async () => (await p1.getByLabel("Headline").inputValue()) === "BELL RINGS AGAIN; STORM BROKEN");
  check(await p1.getByLabel("Headline").isDisabled(), "players can't change the front page");
  const rookLine = p1.locator("div", { hasText: /^Rook/ }).getByLabel("Their line for the paper");
  await p1.getByLabel("Their line for the paper").nth(os.cast.findIndex((c) => c.id === "rook")).fill("I cut it, I'll carry it back.");
  void rookLine;
  await until("player line saved", async () => (await text(p1)).includes("Saved with the table."));
  {
    const r = await p2.context().request.patch(`${BASE}/api/tables/${code}/epilogue`, {
      data: { characterId: "rook", entry: { line: "FORGED LINE" } },
      headers: { [PLAYER]: ids[1] },
    });
    check(r.status() === 403, "a player can't write another player's line");
  }
  await gm.reload({ waitUntil: "networkidle" });
  await until("GM sees Rook's line", async () => (await text(gm)).includes("I cut it, I'll carry it back."));
  check(true, "the GM sets the front page; Rook writes their own line; both kept with the table");

  // ---- 10. The night's tapestry ----
  // A player's view reads the titles as text (the GM's are inputs).
  await p1.goto(`${BASE}/${SLUG}/tapestry`, { waitUntil: "networkidle" });
  await until("tapestry panels", async () => (await p1.locator('[data-testid="tapestry-panel"]').count()) > 3);
  const tapestry = await p1.locator('[data-testid="tapestry"]').innerText();
  check((await p1.getByRole("button", { name: "Drop this panel" }).count()) === 0, "players can look at the tapestry but not edit it");
  await gm.goto(`${BASE}/${SLUG}/tapestry`, { waitUntil: "networkidle" });
  await until("GM tapestry", async () => (await gm.locator('[data-testid="tapestry-panel"]').count()) > 3);
  check(tapestry.includes("torn from the board"), "the tapestry weaves the claims");
  check(tapestry.includes("breaks a seal"), "…the letter opened");
  check(tapestry.includes(os.acts[0].title), "…the acts");
  check(/notes? passed under the table/.test(tapestry), "…a count of the notes passed");
  check(tapestry.includes("survived"), "…and the fates");
  check(!tapestry.includes("NOTE-") && !tapestry.includes("AMBUSH-CHECK"), "the tapestry never shows a note's text or a hidden roll");
  const firstTitle = gm.getByLabel("Panel 1 title");
  await firstTitle.fill("WHERE IT BEGAN");
  await firstTitle.blur();
  await until("rename saved", async () => {
    const r = await p1.context().request.get(`${BASE}/api/tables/${code}/tapestry`);
    return JSON.stringify(await r.json()).includes("WHERE IT BEGAN");
  });
  await gm.locator('[data-testid="tapestry-panel"]').nth(1).getByRole("button", { name: "Drop this panel" }).click();
  await until("drop saved", async () => {
    const r = await p1.context().request.get(`${BASE}/api/tables/${code}/tapestry`);
    const j = (await r.json()) as { panels: { dropped: boolean }[] };
    return j.panels.length === (await gm.locator('[data-testid="tapestry-panel"]').count()) - 1;
  });
  check(true, "the GM renames one panel and drops another; players see the edited tapestry");
  await shot(gm, "5e-tapestry");
  for (const layout of ["Long strip", "Poster"]) {
    await gm.getByRole("button", { name: layout }).click();
    await gm.emulateMedia({ media: "print" });
    const pdf = await gm.pdf({ format: "Letter", printBackground: true });
    await gm.emulateMedia({ media: "screen" });
    check(countPages(pdf) >= 1 && countPages(pdf) <= 4, `the tapestry prints as a ${layout.toLowerCase()} (${countPages(pdf)} pages)`);
  }

  // ---- 9. Print the whole box (5e) ----
  {
    const book = loadSpellBook();
    const n = os.cast.length;
    const cards = os.cast.reduce((sum, c) => sum + paginate(cardsFor(c, os.ruleset, book), 9).length, 0);
    const x = extraPages(os);
    const want = 1 + 2 * n + cards + Math.ceil(n / 2) + x.letters + x.acts + x.rumors + x.gazette;
    for (const format of ["Letter", "A4"] as const) {
      const got = await pdfPages(gm, `${SLUG}/box`, format);
      check(got === want, `the 5e box prints on ${format} in ${got} pages (want ${want}: flyer, ${2 * n} sheet pages, ${cards} of cards, tents, ${x.letters} envelopes, act cards, rumor slips, gazette)`);
    }
    await shot(gm, "5e-box");
  }

  // =====================================================================================
  // Part two: Ten Candles — Lights Out at Marrowby
  // =====================================================================================
  const TC = "lights-out-at-marrowby";
  const tcOs = loadOneShot(TC);
  if (tcOs.system !== "tencandles") throw new Error("Marrowby isn't Ten Candles");
  const tcCode = await openTable(gm, TC);
  check(true, `GM opened Ten Candles table ${tcCode}`);
  const tcPhones: Page[] = [];
  for (const [i, name] of ["Cy", "Di"].entries()) {
    const ctx = await signedIn(env("APP_PASSWORD"), true);
    const p = await ctx.newPage();
    pages.push(p);
    await p.goto(`${BASE}/${TC}/play?table=${tcCode}`, { waitUntil: "networkidle" });
    await p.getByLabel("Your name").fill(name);
    await p.getByRole("button", { name: "Join table" }).click();
    await p.getByRole("button", { name: "Sit at the table" }).click();
    await p.getByText(`Seat ${i + 1} of`).waitFor();
    await p.getByRole("button", { name: "Let the bell ring here" }).click();
    tcPhones.push(p);
  }
  const tcIds = await Promise.all(tcPhones.map(playerIdOf));
  const game = async (action: unknown, playerId: string | null) => {
    const r = await (playerId ? tcPhones[tcIds.indexOf(playerId)].context().request : gmCtx.request).post(`${BASE}/api/tables/${tcCode}/game${playerId ? "?as=player" : ""}`, {
      data: { action },
      headers: playerId ? { [PLAYER]: playerId } : {},
    });
    if (!r.ok()) throw new Error(`game action ${JSON.stringify(action)} failed: ${JSON.stringify(await r.json())}`);
    return (await r.json()) as { game: { phase: string; candles: boolean[]; truths: { speaker: unknown } | null } };
  };
  // Character creation, quickly, through the game API (pnpm e2e:candles plays it through the phones).
  // Drafts are tested on purpose below, not at random.
  await game({ type: "settings", patch: { draftsPerHour: 0 } }, null);
  await game({ type: "begin" }, null);
  for (const id of tcIds) await game({ type: "traits", virtue: "brave", vice: "rash" }, id);
  await game({ type: "next" }, null);
  await game({ type: "next" }, null);
  for (const [i, id] of tcIds.entries()) await game({ type: "concept", name: `Survivor${i}`, look: "a wet coat", concept: "someone in the dark" }, id);
  await game({ type: "next" }, null);
  for (const id of tcIds) await game({ type: "moment", text: "I will find hope at the crossing" }, id);
  await game({ type: "next" }, null);
  for (const id of tcIds) await game({ type: "brink", text: "I have seen you run" }, id);
  await game({ type: "brink", text: "They have seen you hide" }, null);
  await game({ type: "next" }, null);
  for (const id of tcIds) await game({ type: "order", order: ["virtue", "vice", "moment"] }, id);
  await game({ type: "next" }, null);
  for (const id of tcIds) await game({ type: "recorded", kind: "text" }, id);
  await game({ type: "next" }, null); // → scene 1
  check(true, "two players seated and made characters; scene 1 begins");

  const tcTv = await gmCtx.newPage();
  pages.push(tcTv);
  await tcTv.goto(`${BASE}/${TC}/tv`, { waitUntil: "networkidle" });
  {
    const v = await live(gmCtx.request, tcCode, null, "table");
    check(v.raw.includes(tcOs.acts[0].title), `the candles raise the first act card by themselves: "${tcOs.acts[0].title}"`);
  }
  // A phone rolls the pool (the game's own dice); it lands in the TV's roll log.
  await tcPhones[0].getByRole("button", { name: /^Roll 10 dice/ }).click();
  await tcPhones[0].getByRole("button", { name: "Settle it" }).click();
  await until("TC roll in the TV log", async () => (await tcTv.locator('[data-testid="tv-roll-log"]').innerText()).includes("Scene 1"));
  check(true, "a Ten Candles roll from the phone lands in the TV's roll log");
  check(
    (await act(tcPhones[0].context().request, tcCode, { type: "roll", label: "x", count: 1, sides: 20, mod: 0, mode: "normal" }, tcIds[0], "player")).status === 409,
    "Ten Candles phones roll the game's pool, not d20s",
  );
  check((await act(gmCtx.request, tcCode, { type: "coin", to: "abcdef123456" }, null)).json.error?.includes("No coins") ?? false, "Ten Candles has no inspiration coins");
  check(!(await text(tcPhones[0])).includes("Toss a coin"), "…and no coin card on the phone");

  // Candles go dark; when they burn into the next stage, its act card goes up.
  let g = await game({ type: "candle", index: 9, lit: false }, null); // scene ends → truths
  await game({ type: "candle", index: 8, lit: false }, null);
  g = await game({ type: "candle", index: 7, lit: false }, null);
  while (g.game.phase === "truths" && g.game.truths?.speaker !== null) g = await game({ type: "truth", text: "The rain will not stop" }, null);
  await game({ type: "close" }, null); // → scene 2, seven candles
  await until("second act on the TC TV", async () => (await live(gmCtx.request, tcCode, null, "table")).raw.includes(tcOs.acts[1].title));
  await until("act card shown", async () => (await tcTv.locator('[data-testid="tv-act-card"]').innerText().catch(() => "")).includes(tcOs.acts[1].title));
  check(true, `at seven candles the TV raises "${tcOs.acts[1].title}"`);
  await tcTv.waitForTimeout(3600);
  await shot(tcTv, "tc-tv-act-card");

  // A draft: the candle sputters on the TV and the GM must decide.
  await gm.goto(`${BASE}/${TC}/gm`, { waitUntil: "networkidle" });
  await game({ type: "draft" }, null);
  await gm.getByRole("alertdialog").waitFor();
  check((await gm.getByRole("alertdialog").innerText()).includes("is sputtering"), "a draft puts a prompt in front of the GM");
  await until("the TV shows the draft", async () => (await tcTv.getByText("A draft stirs the candles").count()) > 0);
  check(true, "the TV shows the candle sputtering");
  await shot(gm, "tc-gm-draft");
  await shot(tcTv, "tc-tv-draft");
  const litBefore = (await game({ type: "settings", patch: {} }, null)).game.candles.filter(Boolean).length;
  await gm.getByRole("button", { name: "It holds" }).click();
  await until("prompt gone", async () => (await gm.getByRole("alertdialog").count()) === 0);
  check((await game({ type: "settings", patch: {} }, null)).game.candles.filter(Boolean).length === litBefore, "the GM says it holds: no candle lost");
  check(
    (await (await gmCtx.request.get(`${BASE}/api/tables/${tcCode}/game?as=table`)).json()).game.burnsOut.filter((x: number | null) => x !== null).length === litBefore,
    "every lit candle on the screen has a burn time",
  );

  // Notes, bell and rumors at a Ten Candles table.
  await tcPhones[0].getByLabel("Pass the note to").selectOption({ index: 1 });
  await tcPhones[0].getByLabel("Your note").fill("NOTE-TC-SECRET follow the rails");
  await tcPhones[0].getByRole("button", { name: "Fold and pass" }).click();
  await until("TC note read", async () => (await text(tcPhones[1])).includes("NOTE-TC-SECRET"));
  check(!(await live(gmCtx.request, tcCode, null, "table")).raw.includes("NOTE-TC-SECRET"), "Ten Candles: the TV sees a note pass, not its text");
  await gm.goto(`${BASE}/${TC}/gm`, { waitUntil: "networkidle" });
  await until("TC spotlight rows", async () => (await gm.locator('[data-testid="spotlight-row"]').count()) === 2);
  check((await gm.locator('[data-testid="spotlight-nudge"]').count()) === 0, "Ten Candles: the spotlight tracks both seats, and nobody is overdue yet");
  check((await gm.locator('[data-testid="spotlight-row"]').first().getByLabel("Brink").count()) === 1, "…with Ten Candles' own beats (Virtue, Vice, Moment, Brink)");
  await gm.getByRole("button", { name: "Ring the bell" }).click();
  for (const p of tcPhones) await until("TC bell", async () => (await p.locator('[data-testid="bells-rung"]').innerText()) === "1");
  check(true, "Ten Candles: the GM's bell rings on both phones");
  await tcPhones[1].getByRole("button", { name: "Listen at the bar" }).click();
  await until("TC rumors", async () => (await tcPhones[1].locator('[data-testid="rumor"]').count()) === 2);
  check(!(await live(tcPhones[1].context().request, tcCode, tcIds[1], "player")).raw.includes('"truth"'), "Ten Candles: rumors without the truth");
  await gm.locator("li", { hasText: tcOs.notices[0].title }).getByRole("button", { name: "Pin" }).click();
  await until("TC notice on TV", async () => (await tcTv.locator('[data-testid="tv-notices"]').innerText()).includes(tcOs.notices[0].title));
  check(true, "Ten Candles: the town board shows on the TV");
  await shot(tcPhones[0], "tc-phone-toys");

  // Epilogue and tapestry for the Ten Candles night.
  await gm.goto(`${BASE}/${TC}/epilogue`, { waitUntil: "networkidle" });
  await gm.getByLabel("Headline").fill("THE LAST LAMP AT MARROWBY");
  await until("TC epilogue saved", async () => (await text(gm)).includes("Saved with the table."));
  // "load", not "networkidle": with the database store the pages are ISR, and Next quietly re-fetches
  // stale page data in the background, which never counts as idle. The panels are waited for below.
  await tcPhones[0].goto(`${BASE}/${TC}/tapestry`, { waitUntil: "load" });
  await until("TC tapestry", async () => (await tcPhones[0].locator('[data-testid="tapestry-panel"]').count()) > 2);
  const tcTapestry = await tcPhones[0].locator('[data-testid="tapestry"]').innerText();
  check((tcTapestry.match(/A candle goes dark/g) ?? []).length >= 3, "the Ten Candles tapestry weaves the candles going dark");
  check(tcTapestry.includes(tcOs.acts[1].title), "…and the acts the candles raised");
  check(!tcTapestry.includes("NOTE-TC-SECRET"), "…and never a note's text");

  // ---- 9. Print the whole box (Ten Candles) ----
  {
    const kit = await pdfPages(gm, `${TC}/kit`, "Letter");
    const x = extraPages(tcOs);
    const want = kit + x.letters + x.acts + x.rumors + x.gazette;
    for (const format of ["Letter", "A4"] as const) {
      const kitHere = format === "Letter" ? kit : await pdfPages(gm, `${TC}/kit`, format);
      const w = kitHere + x.letters + x.acts + x.rumors + x.gazette;
      const got = await pdfPages(gm, `${TC}/box`, format);
      check(got === w, `the Ten Candles box prints on ${format} in ${got} pages (want ${w}: the ${kitHere}-page kit, envelopes, act cards, rumor slips, gazette)`);
    }
    void want;
  }

  // ---- 11. The chronicle ----
  await gm.goto(`${BASE}/chronicle`, { waitUntil: "networkidle" });
  const chronicle = await text(gm);
  check(chronicle.includes("BELL RINGS AGAIN; STORM BROKEN") && chronicle.includes("THE LAST LAMP AT MARROWBY"), "the chronicle binds both nights' broadsheets");
  check((await gm.locator('[data-testid="chronicle-chapter"]').count()) >= 2, "a chapter per night");
  check(chronicle.includes("WHERE IT BEGAN"), "the chronicle uses the GM's tapestry edits");
  check(!chronicle.includes("NOTE-") && !chronicle.includes("AMBUSH-CHECK"), "no note texts or hidden rolls in the chronicle");
  {
    await gm.emulateMedia({ media: "print" });
    const chapters = await gm.locator('[data-testid="chronicle-chapter"]').count();
    const pdf = await gm.pdf({ format: "Letter", printBackground: true });
    await gm.emulateMedia({ media: "screen" });
    check(countPages(pdf) >= 1 + 2 * chapters, `the chronicle prints: a title page and ${chapters} chapters in ${countPages(pdf)} pages`);
  }
  await shot(gm, "chronicle");

  console.log(`\nall ${passed} checks passed`);
} catch (e) {
  console.error((e as Error).message);
  for (const [i, p] of pages.entries()) await shot(p, `fail-${i}`).catch(() => undefined);
  await browser.close();
  process.exit(1);
}
await browser.close();
