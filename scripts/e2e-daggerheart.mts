/**
 * e2e-daggerheart.mts — a Daggerheart night end to end in headless Chromium:
 * a GM, two phones and the TV on a real local table for A Vow Before Dawn.
 * LOCAL ONLY, like pnpm e2e:toys: run it against a dev or prod server with a
 * database.
 *
 *   pnpm e2e:daggerheart              — against http://localhost:3004
 *   BASE_URL=http://localhost:3005 pnpm e2e:daggerheart
 *   SHOTS=dir pnpm e2e:daggerheart    — also save screenshots there
 *
 * It plays the duality dice from the sheet on the phone (rolled on the
 * server: with Hope, with Fear, Experiences for Hope, advantage, damage), the
 * TV's dice, outcome and Fear pool, the GM's opening Fear and spending it,
 * Hope, Stress, Hit Points and Armor ticked on the phones (and the damage
 * helper), adversary attacks behind the screen, and phase 6's toys at a
 * Daggerheart table: notes, the bell, act cards, the spotlight, rumors, the
 * town board, the box (Letter and A4), the tapestry and the chronicle. Along
 * the way it checks over HTTP that players never see the adversaries, GM
 * notes, letters, other players' notes or hidden rolls, that duality rolls
 * can't be hidden, and that nobody gets a browser id. Exits 1 on the first
 * failure.
 */
import { chromium, type APIRequestContext, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadOneShot } from "../src/lib/content";
import { paginate } from "../src/systems/dnd5e/cards";
import { cardsFor } from "../src/systems/daggerheart/cards";
import { sheetLimits } from "../src/systems/daggerheart/derive";
import { foldTallies, type DualityData } from "../src/systems/daggerheart/live";
import { extraPages } from "../src/lib/box";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const PLAYER = "x-tearoff-player";
const SLUG = "a-vow-before-dawn";

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

type Ev = { id: number; kind: string; data: unknown };
async function live(req: APIRequestContext, code: string, playerId: string | null, as?: "table" | "player") {
  const q = as ? `?as=${as}` : "";
  const r = await req.get(`${BASE}/api/tables/${code}/live${q}`, { headers: playerId ? { [PLAYER]: playerId } : {} });
  const json = (await r.json()) as { events: Ev[] };
  return { status: r.status(), json, raw: JSON.stringify(json) };
}

async function act(req: APIRequestContext, code: string, action: unknown, playerId: string | null, as?: "player") {
  const r = await req.post(`${BASE}/api/tables/${code}/live${as ? `?as=${as}` : ""}`, {
    data: { action },
    headers: playerId ? { [PLAYER]: playerId } : {},
  });
  return { status: r.status(), json: (await r.json()) as { error?: string } };
}

const pages: Page[] = [];
const os = loadOneShot(SLUG);
if (os.system !== "daggerheart") throw new Error(`${SLUG} isn't Daggerheart`);
const limits = sheetLimits(os.cast);
const testid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

