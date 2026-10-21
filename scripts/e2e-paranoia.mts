/**
 * e2e-paranoia.mts — a Paranoia mission end to end in headless Chromium: a GM,
 * two phones and the TV on a real local table for the first Paranoia
 * one-shot in content/. LOCAL ONLY, like pnpm e2e:toys: run it against a dev
 * or prod server with a database.
 *
 *   pnpm e2e:paranoia                 — against http://localhost:3004
 *   BASE_URL=http://localhost:3005 pnpm e2e:paranoia
 *   SHOTS=dir pnpm e2e:paranoia       — also save screenshots there
 *
 * It checks first and hardest that the naughty sides stay secret: no player
 * page, print view or cards page carries any society, mutation or secret
 * objective, and the secrets API hands each phone only its own. Then it plays
 * NODE dice from the sheet (checked against the sheet on the server), wounds,
 * Moxie and a clone's death on the phone, Flags and XP from the GM, a treason
 * report the accused and the TV can't read, Friend Computer on every screen,
 * and phase 6's toys at a Paranoia table; and page-checks the box (both
 * sides) on Letter and A4, the tapestry and the chronicle. Exits 1 on the
 * first failure.
 */
import { chromium, type APIRequestContext, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadAll } from "../src/lib/content";
import { paginate } from "../src/systems/dnd5e/cards";
import { cardsFor } from "../src/systems/paranoia/cards";
import { cloneName, sheetLimits } from "../src/systems/paranoia/derive";
import { foldParanoia, nodePool, type NodeData } from "../src/systems/paranoia/live";
import { computerThreshold } from "../src/systems/paranoia/rules";
import { extraPages } from "../src/lib/box";
import type * as paranoia from "../src/systems/paranoia/schema";
import { ensureE2eUsers, signInAs, type E2eWho } from "./e2e-auth.mts";

