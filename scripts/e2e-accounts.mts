/**
 * e2e-accounts.mts — accounts and the front door (phase 10) end to end, in
 * headless Chromium against a running server and the local database.
 * LOCAL ONLY. Works with either store (files or TEAROFF_STORE=db), on
 * `pnpm dev` or a production build.
 *
 *   pnpm e2e:accounts               — against http://localhost:3004
 *   SHOTS=dir pnpm e2e:accounts     — also save screenshots there
 *
 * It makes the first admin with `pnpm admin:create` (piping the password),
 * signs in through the login page, makes an invite on /admin/people and signs
 * a second person up through it (/join/<code>), then checks a used, an
 * expired and a taken-down invite are refused. It trips the sign-in rate
 * limit, makes a reset link and uses it (the old session ends, the link
 * won't work twice), keeps a plain member out of /admin, the GM pages and
 * every admin API, grants the author badge and checks the author can't
 * reach someone else's one-shot through the builder or its API but can make
 * and delete their own, closes an account, and checks the public landing
 * page (HTML and `_next/data` JSON) carries no secrets and no Daggerheart or
 * Paranoia. The people it made are deleted at the end. Exits 1 on the first
 * failure.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { loadOneShot, publishedSlugs } from "../src/lib/content";
import { localDb, signIn } from "./e2e-auth.mts";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const RUN = Date.now().toString(36).slice(-5);
const BOSS = { username: `boss-${RUN}`, password: "the boss's long password" };
const WREN = { username: `Wren-${RUN}`, password: "wren's first password", displayName: "Wren Ashby", pronouns: "she/her" };
const WREN_NEW = "wren's second password";
const MOSS = { username: `moss-${RUN}`, password: "moss's long password", displayName: "Moss" };
const LEGACY = "the-drowned-bell";
const OWN = `wrens-night-${RUN}`;

function check(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok   ${what}`);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const db = localDb();
const browser = await chromium.launch();
const contexts: BrowserContext[] = [];
async function context(phone = false): Promise<BrowserContext> {
  const c = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  contexts.push(c);
  return c;
}
const whoami = async (c: BrowserContext) =>
  (await (await c.request.get(`${BASE}/api/whoami`)).json()) as { user: { username: string; role: string; author: boolean } | null; signedOut: boolean };
const pathOf = (page: Page) => new URL(page.url()).pathname;

/** Signs in through the login page, as a person would. */
async function loginUi(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
}