try {
  const gmCtx = await signedIn(env("GM_PASSWORD"));
  const gm = await gmCtx.newPage();
  pages.push(gm);
  gm.on("dialog", (d) => void d.accept());
  await gm.clock.install();
  await gm.clock.resume();
  await gm.goto(`${BASE}/${SLUG}/gm`, { waitUntil: "networkidle" });
  await gm.getByRole("button", { name: /^Open a (new )?table$/ }).first().click();
  await until("a table code", async () => /^[A-Z2-9]{5}$/.test((await tableOf(gm, SLUG)) ?? ""));
  const code = await tableOf(gm, SLUG);
  check(true, `GM opened Daggerheart table ${code}`);
  check((await text(gm)).includes(os.adversaries[0].name), "the GM page lists tonight's adversaries");

  // ---- Two phones join and tear posters ----
  const who = [
    { name: "Ann", id: "wren-ashby", char: "Wren Ashby" },
    { name: "Bo", id: "pell-nimblewick", char: "Pell Nimblewick" },
  ];
  const phones: Page[] = [];
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
  check(true, "two players joined and tore Wren and Pell");

  // ---- Nothing GM-only on player pages ----
  for (const route of [SLUG, `${SLUG}/wren-ashby`, `${SLUG}/print`, `${SLUG}/cards`]) {
    const html = await (await p1.context().request.get(`${BASE}/${route}`)).text();
    for (const a of os.adversaries) check(!html.includes(a.name), `/${route} doesn't carry adversary "${a.name}"`);
    check(!html.includes(os.gmNotes!.slice(0, 60)), `/${route} doesn't carry the GM notes`);
    for (const l of os.letters) check(!html.includes(l.text.slice(0, 50)), `/${route} doesn't carry letter "${l.id}"`);
  }
  check((await (await p1.context().request.get(`${BASE}/${SLUG}`)).text()).includes("Darrington Press Community Gaming"), "the job page carries the DPCGL notice");

  // ---- Phones open their sheets ----
  for (let i = 0; i < 2; i++) {
    await phones[i].goto(`${BASE}/${SLUG}/${who[i].id}`, { waitUntil: "networkidle" });
    await phones[i].getByRole("button", { name: "Let the bell ring here" }).click();
    await until("bell unlocked", async () => (await testid(phones[i], "bells-rung").getAttribute("data-sound")) === "on");
  }
  check((await testid(p1, "my-hope").innerText()) === "2", "each character starts the night with 2 Hope");

  const tv = await gmCtx.newPage();
  pages.push(tv);
  await tv.goto(`${BASE}/${SLUG}/tv`, { waitUntil: "networkidle" });

  // ---- The opening Fear ----
  await gm.goto(`${BASE}/${SLUG}/gm`, { waitUntil: "networkidle" });
  await gm.getByRole("button", { name: "Take the opening Fear (2)" }).click();
  await until("TV Fear 2", async () => (await testid(tv, "tv-fear").innerText()) === "2");
  await until("phone sees Fear 2", async () => (await testid(p1, "phone-fear").innerText()) === "2");
  check(true, "the GM takes the opening Fear (one per player); the TV and the phones show 2");

  // ---- Duality dice from the sheet ----
  const server = async () => {
    const v = await live(gmCtx.request, code, null);
    return { events: v.json.events, fold: foldTallies(v.json.events, limits) };
  };
  const seen = new Set<string>();
  for (let n = 0; n < 24 && !(seen.has("hope") && seen.has("fear")); n++) {
    const before = await server();
    await p1.getByRole("button", { name: "Roll Strength" }).click();
    let roll: DualityData | null = null;
    await until("a new duality roll", async () => {
      const after = await server();
      const rolls = after.events.filter((e) => e.kind === "roll" && (e.data as DualityData).system === "duality");
      if (rolls.length <= before.events.filter((e) => e.kind === "roll" && (e.data as DualityData).system === "duality").length) return false;
      roll = rolls.at(-1)!.data as DualityData;
      return true;
    });
    const r = roll!;
    const after = (await server()).fold;
    const wren = { before: before.fold.marks["wren-ashby"], after: after.marks["wren-ashby"] };
    const strength = os.cast.find((c) => c.id === "wren-ashby")!.mech.traits.strength;
    check(r.total === r.hope + r.fear + strength && r.mod === strength, `Wren rolls Strength: Hope ${r.hope} + Fear ${r.fear} ${strength >= 0 ? "+" : "−"} ${Math.abs(strength)} = ${r.total}, ${r.outcome}`);
    if (r.outcome === "hope") check(wren.after.hope === Math.min(6, wren.before.hope + 1) && after.fear === before.fold.fear, "…with Hope: Wren gains a Hope, Fear holds");
    if (r.outcome === "fear") check(after.fear === Math.min(12, before.fold.fear + 1) && wren.after.hope === wren.before.hope, "…with Fear: the GM gains a Fear");
    if (r.outcome === "crit") check(wren.after.hope === Math.min(6, wren.before.hope + 1), "…a critical: a Hope (and a Stress cleared)");
    seen.add(r.outcome);
    const word = r.outcome === "crit" ? "Critical success!" : r.outcome === "hope" ? "with Hope" : "with Fear";
    await until("phone outcome", async () => (await testid(p1, "my-roll-outcome").innerText()).includes(word));
    await until("TV outcome", async () => (await testid(tv, "tv-duality-outcome").innerText().catch(() => "")).includes(word));
    await until("TV Fear matches", async () => Number(await testid(tv, "tv-fear").innerText()) === after.fear);
    if (r.outcome === "fear" && SHOTS) {
      await tv.waitForTimeout(2500);
      await shot(tv, "dh-tv-with-fear");
    }
    if (r.outcome === "hope") await shot(p1, "dh-phone-with-hope");
  }
  check(seen.has("hope") && seen.has("fear"), "the phone and the TV show both 'with Hope' and 'with Fear' rolls, and the TV's Fear pool follows");

  // An Experience costs a Hope; advantage adds a d6.
  {
    const before = (await server()).fold.marks["wren-ashby"].hope;
    await p1.getByRole("button", { name: /^Warden of the Ford \+2$/ }).click();
    await p1.getByRole("button", { name: "Advantage +d6" }).click();
    await p1.getByRole("button", { name: "Roll Presence" }).click();
    await until("the Experience roll", async () => {
      const e = (await server()).events.filter((x) => x.kind === "roll").at(-1)!.data as DualityData;
      return e.label === "Presence" && e.experiences.length === 1;
    });
    const e = (await server()).events.filter((x) => x.kind === "roll").at(-1)!.data as DualityData;
    check(e.adv?.sign === 1 && e.total === e.hope + e.fear + e.adv.value + e.mod + 2, `an Experience (+2) and advantage (+d6 = ${e.adv?.value}) are rolled in on the server`);
    const now = (await server()).fold.marks["wren-ashby"].hope;
    const gained = e.outcome === "fear" ? 0 : 1;
    check(now === Math.min(6, before - 1 + gained), `the Experience costs a Hope (${before} → ${now})`);
  }
  if (SHOTS) {
    await p1.waitForTimeout(1500);
    await p1.getByRole("button", { name: "Roll Strength" }).scrollIntoViewIfNeeded();
    await p1.screenshot({ path: path.join(SHOTS, "dh-phone-tray.png") });
  }
  // Damage dice: Proficiency × the weapon's die.
  await p1.getByRole("button", { name: "Roll Mace damage" }).click();
  await until("damage roll", async () => (await live(p1.context().request, code, ids[0], "player")).raw.includes("Mace damage"));
  {
    const e = (await server()).events.filter((x) => x.kind === "roll").at(-1)!.data as { system: string; dice: { sides: number }[]; label: string };
    check(e.system === "d20" && e.dice.length === 1 && e.dice[0].sides === 8, "Mace damage rolls 1d8 (Proficiency 1) through the log");
  }
  await shot(p1, "dh-phone-sheet");

  // ---- Hope, Stress, HP and Armor on the phone ----
  await p2.getByRole("button", { name: "Stress marked 2" }).click();
  await until("Pell's Stress 2 on the TV", async () => (await testid(tv, "tv-marks-pell-nimblewick").getAttribute("data-stress")) === "2");
  await p2.getByLabel("Damage taken").fill("15");
  check((await testid(p2, "damage-band").innerText()).startsWith("Severe: mark 3 HP"), "15 damage is Severe for Pell (thresholds 7/14): 3 HP");
  await p2.getByLabel("Mark an Armor Slot (−1)").check();
  await p2.getByRole("button", { name: "Mark 2 HP" }).click();
  await until("Pell's HP on the TV", async () => (await testid(tv, "tv-marks-pell-nimblewick").getAttribute("data-hp")) === "2");
  {
    const f = (await server()).fold.marks["pell-nimblewick"];
    check(f.hp === 2 && f.armor === 1 && f.stress === 2, "an Armor Slot drops Severe to Major: Pell marks 2 HP and 1 Armor; the TV shows it");
  }
  await until("GM sees Pell's marks", async () => (await testid(gm, "gm-marks-pell-nimblewick").getAttribute("data-hp")) === "2");
  await gm.getByRole("button", { name: "Stress down for Pell Nimblewick" }).click();
  await until("GM cleared a Stress", async () => (await testid(p2, "slots-stress").getAttribute("data-marked")) === "1");
  check(true, "the GM clears one of Pell's Stress from the GM page; Pell's phone follows");
  check((await act(p1.context().request, code, { type: "mark", track: "hp", delta: 1, to: "aaaaaaaaaaaa" }, ids[0], "player")).status === 409, "a player can only mark their own sheet");

  // ---- Fear behind the screen ----
  {
    const before = (await server()).fold.fear;
    await gm.getByRole("button", { name: "Spend a Fear" }).click();
    await until("Fear spent on the TV", async () => Number(await testid(tv, "tv-fear").innerText()) === before - 1);
    check(true, `the GM spends a Fear: ${before} → ${before - 1} on the TV`);
  }
  check((await act(p1.context().request, code, { type: "fear", delta: 1 }, ids[0], "player")).status === 409, "players can't touch the Fear pool");
  check((await act(gmCtx.request, code, { type: "duality", label: "x", mod: 0 }, null)).status === 409, "the GM doesn't roll duality dice");
  {
    const roll = (await server()).events.find((e) => e.kind === "roll" && (e.data as DualityData).system === "duality")!;
    check((await act(gmCtx.request, code, { type: "hide", roll: roll.id, hidden: true }, null)).status === 409, "a duality roll can't be hidden behind the screen");
  }
  const foe = os.adversaries.find((a) => a.thresholds) ?? os.adversaries[0];
  await testid(gm, `adversary-${foe.id}`).getByRole("button", { name: "Roll attack" }).click();
  await until("adversary attack in GM log", async () => (await testid(gm, "gm-roll-log").innerText()).includes(foe.name));
  for (const [i, p] of phones.entries()) check(!(await live(p.context().request, code, ids[i], "player")).raw.includes(foe.name), `phone ${i + 1} never sees the adversary's attack behind the screen`);
  check(!(await live(gmCtx.request, code, null, "table")).raw.includes(foe.name), "nor does the TV");
  await shot(gm, "dh-gm");

  // ---- Phase 6's toys at a Daggerheart table ----
  await p1.getByLabel("Pass the note to").selectOption({ label: "Pell Nimblewick (Bo)" });
  await p1.getByLabel("Your note").fill("NOTE-WREN-TO-PELL you have the rings?");
  await p1.getByRole("button", { name: "Fold and pass" }).click();
  await until("Pell reads the note", async () => (await text(p2)).includes("NOTE-WREN-TO-PELL"));
  check(!(await live(gmCtx.request, code, null)).raw.includes("NOTE-WREN-TO-PELL"), "notes: Pell reads Wren's note; the GM can't");
  await gm.getByLabel("Ring for").selectOption({ label: "Everyone" });
  await gm.getByRole("button", { name: "Ring the bell" }).click();
  for (const p of phones) await until("bell rings", async () => (await testid(p, "bells-rung").innerText()) === "1");
  check(true, "the bell rings on both phones");
  await gm.getByRole("button", { name: "Next act" }).click();
  await until("act card on the TV", async () => (await testid(tv, "tv-act-card").innerText().catch(() => "")).includes(os.acts[0].title));
  check(true, `act cards: the TV raises "${os.acts[0].title}"`);
  await tv.waitForTimeout(3600);
  await shot(tv, "dh-tv-act");
  await p2.getByRole("button", { name: "Listen at the bar" }).click();
  await until("rumors", async () => (await testid(p2, "rumor").count()) === 2);
  check(!(await live(p2.context().request, code, ids[1], "player")).raw.includes('"truth"'), "rumors: Pell hears two, without the truth");
  await gm.locator("li", { hasText: os.notices[0].title }).getByRole("button", { name: "Pin" }).click();
  await until("notice on the TV", async () => (await testid(tv, "tv-notices").innerText()).includes(os.notices[0].title));
  check(true, "town board: the GM pins a notice; the TV shows it");
  check((await gm.locator('[data-testid="spotlight-row"]').first().getByLabel("Experience").count()) === 1, "the spotlight has Daggerheart's beats (an Experience in play)");
  await gm.locator('[data-testid="spotlight-row"]', { hasText: "Pell" }).getByLabel("Experience").click();
  await until("tick saved", async () => (await live(gmCtx.request, code, null)).raw.includes('"beat":"experience"'));
  check(!(await live(p2.context().request, code, ids[1], "player")).raw.includes('"beat"'), "spotlight ticks stay with the GM");
  check((await act(p1.context().request, code, { type: "coin", to: "abcdef123456" }, ids[0], "player")).json.error?.includes("No coins") ?? false, "no inspiration coins: Hope is tracked on the sheet instead");
  for (const [i, p] of phones.entries()) {
    const v = await live(p.context().request, code, ids[i], "player");
    for (const id of ids) check(!v.raw.includes(id), `phone ${i + 1}'s log carries no browser ids`);
  }
  for (const [label, page] of [
    ["the GM page's Daggerheart tools", gm],
    ["the phone's sheet, trackers and tray", p1],
    ["the TV with the Fear pool", tv],
  ] as const) {
    const v = await axe(page);
    if (v.length) console.log(v.join("\n"));
    check(v.length === 0, `axe finds no violations on ${label}`);
  }
  await shot(tv, "dh-tv");

  // ---- Printables: the box, the tapestry, the chronicle ----
  {
    const n = os.cast.length;
    const cards = os.cast.reduce((sum, c) => sum + paginate(cardsFor(c), 9).length, 0);
    const x = extraPages(os);
    const want = 1 + 2 * n + cards + Math.ceil(n / 2) + x.letters + x.acts + x.rumors + x.gazette;
    for (const format of ["Letter", "A4"] as const) {
      const got = await pdfPages(gm, `${SLUG}/box`, format);
      check(got === want, `the Daggerheart box prints on ${format} in ${got} pages (want ${want})`);
    }
    const r = await p1.context().request.get(`${BASE}/${SLUG}/box`, { maxRedirects: 0 });
    check(r.status() >= 300 && r.status() < 400, "players are sent away from the printed box");
  }
  await p1.goto(`${BASE}/${SLUG}/tapestry`, { waitUntil: "networkidle" });
  await until("tapestry panels", async () => (await testid(p1, "tapestry-panel").count()) > 2);
  const tapestry = await testid(p1, "tapestry").innerText();
  check(tapestry.includes("torn from the board") && tapestry.includes(os.acts[0].title), "the tapestry weaves the claims and the act");
  check(!tapestry.includes("NOTE-") && !tapestry.includes(foe.name), "…and never a note's text or a hidden roll");
  {
    const r = await gmCtx.request.get(`${BASE}/chronicle`);
    check(r.ok(), "the chronicle opens");
  }
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error((e as Error).message);
  if (SHOTS) for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(SHOTS, `fail-${i}.png`) }).catch(() => undefined);
  await browser.close();
  process.exit(1);
}
await browser.close();