const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const PLAYER = "x-tearoff-player";


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
    return out.violations.map((v: { impact: string; id: string; help: string; nodes: { target: string[] }[] }) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×, e.g. ${v.nodes[0].target.join(" ")})`);
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

await ensureE2eUsers();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
async function signedIn(who: E2eWho, phone = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  await signInAs(ctx, BASE, who);
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
type Ev = { id: number; kind: string; data: unknown; redacted?: boolean };
async function live(req: APIRequestContext, code: string, playerId: string | null, as?: "table" | "player") {
  const r = await req.get(`${BASE}/api/tables/${code}/live${as ? `?as=${as}` : ""}`, { headers: playerId ? { [PLAYER]: playerId } : {} });
  const json = (await r.json()) as { events: Ev[] };
  return { json, raw: JSON.stringify(json) };
}
async function act(req: APIRequestContext, code: string, action: unknown, playerId: string | null, as?: "player") {
  const r = await req.post(`${BASE}/api/tables/${code}/live${as ? `?as=${as}` : ""}`, { data: { action }, headers: playerId ? { [PLAYER]: playerId } : {} });
  return { status: r.status(), json: (await r.json()) as { error?: string } };
}
const testid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

const os = loadAll().find((x): x is paranoia.OneShotWithCast => x.system === "paranoia");
if (!os) throw new Error("No Paranoia one-shot in content/");
const SLUG = os.slug;
const sheets = sheetLimits(os.cast);
/** Phrases only a naughty side carries, to look for where they mustn't be. */
const secretsOf = (c: paranoia.Character) =>
  [c.naughty.society, c.naughty.mutantPower.text.slice(0, 40), c.naughty.societyObjective?.slice(0, 40), ...c.naughty.objectives.map((o) => o.slice(0, 40)), c.naughty.secret?.slice(0, 40)].filter(
    (x): x is string => Boolean(x),
  );
const pages: Page[] = [];

try {
  const gmCtx = await signedIn("admin");
  const gm = await gmCtx.newPage();
  pages.push(gm);
  gm.on("dialog", (d) => void d.accept());
  await gm.goto(`${BASE}/${SLUG}/gm`, { waitUntil: "networkidle" });
  for (const c of os.cast) check((await testid(gm, `gm-naughty-${c.id}`).innerText()).includes(c.naughty.society), `the GM page shows ${c.name}'s society`);
  await gm.getByRole("button", { name: /^Open a (new )?table$/ }).first().click();
  await until("a table code", async () => /^[A-Z2-9]{5}$/.test((await tableOf(gm, SLUG)) ?? ""));
  const code = await tableOf(gm, SLUG);
  check(true, `GM opened Paranoia table ${code} for ${os.title}`);

  // ---- No naughty side on any player page ----
  const player = await signedIn("player");
  for (const route of [SLUG, ...os.cast.map((c) => `${SLUG}/${c.id}`), `${SLUG}/print`, `${SLUG}/cards`, `${SLUG}/tents`, `${SLUG}/flyer`, `${SLUG}/tv`]) {
    const html = await (await player.request.get(`${BASE}/${route}`)).text();
    const leaks = os.cast.flatMap((c) => secretsOf(c).filter((x) => html.includes(x)));
    check(leaks.length === 0, `/${route} carries no naughty side${leaks.length ? ` (found: ${leaks.join("; ")})` : ""}`);
    check(!html.includes(os.briefing.slice(0, 50)), `/${route} doesn't carry the briefing`);
  }
  await player.close();

  // ---- Two phones accept assignments ----
  const [w1, w2] = os.cast;
  const who = [
    { name: "Ann", c: w1 },
    { name: "Bo", c: w2 },
  ];
  const phones: Page[] = [];
  for (const w of who) {
    const ctx = await signedIn("player", true);
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    pages.push(p);
    await p.goto(`${BASE}/${SLUG}?table=${code}`, { waitUntil: "networkidle" });
    await p.getByLabel("Your name").fill(w.name);
    await p.getByRole("button", { name: "Join table" }).click();
    await p.getByText(`You're ${w.name}`).waitFor();
    await p.waitForLoadState("networkidle");
    const shown = w.c.poster.alias ?? w.c.name;
    await until(`${w.c.name} claimed`, async () => {
      const strip = p.getByRole("button", { name: new RegExp(`: ${shown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
      if (await strip.count()) await strip.click();
      await p.waitForTimeout(800);
      return (await text(p)).toLowerCase().includes("by you");
    });
    phones.push(p);
  }
  const [p1, p2] = phones;
  const ids = await Promise.all(phones.map(playerIdOf));
  check(true, `two players accepted ${w1.name} and ${w2.name}`);

  // ---- The secrets API: each phone gets its own, and only its own ----
  for (const [i, p] of phones.entries()) {
    const r = await p.context().request.get(`${BASE}/api/tables/${code}/secrets?as=player`, { headers: { [PLAYER]: ids[i] } });
    const j = (await r.json()) as { secrets: Record<string, paranoia.Naughty> };
    const mine = who[i].c;
    const other = who[1 - i].c;
    check(Object.keys(j.secrets).join() === mine.id && j.secrets[mine.id].society === mine.naughty.society, `${mine.name}'s phone gets exactly ${mine.name}'s naughty side`);
    const raw = JSON.stringify(j);
    check(secretsOf(other).every((x) => !raw.includes(x)), `…and none of ${other.name}'s`);
  }
  {
    const r = await gmCtx.request.get(`${BASE}/api/tables/${code}/secrets?as=player`);
    check(Object.keys(((await r.json()) as { secrets: object }).secrets).length === 0, "asking as a player without a claim gets no secrets, even in the GM's browser");
    const g = await gmCtx.request.get(`${BASE}/api/tables/${code}/secrets`);
    check(Object.keys(((await g.json()) as { secrets: object }).secrets).length === os.cast.length, "the GM gets every naughty side");
  }

  // ---- Sheets on the phones ----
  for (let i = 0; i < 2; i++) {
    await phones[i].goto(`${BASE}/${SLUG}/${who[i].c.id}`, { waitUntil: "networkidle" });
    await phones[i].getByRole("button", { name: "Let the bell ring here" }).click();
  }
  await p1.getByRole("button", { name: "break seal: read your naughty side" }).click();
  await until("Ann reads her society", async () => (await testid(p1, "my-society").innerText()) === w1.naughty.society);
  check(true, `${w1.name}'s phone breaks the seal on the naughty side: ${w1.naughty.society}`);
  check(!(await text(p2)).includes(w1.naughty.society) || w1.naughty.society === w2.naughty.society, `${w2.name}'s phone doesn't show ${w1.name}'s society`);
  await shot(p1, "pa-phone-sheet");

  const tv = await gmCtx.newPage();
  pages.push(tv);
  await tv.goto(`${BASE}/${SLUG}/tv`, { waitUntil: "networkidle" });

  // ---- NODE dice from the sheet, checked against the sheet on the server ----
  const server = async () => {
    const v = await live(gmCtx.request, code, null);
    return { events: v.json.events, marks: foldParanoia(v.json.events, sheets, os.houseRules).marks };
  };
  const best = (Object.entries(w1.mech.skills) as [paranoia.Skill, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const SKILL_LABEL: Record<string, string> = { alphaComplex: "Alpha Complex" };
  const label = SKILL_LABEL[best] ?? best.charAt(0).toUpperCase() + best.slice(1);
  await p1.getByRole("button", { name: `Roll ${label}`, exact: false }).first().click();
  await until("a NODE roll", async () => (await server()).events.some((e) => e.kind === "roll" && (e.data as NodeData).system === "node"));
  {
    const r = (await server()).events.find((e) => e.kind === "roll")!.data as NodeData;
    const want = nodePool(sheets[w1.id].skills, r.stat, r.skill, 0, 0);
    check(r.node === want && r.dice.length === want && r.threshold === computerThreshold(0), `${w1.name} rolls ${label}: ${want} dice + the Computer die = ${r.successes} successes${r.noticed ? ", and the Computer noticed" : ""}`);
    check(r.successes === [...r.dice, r.computer].filter((v) => v >= 5).length, "…every 5 and 6 counted, on the server");
  }
  await until("phone result", async () => (await testid(p1, "my-roll-words").innerText()).includes(label));
  await until("TV log", async () => (await testid(tv, "tv-roll-log").innerText()).includes(label));
  check(true, "the roll shows on the phone and in the TV's log");
  await p1.getByRole("button", { name: "Gear +2" }).click();
  await p1.getByRole("button", { name: "Roll again" }).click();
  await until("gear roll", async () => ((await server()).events.filter((e) => e.kind === "roll").at(-1)!.data as NodeData).node === nodePool(sheets[w1.id].skills, "violence", null, 0, 0) + 2 || (await server()).events.filter((e) => e.kind === "roll").length >= 2);
  {
    const rolls = (await server()).events.filter((e) => e.kind === "roll").map((e) => e.data as NodeData);
    check(rolls.at(-1)!.node === rolls[0].node + 2, "gear adds dice: the same roll again with +2 gear has two more");
  }

  // ---- Wounds, Moxie, a clone's death ----
  await p2.getByRole("button", { name: "Injured" }).click();
  await until("Bo injured", async () => (await server()).marks[w2.id].wounds === 2);
  await until("TV shows Injured", async () => (await testid(tv, `tv-record-${w2.id}`).innerText()).includes("Injured"));
  // Tapping a lit pip clears down to it: the seventh pip leaves 6.
  await p2.getByRole("button", { name: "Moxie 7" }).click();
  await until("Moxie 6", async () => (await server()).marks[w2.id].moxie === 6);
  check(true, `${w2.name} marks Injured and spends two Moxie on the phone; the TV shows the record`);
  {
    const before = (await server()).events.filter((e) => e.kind === "roll").length;
    await p2.getByRole("button", { name: /^Roll / }).first().click();
    await until("Bo's roll", async () => (await server()).events.filter((e) => e.kind === "roll").length > before);
    const r = (await server()).events.filter((e) => e.kind === "roll").at(-1)!.data as NodeData;
    check(r.node === nodePool(sheets[w2.id].skills, r.stat, r.skill, 0, 2), "…and Injured takes two dice off the next roll");
  }
  await p2.getByRole("button", { name: "Dead" }).click();
  await p2.getByRole("button", { name: "Decant my next clone" }).click();
  await until("clone 2", async () => (await server()).marks[w2.id].clone === w2.mech.clone.number + 1);
  {
    const m = (await server()).marks[w2.id];
    check(m.wounds === 0 && m.moxie === (os.houseRules.cloneMoxie === "full" ? 8 : 4), `${w2.name} dies and decants clone ${m.clone}: unhurt, Moxie ${m.moxie}`);
  }
  await until("TV decanted", async () => (await testid(tv, "tv-flash").innerText().catch(() => "")).includes(cloneName(w2.mech, w2.mech.clone.number + 1)));
  check(true, `the TV announces ${cloneName(w2.mech, w2.mech.clone.number + 1)} decanted`);
  await until("phone shows new clone", async () => (await testid(p2, "my-clone").innerText()) === cloneName(w2.mech, w2.mech.clone.number + 1));

  // ---- Treason reports ----
  await p1.getByLabel("Report a teammate").selectOption({ label: w2.name });
  await p1.getByLabel("The treason you saw").fill("REPORT-SECRET-TEXT hummed a Commie tune");
  await p1.getByRole("button", { name: "Report treason" }).click();
  await until("GM reads the report", async () => (await gm.locator('[data-testid="gm-reports"]').innerText().catch(() => "")).includes("REPORT-SECRET-TEXT"));
  check(true, "the GM reads the report");
  for (const [label2, raw] of [
    [`${w2.name}'s phone (the accused)`, (await live(p2.context().request, code, ids[1], "player")).raw],
    ["the TV", (await live(gmCtx.request, code, null, "table")).raw],
  ] as const) {
    check(!raw.includes("REPORT-SECRET-TEXT") && !raw.includes(`"fromName":"${w1.name}"`), `${label2} never learns what was reported, or by whom`);
  }
  check((await live(p1.context().request, code, ids[0], "player")).raw.includes("REPORT-SECRET-TEXT"), "the accuser can see their own report");
  await until("TV report flash", async () => (await testid(tv, "tv-flash").innerText().catch(() => "")).includes("treason report"));
  check(true, "the TV says a treason report was filed, with no names");
  await gm.getByRole("button", { name: `Raise a Flag on ${w2.name}` }).click();
  await until("Flag raised", async () => (await server()).marks[w2.id].treason === 1);
  await until("TV Flag", async () => (await testid(tv, `tv-record-${w2.id}`).getAttribute("data-treason")) === "1");
  check(true, `the GM raises a Flag on ${w2.name} from the report; the TV shows Greylisted`);
  {
    const before = (await server()).events.filter((e) => e.kind === "roll").length;
    await p2.getByRole("button", { name: /^Roll / }).first().click();
    await until("Bo's flagged roll", async () => (await server()).events.filter((e) => e.kind === "roll").length > before);
    check(((await server()).events.filter((e) => e.kind === "roll").at(-1)!.data as NodeData).threshold === 5, "one Flag: the Computer now notices on a 5 or 6");
  }
  check((await act(p1.context().request, code, { type: "pmark", track: "treason", delta: -1 }, ids[0], "player")).status === 409, "players can't lower their own Flags");
  check((await act(p1.context().request, code, { type: "pmark", track: "xp", delta: 500 }, ids[0], "player")).status === 409, "…or give themselves XP Points");
  check((await act(gmCtx.request, code, { type: "node", label: "x", stat: "violence" }, null)).status === 409, "the GM never rolls");
  await gm.getByRole("button", { name: `XP up for ${w1.name}` }).click();
  await until("XP", async () => (await server()).marks[w1.id].xp === w1.mech.xp + 50);
  check(true, `the GM awards ${w1.name} 50 XP Points`);

  // ---- Friend Computer says ----
  await gm.getByRole("button", { name: /^Say (it|again): / }).first().click();
  for (const [label2, p] of [
    ["phone 1", p1],
    ["phone 2", p2],
  ] as const)
    await until(`${label2} hears the Computer`, async () => (await testid(p, "phone-computer").innerText()).includes(os.briefing.slice(0, 30)));
  await until("TV Computer", async () => (await testid(tv, "tv-computer").innerText()).includes(os.briefing.slice(0, 30)));
  for (const p of phones) await until("chime", async () => Number(await testid(p, "bells-rung").innerText()) >= 1);
  check(true, "Friend Computer's briefing reaches both phones (with the chime) and the TV");
  await gm.getByLabel("Something for Friend Computer to say").fill("CITIZENS, THE TRANSBOT IS LATE. THIS IS YOUR FAULT.");
  await gm.getByRole("button", { name: "Broadcast" }).click();
  await until("TV free line", async () => (await testid(tv, "tv-computer").innerText()).includes("TRANSBOT IS LATE"));
  check((await act(p1.context().request, code, { type: "computer", text: "I am the Computer now" }, ids[0], "player")).status === 409, "only the GM speaks as Friend Computer");
  await tv.waitForTimeout(1500);
  await shot(tv, "pa-tv");
  await shot(gm, "pa-gm");

  // ---- Phase 6's toys at a Paranoia table ----
  await p1.getByLabel("Pass the note to").selectOption({ index: 1 });
  await p1.getByLabel("Your note").fill("NOTE-PA-SECRET meet at the vending machine");
  await p1.getByRole("button", { name: "Fold and pass" }).click();
  await until("note read", async () => (await text(p2)).includes("NOTE-PA-SECRET"));
  check(!(await live(gmCtx.request, code, null, "table")).raw.includes("NOTE-PA-SECRET"), "notes: the TV sees a note pass, not its text");
  await gm.getByRole("button", { name: "Next act" }).click();
  await until("act card", async () => (await testid(tv, "tv-act-card").innerText().catch(() => "")).includes(os.acts[0].title));
  check(true, `act cards: "${os.acts[0].title}" on the TV`);
  if (os.rumors.length >= 2) {
    await p2.getByRole("button", { name: "Listen at the bar" }).click();
    await until("rumors", async () => (await testid(p2, "rumor").count()) === 2);
    check(!(await live(p2.context().request, code, ids[1], "player")).raw.includes('"truth"'), "rumors: drawn without the truth");
  }
  if (os.notices.length) {
    await gm.locator("li", { hasText: os.notices[0].title }).getByRole("button", { name: "Pin" }).click();
    await until("notice", async () => (await testid(tv, "tv-notices").innerText()).includes(os.notices[0].title));
    check(true, "the town board: a notice pinned on the TV");
  }
  check((await gm.locator('[data-testid="spotlight-row"]').first().getByLabel("Treason Button").count()) === 1, "the spotlight has Paranoia's beats");
  for (const [i, p] of phones.entries()) {
    const v = await live(p.context().request, code, ids[i], "player");
    for (const id of ids) check(!v.raw.includes(id), `phone ${i + 1}'s log carries no browser ids`);
  }
  for (const [label2, page] of [
    ["the GM page's Paranoia tools", gm],
    ["the phone's sheet, record and tray", p1],
    ["the TV with Friend Computer", tv],
  ] as const) {
    const v = await axe(page);
    if (v.length) console.log(v.join("\n"));
    check(v.length === 0, `axe finds no violations on ${label2}`);
  }

  // ---- The box: both sides, for the GM only ----
  {
    const n = os.cast.length;
    const cards = os.cast.reduce((sum, c) => sum + paginate(cardsFor(c, c.naughty), 9).length, 0);
    const x = extraPages(os);
    const want = 1 + 2 * n + cards + Math.ceil(n / 2) + x.letters + x.acts + x.rumors + x.gazette;
    for (const format of ["Letter", "A4"] as const) {
      const got = await pdfPages(gm, `${SLUG}/box`, format);
      check(got === want, `the Paranoia box prints on ${format} in ${got} pages (want ${want}: both sides of every sheet and the naughty cards)`);
    }
    const r = await p1.context().request.get(`${BASE}/${SLUG}/box`, { maxRedirects: 0 });
    check(r.status() >= 300 && r.status() < 400, "players are sent away from the box (it carries every naughty side)");
  }
  // "load", not "networkidle": with the database store the pages are ISR, and Next quietly re-fetches
  // stale page data in the background, which never counts as idle. The panels are waited for below.
  await p1.goto(`${BASE}/${SLUG}/tapestry`, { waitUntil: "load" });
  await until("tapestry", async () => (await testid(p1, "tapestry-panel").count()) > 2);
  const tapestry = await testid(p1, "tapestry").innerText();
  check(tapestry.includes("is terminated"), "the tapestry has a panel for the clone terminated");
  check(!tapestry.includes("REPORT-SECRET-TEXT") && !tapestry.includes("NOTE-PA-SECRET"), "…and no report or note text");
  check((await gmCtx.request.get(`${BASE}/chronicle`)).ok(), "the chronicle opens");
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error((e as Error).message);
  if (SHOTS) for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(SHOTS, `fail-${i}.png`) }).catch(() => undefined);
  await browser.close();
  process.exit(1);
}
await browser.close();