try {
  // ======================= The first admin, from the CLI =======================
  const cli = spawnSync(`pnpm -s admin:create ${BOSS.username} --name "The Boss"`, {
    cwd: ROOT,
    input: `${BOSS.password}\n`,
    shell: true,
    encoding: "utf8",
  });
  check(cli.status === 0 && /Made admin/.test(cli.stdout), `pnpm admin:create makes the first admin (${cli.stdout.trim().split("\n").pop()}${cli.stderr.trim()})`);
  check(!cli.stdout.includes(BOSS.password), "…without echoing the password");

  const boss = await context();
  const bossPage = await boss.newPage();
  await loginUi(bossPage, BOSS.username.toUpperCase(), BOSS.password);
  await bossPage.waitForURL(/\/board$/);
  check((await whoami(boss)).user?.role === "admin", "the admin signs in on the login page (username in any case) and lands on the board");

  // ======================= An invite, and a second person =======================
  await bossPage.goto(`${BASE}/admin/people`);
  await bossPage.getByLabel("For whom (a note)").fill("Wren, Thursday");
  await bossPage.getByLabel("Days").fill("1");
  await bossPage.getByRole("button", { name: "Make a link" }).click();
  const inviteLink = await bossPage.getByTestId("new-invite").inputValue();
  const code = inviteLink.split("/join/")[1];
  check(/^[\w-]{12,}$/.test(code ?? ""), `the people page makes an invite link (${inviteLink})`);
  await shot(bossPage, "01-people-invite");

  const anon = await context();
  const unfurl = await (await anon.request.get(`${BASE}/join/${code}`)).text();
  check(/property="og:image" content="http[^"]+\/api\/og\?card=invite"/.test(unfurl), "the invite link carries a poster card for Discord");
  const og = await anon.request.get(`${BASE}/api/og?card=invite`);
  check(og.status() === 200 && og.headers()["content-type"] === "image/png", "…and its image draws for anyone (image/png)");

  const wren = await context(true);
  const wrenPage = await wren.newPage();
  await wrenPage.goto(inviteLink);
  check((await wrenPage.locator("h1").innerText()).includes("Put your name on the board"), "the invite opens a poster-styled sign-up");
  await shot(wrenPage, "02-join");
  await wrenPage.getByLabel("Username").fill(WREN.username);
  await wrenPage.getByLabel("What the table calls you").fill(WREN.displayName);
  await wrenPage.getByLabel("Pronouns (optional)").fill(WREN.pronouns);
  await wrenPage.getByLabel("Password", { exact: true }).fill(WREN.password);
  await wrenPage.getByLabel("Password again").fill(WREN.password);
  await wrenPage.getByRole("button", { name: "Sign the board" }).click();
  await wrenPage.waitForURL(/\/board$/);
  check((await whoami(wren)).user?.username === WREN.username, "Wren signs up through it and is signed in on the board");
  const wrenRow = await db.user.findUnique({ where: { usernameLower: WREN.username.toLowerCase() } });
  check(wrenRow?.role === "member" && !wrenRow.author && wrenRow.pronouns === WREN.pronouns, "…as a member, with her pronouns");

  // ======================= Used, expired and taken-down invites =======================
  const stranger = await (await context()).newPage();
  await stranger.goto(inviteLink);
  check((await stranger.locator("main").innerText()).includes("used up"), "the used invite says it's used up");
  const again = await anon.request.post(`${BASE}/api/join`, { data: { code, username: `late-${RUN}`, password: "a long enough password", displayName: "Late" } });
  check(again.status() === 410, `…and the API refuses it (${again.status()})`);
  check(!(await db.user.findUnique({ where: { usernameLower: `late-${RUN}` } })), "…and nobody new got in");

  const expiring = (await (await boss.request.post(`${BASE}/api/invites`, { data: { note: "to expire", days: 1 } })).json()) as { code: string };
  await db.invite.update({ where: { code: expiring.code }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await stranger.goto(`${BASE}/join/${expiring.code}`);
  check((await stranger.locator("main").innerText()).includes("expired"), "an expired invite says it's expired");
  const late = await anon.request.post(`${BASE}/api/join`, { data: { code: expiring.code, username: `late-${RUN}`, password: "a long enough password", displayName: "Late" } });
  check(late.status() === 410, "…and the API refuses it");

  await bossPage.getByLabel("For whom (a note)").fill("to take down");
  await bossPage.getByRole("button", { name: "Make a link" }).click();
  await bossPage.waitForFunction((prev) => (document.querySelector("[data-testid=new-invite]") as HTMLInputElement | null)?.value !== prev, inviteLink);
  const downCode = (await bossPage.getByTestId("new-invite").inputValue()).split("/join/")[1];
  await bossPage.getByRole("button", { name: "Take down the invite to take down" }).click();
  await bossPage.locator(`tr[data-code="${downCode}"]`).getByText("taken down").waitFor();
  await stranger.goto(`${BASE}/join/${downCode}`);
  check((await stranger.locator("main").innerText()).includes("taken down"), "a taken-down invite says so");

  // A second, multi-use invite for Moss, who stays a plain member.
  const multi = (await (await boss.request.post(`${BASE}/api/invites`, { data: { note: "Moss", maxUses: 3, days: 2 } })).json()) as { code: string };
  const mossJoin = await anon.request.post(`${BASE}/api/join`, { data: { code: multi.code, ...MOSS } });
  check(mossJoin.status() === 201, "Moss joins with a multi-use invite");
  const taken = await anon.request.post(`${BASE}/api/join`, { data: { code: multi.code, ...MOSS, username: MOSS.username.toUpperCase() } });
  check(taken.status() === 409, "…and the same name in other letters is taken");
  const moss = await context();
  check((await signIn(moss, BASE, MOSS.username, MOSS.password)).ok, "Moss signs in");

  // ======================= The rate limit =======================
  const door = await context();
  for (let i = 0; i < 5; i++) await signIn(door, BASE, WREN.username, `wrong guess number ${i}`);
  const shut = await signIn(door, BASE, WREN.username, WREN.password);
  check(!shut.ok && shut.code === "rate_limited", `after five wrong passwords even the right one is refused (${shut.code})`);
  const doorPage = await door.newPage();
  await loginUi(doorPage, WREN.username, WREN.password);
  // Scoped to the page: Next's route announcer is an alert too.
  const alert = doorPage.locator("main").getByRole("alert");
  await alert.waitFor();
  check((await alert.innerText()).includes("Too many"), `…and the login page says to wait ("${(await alert.innerText()).slice(0, 60)}")`);
  await shot(doorPage, "03-rate-limited");
  check((await whoami(wren)).user?.username === WREN.username, "…while Wren's own session carries on");
  // The window is 15 minutes; forgive the slips so the run can go on.
  await db.authAttempt.deleteMany({ where: { key: { startsWith: "login:" } } });

  // ======================= A reset link =======================
  await bossPage.goto(`${BASE}/admin/people`);
  await bossPage.getByRole("button", { name: `Reset link for ${WREN.username}` }).click();
  const resetLink = await bossPage.getByTestId("reset-link").inputValue();
  check(/\/reset\/[\w-]{30,}$/.test(resetLink), "the admin makes a one-time reset link on the people page");
  check(!JSON.stringify(await db.passwordReset.findMany()).includes(resetLink.split("/reset/")[1]), "…and only its hash is kept");

  const wren2 = await context(true);
  const resetPage = await wren2.newPage();
  await resetPage.goto(resetLink);
  check((await resetPage.locator("main").innerText()).includes(WREN.username), "the reset link names whose password it sets");
  await resetPage.getByLabel("New password", { exact: true }).fill(WREN_NEW);
  await resetPage.getByLabel("New password again").fill(WREN_NEW);
  await resetPage.getByRole("button", { name: "Set it" }).click();
  await resetPage.waitForURL(/\/board$/);
  check((await whoami(wren2)).user?.username === WREN.username, "Wren sets a new password with it and is signed in");
  const old = await whoami(wren);
  check(!old.user && old.signedOut, "…and her old session has ended");
  await wrenPage.goto(`${BASE}/settings`);
  check(pathOf(wrenPage) === "/login", "…so the old phone is sent back to the door");
  check(!(await signIn(await context(), BASE, WREN.username, WREN.password)).ok, "the old password no longer works");
  await stranger.goto(resetLink);
  check((await stranger.locator("main").innerText()).includes("already been used"), "the reset link won't work twice");

  // ======================= A member can't reach /admin =======================
  const mossPage = await moss.newPage();
  for (const [url, need] of [
    ["/admin", "author"],
    ["/admin/spells", "author"],
    [`/admin/${LEGACY}`, "author"],
    ["/admin/people", "admin"],
    [`/${LEGACY}/gm`, "admin"],
    [`/${LEGACY}/box`, "admin"],
  ] as const) {
    await mossPage.goto(`${BASE}${url}`);
    const u = new URL(mossPage.url());
    check(u.pathname === "/login" && u.searchParams.get("need") === need, `a member opening ${url} is sent to the door (it's for ${need}s)`);
  }
  await shot(mossPage, "04-member-refused");
  for (const [method, url, data] of [
    ["GET", "/api/admin/oneshots", undefined],
    ["POST", "/api/admin/oneshots", { action: "create", system: "tencandles", title: "Sneaky" }],
    ["PUT", `/api/admin/oneshots/${LEGACY}`, { doc: { oneshot: {}, cast: [], variants: [] } }],
    ["POST", `/api/admin/oneshots/${LEGACY}/publish`, undefined],
    ["GET", "/api/admin/people", undefined],
    ["POST", "/api/admin/people", { action: "access", userId: wrenRow!.id, role: "admin" }],
    ["POST", "/api/invites", { days: 1 }],
    ["PUT", "/api/admin/spells", { name: "Guidance", info: {} }],
    ["POST", "/api/admin/survivors", { records: [] }],
    ["POST", "/api/tables", { oneshot: LEGACY }],
  ] as const) {
    const r = await moss.request.fetch(`${BASE}${url}`, { method, data });
    check(r.status() === 403, `a member gets 403 from ${method} ${url}`);
  }
  const nobody = await context();
  const r401 = await nobody.request.get(`${BASE}/api/admin/oneshots`, { maxRedirects: 0 });
  check(r401.status() === 401, "someone not signed in gets 401 from the admin API");

  // ======================= The author badge =======================
  await bossPage.goto(`${BASE}/admin/people`);
  // The box ticks once the server has said yes.
  const authorBox = bossPage.locator(`tr[data-user="${WREN.username}"]`).getByLabel("author");
  await authorBox.click();
  await bossPage.locator(`tr[data-user="${WREN.username}"] input:checked`).first().waitFor();
  check((await db.user.findUnique({ where: { id: wrenRow!.id } }))?.author === true, "the admin grants Wren the author badge");

  const authorPage = await wren2.newPage();
  await authorPage.goto(`${BASE}/admin`);
  check(pathOf(authorPage) === "/admin", "Wren can open the builder now");
  check(!(await authorPage.locator("main").innerText()).includes("The Drowned Bell"), "…and sees nobody else's one-shots in it");
  const theirs = await authorPage.goto(`${BASE}/admin/${LEGACY}`);
  check(theirs?.status() === 404, `someone else's one-shot is a 404 in the builder UI (${theirs?.status()})`);
  const preview = await authorPage.goto(`${BASE}/admin/preview/${LEGACY}`);
  check(preview?.status() === 404, "…and in its preview");
  const before = await (await boss.request.get(`${BASE}/api/admin/oneshots/${LEGACY}`)).text();
  for (const [method, url, data, status] of [
    ["GET", `/api/admin/oneshots/${LEGACY}`, undefined, 404],
    ["PUT", `/api/admin/oneshots/${LEGACY}`, { doc: { oneshot: { title: "Stolen" }, cast: [], variants: [] } }, 403],
    ["DELETE", `/api/admin/oneshots/${LEGACY}`, { confirm: LEGACY }, 403],
    ["POST", `/api/admin/oneshots/${LEGACY}/publish`, undefined, 403],
    ["POST", `/api/admin/oneshots/${LEGACY}/unpublish`, undefined, 403],
    ["POST", `/api/admin/oneshots/${LEGACY}/duplicate`, { to: `stolen-${RUN}` }, 403],
    ["POST", `/api/admin/oneshots/${LEGACY}/owner`, { ownerId: wrenRow!.id }, 403],
    ["GET", `/api/admin/oneshots/${LEGACY}/export`, undefined, 404],
  ] as const) {
    const r = await wren2.request.fetch(`${BASE}${url}`, { method, data });
    check(r.status() === status, `an author gets ${status} from ${method} ${url} (someone else's)`);
  }
  check((await (await boss.request.get(`${BASE}/api/admin/oneshots/${LEGACY}`)).text()) === before, "…and it's unchanged");
  check((await boss.request.get(`${BASE}/api/admin/oneshots/stolen-${RUN}`)).status() === 404, "…and no copy was made");

  const made = await wren2.request.post(`${BASE}/api/admin/oneshots`, { data: { action: "create", system: "tencandles", title: `Wren's Night ${RUN}`, slug: OWN } });
  check(made.status() === 201, "the author makes a one-shot of her own");
  await authorPage.goto(`${BASE}/admin`);
  check((await authorPage.locator("main").innerText()).includes(`Wren's Night ${RUN}`), "…it's in her builder list");
  const ownPage = await authorPage.goto(`${BASE}/admin/${OWN}`);
  check(ownPage?.status() === 200, "…and opens in the builder");
  await shot(authorPage, "05-author-builder");
  const adminList = (await (await boss.request.get(`${BASE}/api/admin/oneshots`)).json()) as { oneshots: { slug: string; ownerId: string | null }[] };
  check(adminList.oneshots.find((o) => o.slug === OWN)?.ownerId === wrenRow!.id, "the admin sees it too, owned by Wren");
  check((await boss.request.get(`${BASE}/admin/${LEGACY}`)).status() === 200, "the admin still opens everything");
  const del = await wren2.request.delete(`${BASE}/api/admin/oneshots/${OWN}`, { data: { confirm: OWN } });
  check(del.status() === 200, "the author deletes her own one-shot");

  // ======================= Leaving =======================
  await authorPage.goto(`${BASE}/board`);
  await authorPage.getByRole("button", { name: "Leave the tavern" }).click();
  await authorPage.waitForURL((u) => u.pathname === "/");
  check(!(await whoami(wren2)).user, "“Leave the tavern” signs out and goes to the landing page");

  // ======================= Closing an account =======================
  check((await whoami(moss)).user?.username === MOSS.username, "Moss is signed in");
  await bossPage.goto(`${BASE}/admin/people`);
  await bossPage.getByRole("button", { name: `Close account (${MOSS.username})` }).click();
  await bossPage.locator(`tr[data-user="${MOSS.username}"]`).getByText("closed").waitFor();
  check(!(await whoami(moss)).user, "closing Moss's account ends Moss's session at once");
  check((await moss.request.patch(`${BASE}/api/account`, { data: { displayName: "Still here?" } })).status() === 401, "…and the API refuses Moss");
  check(!(await signIn(await context(), BASE, MOSS.username, MOSS.password)).ok, "…and Moss can't sign in again");
  const selfDemote = await boss.request.post(`${BASE}/api/admin/people`, { data: { action: "access", userId: (await db.user.findUnique({ where: { usernameLower: BOSS.username } }))!.id, role: "member" } });
  check(selfDemote.status() === 409, "an admin can't demote themselves");

  // ======================= The landing page =======================
  const visitor = await context(true);
  const landing = await visitor.request.get(`${BASE}/`, { maxRedirects: 0 });
  const html = await landing.text();
  check(landing.status() === 200 && html.includes("Odd jobs for one night"), "the landing page is public");
  const buildId = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)![1]).buildId as string;
  const dataRes = await visitor.request.get(`${BASE}/_next/data/${buildId}/index.json`);
  const data = await dataRes.text();
  check(dataRes.status() === 200 && data.includes('"jobs"'), "…and so is its _next/data JSON");

  const all = publishedSlugs().map((s) => loadOneShot(s));
  const original = all.filter((os) => os.system === "dnd5e" || os.system === "tencandles");
  check(original.some((os) => html.includes(os.cast[0].poster.alias ?? os.cast[0].name)), "it shows real posters from our own casts");
  const PRIVATE = new Set(["secret", "gmNotes", "letters", "ifUnclaimed", "rumors", "notices", "acts", "module", "suggestedTruths", "adversaries", "naughty", "briefing", "announcements", "flashback", "ties", "stake", "premise"]);
  const privateStrings = (v: unknown, under = false, out: string[] = []): string[] => {
    if (typeof v === "string") {
      if (under && v.trim().length >= 12) out.push(v.trim());
    } else if (Array.isArray(v)) v.forEach((x) => privateStrings(x, under, out));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) privateStrings(x, under || PRIVATE.has(k), out);
    return out;
  };
  const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const shown = decode(html) + data;
  let leaks = 0;
  for (const os of all) {
    const pub = new Set([os.title, os.pitch, os.posting.header, ...os.cast.flatMap((c) => [c.name, c.poster.alias, c.poster.epithet, c.poster.hook])]);
    for (const s of privateStrings(os)) {
      if (pub.has(s) || !shown.includes(s)) continue;
      leaks++;
      console.log(`     leak from ${os.slug}: ${s.slice(0, 80)}`);
    }
  }
  check(leaks === 0, "no secret, GM note, letter, if-unclaimed or other private text is in the HTML or the JSON");
  const licensed = all.filter((os) => os.system === "daggerheart" || os.system === "paranoia");
  check(licensed.length > 0 && licensed.every((os) => !shown.includes(os.title) && os.cast.every((c) => !shown.includes(c.name))), "no Daggerheart or Paranoia one-shot or character is on it");
  check(!/daggerheart|paranoia/i.test(data), "…and its JSON never names those systems");
  check(/property="og:image" content="http[^"]+\/api\/og"/.test(html), "it carries a poster card for Discord");
  const boardData = await visitor.request.get(`${BASE}/_next/data/${buildId}/board.json`, { maxRedirects: 0 });
  check(boardData.status() !== 200 || !(await boardData.text()).includes(licensed[0].title), "the board's data stays behind the door");
  const boardAnon = await visitor.request.get(`${BASE}/board`, { maxRedirects: 0 });
  check(boardAnon.status() === 307 && boardAnon.headers()["location"]?.includes("/login"), "the board sends strangers to the door");
  const home = await boss.request.get(`${BASE}/`, { maxRedirects: 0 });
  check(home.status() === 307 && home.headers()["location"]?.endsWith("/board"), "a member at / goes straight to the board");
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`${BASE}/`);
  await shot(visitorPage, "06-landing-phone");
  const overflow = await visitorPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `the landing page fits a phone with no sideways scroll (${overflow}px)`);

  console.log("\nall accounts checks passed");
} finally {
  // The people this run made, and anything of theirs.
  const names = [BOSS.username, WREN.username, MOSS.username, `late-${RUN}`].map((n) => n.toLowerCase());
  const ids = (await db.user.findMany({ where: { usernameLower: { in: names } }, select: { id: true } })).map((u) => u.id);
  await db.oneShot.deleteMany({ where: { slug: OWN } }).catch(() => {});
  await db.invite.deleteMany({ where: { createdById: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.authAttempt.deleteMany({ where: { OR: [{ key: { startsWith: "login:" } }, { key: { startsWith: "token:" } }] } });
  await db.$disconnect();
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
}
