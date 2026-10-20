/**
 * e2e-tencandles.mts — play a whole Ten Candles night in headless Chromium:
 * a GM and three phones (fake microphones) on a local table. LOCAL ONLY, like
 * pnpm pdf: run it against a dev or prod server with a database.
 *
 *   pnpm e2e:candles                  — against http://localhost:3004
 *   SHOTS=dir pnpm e2e:candles        — also save screenshots there
 *
 * It opens a table, seats three players, makes characters (one takes a
 * pre-made), records last words (two by voice, one written), plays a scene,
 * states truths round the table, darkens candles down to the Last Stand,
 * rolls until everyone is dead, and checks the end. Along the way it checks
 * that nobody sees what they shouldn't: other players' cards, the module, or
 * other players' recordings. Exits 1 on the first failure.
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SLUG = "lights-out-at-marrowby";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const N = 3;

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
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

async function signedIn(password: string, phone = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    permissions: ["microphone"],
  });
  const r = await ctx.request.post(`${BASE}/api/login`, { data: { password } });
  if (!r.ok()) throw new Error(`Login failed (${r.status()}) — is the server running at ${BASE}?`);
  return ctx;
}

const pages: Page[] = [];

try {
  // ---- The GM opens a table ----
  const gmCtx = await signedIn(env("GM_PASSWORD"));
  const gm = await gmCtx.newPage();
  pages.push(gm);
  gm.on("dialog", (d) => void d.accept());
  await gm.goto(`${BASE}/${SLUG}/gm`, { waitUntil: "networkidle" });
  await gm.getByRole("button", { name: /^Open a (new )?table$/ }).first().click();
  await gm.getByText(/^Seat the table$/).waitFor();
  const code = await gm.evaluate((slug) => JSON.parse(localStorage.getItem(`tearoff:table:${slug}`) ?? "null"), SLUG);
  check(/^[A-Z2-9]{5}$/.test(code), `GM opened table ${code}`);
  // Settings change on the server's answer, so click and wait for it to stick.
  const keep = gm.getByLabel(/Keep recordings at the table/);
  await keep.click();
  for (let i = 0; i < 20 && !(await keep.isChecked()); i++) await gm.waitForTimeout(150);
  check(await keep.isChecked(), "GM keeps recordings at this table");

  // ---- Three phones join and sit ----
  const phones: Page[] = [];
  for (let i = 0; i < N; i++) {
    const ctx = await signedIn(env("APP_PASSWORD"), true);
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    pages.push(p);
    await p.goto(`${BASE}/${SLUG}/play?table=${code}`, { waitUntil: "networkidle" });
    await p.getByLabel("Your name").fill(`Player${i}`);
    await p.getByRole("button", { name: "Join table" }).click();
    await p.getByRole("button", { name: "Sit at the table" }).click();
    await p.getByText(`Seat ${i + 1} of`).waitFor();
    phones.push(p);
  }
  // Player 0 takes a pre-made poster.
  await phones[0].getByRole("button", { name: /Take this one|TEAR TO CLAIM/i }).first().click();
  await phones[0].getByText(/You've taken/).waitFor();
  check(true, "three players seated; one took a pre-made");
  const ids = await Promise.all(phones.map((p) => p.evaluate(() => JSON.parse(localStorage.getItem("tearoff:player")!).id as string)));

  // ---- Character creation ----
  await gm.getByRole("button", { name: "Begin: write the traits" }).click();
  for (let i = 0; i < N; i++) {
    const p = phones[i];
    await p.getByLabel(/^A Virtue/).fill(`VIRTUE-${i}`);
    await p.getByLabel(/^A Vice/).fill(`VICE-${i}`);
    await p.getByRole("button", { name: "Pass them on" }).click();
    await p.getByText(/^(Done\.|Everyone's done)/).waitFor();
  }
  const next = async () => {
    await gm.getByRole("button", { name: /^(Next step|Light the way)/ }).click();
    await gm.waitForTimeout(400);
  };
  await next(); // → module
  await phones[1].getByText("The GM sets the scene").waitFor();
  await next(); // → concept
  const intro = "It has been dark for nineteen days";
  await phones[2].getByText(intro).first().waitFor().catch(() => undefined);
  for (let i = 0; i < N; i++) {
    const p = phones[i];
    await p.getByText(`VIRTUE-${(i + 1) % N}`).waitFor(); // Virtues come from the left (passed right)
    await p.getByText(`VICE-${(i - 1 + N) % N}`).waitFor();
    if (i > 0) await p.getByLabel("Name", { exact: true }).fill(`Char${i}`);
    await p.getByLabel("Who they are, in a sentence").fill(`CONCEPT-${i} a person in the dark`);
    await p.getByLabel("What they look like tonight").fill(`a wet coat ${i}`);
    await p.getByRole("button", { name: /Tell the table|Change it/ }).click();
    await p.getByText(/^(Done\.|Everyone's done)/).waitFor();
  }
  check((await phones[0].getByLabel("Name", { exact: true }).inputValue()) === "Ida Kell", "concepts written (player 0's filled in from the pre-made)");
  await next(); // → moment
  for (let i = 0; i < N; i++) {
    const p = phones[i];
    await p.getByRole("textbox", { name: "Your Moment" }).fill(`I will find hope MOMENT-${i}`);
    await p.getByRole("button", { name: "Write it" }).click();
    await p.getByText(/^(Done\.|Everyone's done)/).waitFor();
  }
  await next(); // → brink
  for (let i = 0; i < N; i++) {
    const p = phones[i];
    const box = p.getByRole("textbox", { name: /^A Brink for/ });
    const forThem = (await box.getAttribute("aria-label"))?.includes("Them");
    check(forThem === (i === N - 1), `seat ${i + 1} writes a Brink for ${forThem ? "Them" : "their left"}`);
    await box.fill(`I have seen you BRINK-${i}`);
    await p.getByRole("button", { name: "Write it" }).click();
    await p.getByText(/^(Done\.|Everyone's done)/).waitFor();
  }
  await gm.getByLabel(/Your Brink for/).fill("They have seen you BRINK-GM");
  await gm.getByRole("button", { name: "Write it" }).click();
  await gm.getByText("written", { exact: true }).waitFor();
  await next(); // → stack
  await shot(phones[1], "phone-stack");
  for (const p of phones) {
    await p.getByRole("button", { name: "That's my stack" }).click();
    await p.getByText(/^(Done\.|Everyone's done)/).waitFor();
  }
  await next(); // → record
  for (let i = 0; i < N; i++) {
    const p = phones[i];
    if (i < 2) {
      await p.getByRole("button", { name: /Record/ }).click();
      await p.waitForTimeout(1500);
      await p.getByRole("button", { name: /Stop/ }).click();
      await p.locator("audio").waitFor();
    } else {
      await p.getByRole("button", { name: "Write it instead" }).click();
      await p.getByLabel("Your last words").fill("LASTWORDS-2 tell my sister I kept the lamp lit");
    }
    await p.getByRole("button", { name: "Give it to the table" }).click();
    await p.getByText("With the table").waitFor();
  }
  check(true, "two voice recordings and one written message given to the table");
  await shot(gm, "gm-creation");
  await next(); // → scene 1
  await phones[0].getByRole("button", { name: /^Roll 10 dice/ }).waitFor();
  check(true, "ten candles lit; scene 1 begins with 10 dice");

  // ---- Who can see what ----
  const view = async (i: number) =>
    JSON.stringify(
      await (
        await phones[i].context().request.get(`${BASE}/api/tables/${code}/game?as=player`, { headers: { "x-tearoff-player": ids[i] } })
      ).json(),
    );
  for (let i = 0; i < N; i++) {
    const v = await view(i);
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      check(!v.includes(`MOMENT-${j}`), `player ${i} can't read player ${j}'s Moment`);
    }
    check(v.includes(`MOMENT-${i}`), `player ${i} reads their own Moment`);
    check(!v.includes("BRINK-GM") || i === 0, `only seat 1 (and the GM) reads the GM's Brink (player ${i})`);
    check(!v.includes(`BRINK-${N - 1}`) || i === N - 1, `the Brink for Them stays with its writer (player ${i})`);
    for (const id of ids) check(!v.includes(id), `player ${i}'s view carries no player ids`);
  }
  const tvCtx = gmCtx;
  const tv = await tvCtx.newPage();
  await tv.goto(`${BASE}/${SLUG}/tv`, { waitUntil: "networkidle" });
  await tv.getByText("Scene 1").waitFor();
  const tvText = await tv.evaluate(() => document.body.innerText);
  check(!/MOMENT-|BRINK-|VIRTUE-|VICE-|LASTWORDS/.test(tvText), "the TV shows no private cards, even in the GM's browser");
  const peek = await phones[1].context().request.get(`${BASE}/api/tables/${code}/recordings?seat=0&as=player`, {
    headers: { "x-tearoff-player": ids[1] },
  });
  check(peek.status() === 404, "a player can't fetch another player's recording mid-game");
  const gmHear = await gmCtx.request.get(`${BASE}/api/tables/${code}/recordings?seat=0`);
  check(gmHear.ok() && (gmHear.headers()["content-type"] ?? "").startsWith("audio/"), "the GM can hear a kept recording");
  const job = await (await phones[0].context().request.get(`${BASE}/${SLUG}`)).text();
  check(!job.includes("Gallows Hill tunnel") && !job.includes("Ida marks the level"), "the job page carries no module text");

  // ---- A roll ----
  await phones[0].getByRole("button", { name: /^Roll 10 dice/ }).click();
  await phones[0].getByRole("button", { name: "Settle it" }).click();
  // A roll with no 6s goes straight to the truths, with the roll shown above them.
  await phones[0].getByText(/succeeded|failed/).first().waitFor();
  await shot(phones[0], "phone-after-roll");

  // If that roll failed, a candle is already out; else the GM blows one out (a real candle went out).
  const inTruths = async () => (await gm.getByText(/^Truths before scene/).count()) > 0;
  if (!(await inTruths())) await gm.getByRole("button", { name: /^Candle 10, lit/ }).click();
  await gm.getByText(/^Truths before scene 2/).waitFor();
  check(true, "a candle went dark and the scene ended");

  // ---- Truths round the table ----
  const gmGame = async () => (await (await gmCtx.request.get(`${BASE}/api/tables/${code}/game`)).json()).game;
  for (let k = 0; k < 20; k++) {
    const speaker = (await gmGame()).truths?.speaker ?? null;
    if (speaker === null) break;
    if (speaker === "gm") {
      await gm.locator("label[for=gm-truth]", { hasText: "Your truth" }).waitFor();
      await gm.locator("#gm-truth").fill(`The GM's truth ${k}`);
      await gm.getByRole("button", { name: "State it" }).click();
    } else {
      const p = phones[speaker];
      await p.locator("#truth").fill(`A truth from player ${speaker}, number ${k}`);
      await p.getByRole("button", { name: "State it" }).click();
    }
    for (let w = 0; w < 30 && (await gmGame()).truths?.entries.length === k; w++) await gm.waitForTimeout(100);
  }
  await shot(tv, "tv-truths");
  await phones[2].getByRole("button", { name: "And we are alive" }).click();
  await gm.getByText(/^Scene 2$/).waitFor();
  check(true, "truths stated in turn, phones and GM, then 'and we are alive'");

  // ---- Down to the last candle ----
  await gm.getByRole("button", { name: /^Candle 9, lit/ }).click();
  for (let c = 8; c >= 2; c--) {
    await gm.getByRole("button", { name: new RegExp(`^Candle ${c}, lit`) }).click();
    await gm.waitForTimeout(250);
  }
  await phones[1].getByRole("button", { name: "And we are alive" }).click();
  await gm.getByText("The Last Stand", { exact: true }).waitFor();
  check(true, "one candle left: the Last Stand");

  // ---- The Last Stand: roll until everyone is gone ----
  for (let k = 0; k < 60; k++) {
    if ((await gm.getByText("The dark", { exact: true }).filter({ visible: true }).count()) > 0) break;
    let rolled = false;
    for (const p of phones) {
      // One die, or none if a 1 has already been set aside this scene (then only Hope can save you).
      const roll = p.getByRole("button", { name: /^Roll [01] di/ });
      if (await roll.count()) {
        await roll.click();
        await p.getByRole("button", { name: "Settle it" }).click();
        await p.waitForTimeout(300);
        rolled = true;
      }
    }
    // Phones catch up on their next poll (every 2 s); give them a moment before trying again.
    if (!rolled) await gm.waitForTimeout(500);
  }
  await gm.getByText("The dark", { exact: true }).filter({ visible: true }).waitFor();
  check(true, "everyone died; the game ended in the dark");
  await gm.waitForTimeout(800);
  await shot(gm, "gm-ended");

  // ---- The end: last words ----
  const list = await (await phones[1].context().request.get(`${BASE}/api/tables/${code}/recordings?as=player`, { headers: { "x-tearoff-player": ids[1] } })).json();
  check(list.recordings.length === 3, "at the end every player can hear everyone's last words");
  check(list.recordings.some((r: { text?: string }) => r.text?.includes("LASTWORDS-2")), "the written message is there");
  const late = await phones[1].context().request.get(`${BASE}/api/tables/${code}/recordings?seat=0&as=player`, { headers: { "x-tearoff-player": ids[1] } });
  check(late.ok(), "…and can play another player's recording now");
  await phones[1].getByRole("button", { name: /Play/ }).first().click();
  await phones[1].locator("audio").first().waitFor();
  await shot(phones[1], "phone-ended");
  await tv.waitForTimeout(1600);
  await shot(tv, "tv-ended");

  // ---- The kit ----
  const kit = await gmCtx.newPage();
  await kit.goto(`${BASE}/${SLUG}/kit`);
  await kit.getByText("Candles & scenes").waitFor();
  check((await kit.locator("[aria-label^='Index cards']").count()) >= 4, "the table kit prints index cards");
  const playerKit = await phones[0].context().request.get(`${BASE}/${SLUG}/kit`, { maxRedirects: 0 });
  check(playerKit.status() >= 300 && playerKit.status() < 400, "players are sent away from the GM's kit");

  console.log("\nTen Candles end to end: all checks passed.");
  await browser.close();
} catch (e) {
  console.error((e as Error).message);
  // What each screen showed when it went wrong.
  for (const [i, p] of pages.entries()) {
    const text = await p.evaluate(() => document.querySelector("main")?.textContent ?? "").catch(() => "");
    console.error(`
--- page ${i}: ${p.url()}
${text.slice(0, 1500)}`);
  }
  await browser.close();
  process.exit(1);
}
