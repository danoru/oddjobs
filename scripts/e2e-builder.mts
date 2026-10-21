/**
 * e2e-builder.mts — drive the one-shot builder in headless Chromium, as the
 * GM, against a running dev server (writes need NODE_ENV=development or
 * TEAROFF_CONTENT_WRITE=1). LOCAL ONLY, like pnpm pdf.
 *
 *   pnpm e2e:builder                — against http://localhost:3004
 *   SHOTS=dir pnpm e2e:builder      — also save screenshots there
 *   KEEP=1 pnpm e2e:builder         — leave the test one-shots in content/ afterwards
 *
 * From nothing, in the UI: a 2024 5e one-shot with three characters and a
 * Ten Candles module with a pre-made, and a Daggerheart one-shot with two
 * characters, an adversary and the rules help (trait spread, the rules'
 * numbers, domain cards from the class's domains, a tier-1 weapon), and a
 * Paranoia mission with two Troubleshooters (the skill draft, naughty sides
 * that never reach a player page). Along the way it trips the checks on
 * purpose (a hook that's too long, a hand-typed HP, a public tie that echoes
 * the secret, missing fields), jumps to them from the problem list, fixes
 * them, publishes both and reads them back on the board and their sheets.
 * Then it duplicates one, edits and publishes the copy, unpublishes it,
 * checks players can't reach /admin or its API, and deletes every test
 * one-shot so content/ is as it was. Exits 1 on the first failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3004";
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const KEEP = process.env.KEEP === "1";
const HEIST = "builder-test-heist";
const NIGHT = "builder-test-night";
const COPY = "builder-test-night-copy";
const VOW = "builder-test-vow";
const MISSION = "builder-test-mission";
const TEST_SLUGS = [HEIST, NIGHT, COPY, VOW, MISSION];

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
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

for (const slug of TEST_SLUGS)
  for (const dir of ["oneshots", "drafts"])
    if (fs.existsSync(path.join(ROOT, "content", dir, slug)))
      throw new Error(`content/${dir}/${slug} already exists; remove it first (a previous run with KEEP=1?)`);

const browser = await chromium.launch();
const gmCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
{
  const r = await gmCtx.request.post(`${BASE}/api/login`, { data: { password: env("GM_PASSWORD") } });
  if (!r.ok()) throw new Error(`Login failed (${r.status()}) — is the dev server running at ${BASE}?`);
}
const page = await gmCtx.newPage();
const pageErrors: string[] = [];
// The unsaved-changes guard cancels a navigation by throwing, which is how Next has you do it.
page.on("pageerror", (e) => void (/Route change aborted/.test(String(e)) || pageErrors.push(String(e))));
// Confirms are accepted unless a step says otherwise.
let onDialog: (msg: string) => boolean = () => true;
page.on("dialog", (d) => void (onDialog(d.message()) ? d.accept() : d.dismiss()));

// ---- Helpers on the builder's data-field / f-<path> hooks ----
const field = (p: string) => page.locator(`[data-field="${p}"]`).first();
const shell = (p: string) => page.locator(`[id="f-${p}"]`).first();
async function type(p: string, value: string) {
  await field(p).fill(value);
}
async function choose(p: string, option: string) {
  await shell(p).locator('[role="combobox"]').first().click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function tag(p: string, value: string) {
  await field(p).fill(value);
  await field(p).press("Enter");
}
async function add(p: string, item: string) {
  await shell(p).getByRole("button", { name: `Add ${item}`, exact: true }).last().click();
}
async function issues(): Promise<number> {
  await page.waitForTimeout(450);
  return Number(await page.locator("[data-issue-count]").getAttribute("data-issue-count"));
}
async function issueAt(p: string): Promise<boolean> {
  await page.waitForTimeout(450);
  return (await page.locator(`[data-jump="${p}"]`).count()) > 0;
}
async function saved() {
  await page.locator('[data-save-state="saved"]').waitFor({ timeout: 15000 });
}
async function openCharacter(id: string) {
  await page.locator(`[data-cast="${id}"]`).click();
  await page.waitForTimeout(200);
}
async function addCharacter(name: string) {
  await type("new-character", name);
  await field("new-character").press("Enter");
  await page.waitForTimeout(200);
}
async function publish(slug: string) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByText("Published. It's on the board").waitFor({ timeout: 30000 });
  check(fs.existsSync(path.join(ROOT, "content", "oneshots", slug, "oneshot.json")), `${slug} is published to content/oneshots`);
  check(!fs.existsSync(path.join(ROOT, "content", "drafts", slug)), `${slug}'s draft is gone after publishing`);
}
/**
 * A page's text. In dev, Next keeps each page's static path list for a moment
 * and refreshes it in the background, so a page just published can 404 once.
 */
async function textOf(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const r = await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 120000 });
    if (r?.status() === 200) {
      if (attempt > 1) console.log(`     (${url} needed ${attempt} tries: dev's path cache)`);
      return page.locator("body").innerText();
    }
    if (attempt >= 4) throw new Error(`${url} answered ${r?.status()}`);
    await page.waitForTimeout(1500);
  }
}
async function newOneShot(system: string, title: string, slug: string) {
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: "New one-shot" }).click();
  await page.locator(`[role="radio"][data-system="${system}"]`).click();
  await type("new-title", title);
  check((await field("new-slug").inputValue()) === slug, `the slug follows the title (${slug})`);
  await page.getByRole("button", { name: "Start writing" }).click();
  await page.waitForURL(`**/admin/${slug}`, { timeout: 60000 });
  await page.locator("[data-issue-count]").waitFor();
}

// A poster hook fits in 90 characters.
const HOOK = "Wanted for a job that nobody else in the lower city would dare to take on, tonight.";
const TOO_LONG = `${HOOK} No questions.`;

try {
  // ======================= A 5e one-shot from scratch =======================
  await newOneShot("dnd5e", "Builder Test Heist", HEIST);
  check(fs.existsSync(path.join(ROOT, "content", "drafts", HEIST, "draft.json")), "creating it saves a draft (not on the board)");
  check((await issues()) > 0, "a blank one-shot shows what's missing");
  check(await issueAt("oneshot.pitch"), "…including the pitch, pointed at its field");

  await type("oneshot.posting.header", "HANDS WANTED: ONE NIGHT, NO QUESTIONS");
  await type("oneshot.pitch", "The counting-house vault opens once a year, tonight, for the auditors. You are the auditors.");
  await type("oneshot.premise", "Three strangers hold forged letters naming them as the guild's auditors, and each knows something the others don't.");
  await type("oneshot.posting.reward", "A tenth of what's in the vault");
  await type("oneshot.setting", "The Counting-House of Vell, a river city");
  await tag("oneshot.tone", "heist");
  await tag("oneshot.tone", "double-cross");
  await type("oneshot.gmNotes", "Let the forgeries be good enough until the second act.");
  await add("oneshot.letters", "letter");
  // (Its recipient is picked once the cast exists.)
  await add("oneshot.sounds", "soundboard");
  await add("oneshot.sounds.stingers", "stinger");
  await type("oneshot.sounds.stingers.0.label", "The vault door");
  await choose("oneshot.sounds.stingers.0.preset", "door");
  await shell("oneshot.sounds.stingers.0.preset").getByRole("button", { name: /Preview/ }).click();
  check(!(await issueAt("oneshot.pitch")), "the posting is filled in");

  for (const name of ["Ada Quill", "Bram Stone", "Cora Vale"]) await addCharacter(name);
  check((await page.locator("[data-cast]").count()) === 3, "three characters in the cast list");

  const story = async (i: number, s: { secret: string; concept: string }) => {
    await type(`cast.${i}.story.pronouns`, "they/them");
    await type(`cast.${i}.story.concept`, s.concept);
    await type(`cast.${i}.story.stake`, "If the vault opens without them, they hang for it.");
    await type(`cast.${i}.story.goal`, "Walk out with the ledger.");
    await type(`cast.${i}.story.secret`, s.secret);
    await type(`cast.${i}.story.appearance`, "Ink on the cuffs, rain on the hat.");
    await type(`cast.${i}.story.voice`, "Quiet, then very loud.");
    await add(`cast.${i}.story.mannerisms`, "mannerism");
    await type(`cast.${i}.story.mannerisms.0`, "Counts things under their breath");
    await type(`cast.${i}.flashback`, "Who taught you to forge a signature?");
  };
  const tie = async (i: number, to: string, text: string, pub: string) => {
    const n = await shell(`cast.${i}.story.ties`).locator("details").count();
    await add(`cast.${i}.story.ties`, "tie");
    await choose(`cast.${i}.story.ties.${n}.to`, to);
    await type(`cast.${i}.story.ties.${n}.text`, text);
    await type(`cast.${i}.story.ties.${n}.public`, pub);
  };
  const mechBasics = async (i: number, o: { cls: string; species: string; background: string; feat: string; ac: string; acNote: string }) => {
    await type(`cast.${i}.mech.species`, o.species);
    await type(`cast.${i}.mech.background`, o.background);
    await type(`cast.${i}.mech.classes.0.name`, o.cls);
    await page.getByRole("button", { name: `Standard array for a ${o.cls.toLowerCase()}` }).click();
    await page.getByRole("button", { name: new RegExp(`^Use the ${o.cls.toLowerCase()}'s saves`) }).click();
    await type(`cast.${i}.mech.ac.value`, o.ac);
    await type(`cast.${i}.mech.ac.note`, o.acNote);
    await type(`cast.${i}.mech.originFeat`, o.feat);
    await add(`cast.${i}.mech.features`, "feature");
    await type(`cast.${i}.mech.features.0.name`, `${o.cls} training`);
    await type(`cast.${i}.mech.features.0.text`, "What the class gives at this level, in our own words.");
    await add(`cast.${i}.mech.equipment`, "item");
    await type(`cast.${i}.mech.equipment.0.name`, "Forged auditor's letter");
  };

  // ---- Ada: a wizard, with spells from the spell book ----
  await openCharacter("ada-quill");
  await type("cast.0.poster.epithet", "the Clerk");
  await type("cast.0.poster.hook", TOO_LONG);
  check(await issueAt("cast.0.poster.hook"), "a hook over 90 characters is flagged on its field");
  check((await shell("cast.0.poster.hook").innerText()).includes(`${TOO_LONG.length}/90`), "the hook shows a character counter");
  await type("cast.0.poster.hook", HOOK);
  check(!(await issueAt("cast.0.poster.hook")), "…and the flag clears when it fits");
  await page.locator('[data-field="cast.0.poster.icon:book"]').click();
  await page.locator('[data-field="cast.0.roles:control"]').click();
  await story(0, { concept: "A guild clerk who has read every ledger but one.", secret: "She forged the auditors' letters herself, including her own." });
  await tie(0, "Bram Stone", "He saw her practising his signature and said nothing.", "Share a desk at the guild");
  await tie(0, "Cora Vale", "Cora once paid her debts, and Ada has never asked why.", "Old debts, settled quietly");
  // A board-safe line that gives the secret away gets a soft warning.
  await type("cast.0.story.ties.1.public", "She forged letters for Cora");
  check((await shell("cast.0.story.ties.1.public").innerText()).includes("Might reveal the secret"), "a public tie that echoes the secret is warned about");
  await type("cast.0.story.ties.1.public", "Old debts, settled quietly");
  await mechBasics(0, { cls: "Wizard", species: "Human", background: "Scribe", feat: "Skilled", ac: "12", acNote: "Dex 2 + 10" });
  check((await field("cast.0.mech.hp").inputValue()) === "20", "HP follows the calculator: wizard 3 with Con 14 is 20");
  await page.locator('[data-field="cast.0.mech.skills:arcana"]').check();
  await page.locator('[data-field="cast.0.mech.skills:history"]').check();
  await page.getByRole("button", { name: "Add spellcasting" }).click();
  check((await field("cast.0.mech.spellcasting.slots.0").inputValue()) === "4", "spellcasting starts with the class table's slots (4 / 2)");
  for (const [n, spell] of ["Fire Bolt", "Mage Hand", "Sleep", "Shield"].entries()) {
    await add("cast.0.mech.spellcasting.spells", "spell");
    await field(`cast.0.mech.spellcasting.spells.${n}.name`).fill(spell.slice(0, -1));
    await page.getByRole("option", { name: spell, exact: true }).click();
  }
  check((await field("cast.0.mech.spellcasting.spells.2.level").inputValue()) === "1", "picking a spell from the book fills in its level");
  await add("cast.0.mech.attacks", "attack");
  await type("cast.0.mech.attacks.0.name", "Fire Bolt");
  await choose("cast.0.mech.attacks.0.kind", "spell");
  await choose("cast.0.mech.attacks.0.ability", "int");
  await type("cast.0.mech.attacks.0.dice", "1d10");
  await type("cast.0.mech.attacks.0.damageType", "fire");
  await page.locator('[id="f-cast.0.mech.attacks.0.addMod"] input').uncheck();
  check((await shell("cast.0.mech.attacks.0").innerText()).includes("+4 · 1d10 fire"), "the attack shows its computed to-hit and damage (+4 · 1d10 fire)");
  await shot(page, "01-ada-mechanics");

  // ---- Bram: a fighter; jump to his problems from the list ----
  await openCharacter("bram-stone");
  check(await issueAt("cast.1.mech.species"), "Bram's missing species is in the problem list");
  await openCharacter("ada-quill");
  await page.locator('[data-jump="cast.1.mech.species"]').click();
  await page.waitForTimeout(800);
  check(
    (await page.evaluate(() => document.activeElement?.closest("[data-path]")?.getAttribute("data-path"))) === "cast.1.mech.species",
    "a jump link opens Bram and puts the cursor in the species field",
  );
  await type("cast.1.poster.epithet", "the Doorman");
  await type("cast.1.poster.hook", "Seeking work that needs a strong back and a short memory.");
  await page.locator('[data-field="cast.1.poster.icon:fist"]').click();
  await page.locator('[data-field="cast.1.roles:tank"]').click();
  await story(1, { concept: "A dock porter who has carried every crate into the vault for ten years.", secret: "He has a key to the vault's back door." });
  await tie(1, "Ada Quill", "He knows she can forge his hand.", "Share a desk at the guild");
  await mechBasics(1, { cls: "Fighter", species: "Dwarf", background: "Soldier", feat: "Tough", ac: "16", acNote: "Chain mail" });
  await page.locator('[data-field="cast.1.mech.skills:athletics"]').check();
  await page.locator('[data-field="cast.1.mech.skills:intimidation"]').check();
  // Hand-typed HP that the rules check won't accept, then back to the calculator.
  await shell("cast.1.mech.hp").locator("..").getByLabel("Override the calculator").check();
  await field("cast.1.mech.hp").fill("99");
  check(await issueAt("cast.1.mech.hp"), "an overridden HP that isn't the fixed average is flagged");
  await shell("cast.1.mech.hp").locator("..").getByLabel("Override the calculator").uncheck();
  check(!(await issueAt("cast.1.mech.hp")), "back on the calculator, HP is right again (dwarf and Tough counted)");
  await add("cast.1.mech.attacks", "attack");
  await type("cast.1.mech.attacks.0.name", "Maul");
  await type("cast.1.mech.attacks.0.dice", "2d6");
  await type("cast.1.mech.attacks.0.damageType", "bludgeoning");
  await add("cast.1.ifUnclaimed", "if nobody claims them");
  await type("cast.1.ifUnclaimed.npc", "He's at the door either way, and he lets them in.");
  await add("cast.1.ifUnclaimed.reassign", "beat");
  await type("cast.1.ifUnclaimed.reassign.0.beat", "The back-door key");
  await choose("cast.1.ifUnclaimed.reassign.0.to", "Cora Vale");
  await choose("cast.1.ifUnclaimed.reassign.0.to", "Ada Quill");
  check((await shell("cast.1.ifUnclaimed.reassign.0.to").innerText()).match(/Cora Vale[\s\S]*Ada Quill/), "heirs keep the order they were picked in");
  await type("cast.1.ifUnclaimed.reassign.0.text", "Whoever gets this finds the key in their coat.");

  // ---- Cora: a rogue ----
  await openCharacter("cora-vale");
  await type("cast.2.poster.epithet", "the Ghost");
  await type("cast.2.poster.alias", "????");
  await type("cast.2.poster.hook", "Missing: one auditor. Answers to no name. Last seen at the vault.");
  await choose("cast.2.poster.header", "MISSING");
  await page.locator('[data-field="cast.2.poster.icon:ghost"]').click();
  await page.locator('[data-field="cast.2.roles:scout"]').click();
  await story(2, { concept: "Nobody at the guild has ever seen her face in daylight.", secret: "She is the real auditor, and she is here to catch the other two." });
  await tie(2, "Bram Stone", "She knows about his key.", "Nod to each other at the docks");
  await mechBasics(2, { cls: "Rogue", species: "Halfling", background: "Criminal", feat: "Alert", ac: "14", acNote: "Leather 11 + Dex 3" });
  for (const sk of ["stealth", "sleightOfHand", "perception", "investigation"])
    await page.locator(`[data-field="cast.2.mech.skills:${sk}"]`).check();
  await page.locator('[data-field="cast.2.mech.expertise:stealth"]').check();
  await add("cast.2.mech.attacks", "attack");
  await type("cast.2.mech.attacks.0.name", "Rapier");
  await choose("cast.2.mech.attacks.0.ability", "dex");
  await type("cast.2.mech.attacks.0.dice", "1d8");
  await type("cast.2.mech.attacks.0.damageType", "piercing");

  // ---- Back on the one-shot: the letter's recipient, core roles ----
  await page.getByRole("button", { name: "Posting & premise" }).click();
  await choose("oneshot.letters.0.to", "Cora Vale");
  await type("oneshot.letters.0.when", "Act 2: the vault door");
  await type("oneshot.letters.0.title", "The real orders");
  await type("oneshot.letters.0.text", "Your orders: let them open it. Then close it behind them.");
  await choose("oneshot.coreRoles", "Ada Quill");

  // ---- Phase 6: an act card, rumors, a town-board notice, the letter's act, coins ----
  await add("oneshot.acts", "act");
  await type("oneshot.acts.0.title", "The Vault Door");
  await type("oneshot.acts.0.subtitle", "Once a year it opens, and tonight is the night.");
  await choose("oneshot.letters.0.act", "Act 1: The Vault Door");
  await add("oneshot.rumors", "rumor");
  await type("oneshot.rumors.0.text", "Too short");
  check(await issueAt("oneshot.rumors.0.text"), "a rumor too short to be a rumor is flagged on its field");
  await type("oneshot.rumors.0.text", "The vault's second lock was fitted only last week.");
  await add("oneshot.rumors", "rumor");
  check(await issueAt("oneshot.rumors.1.text"), "…and so is a second rumor left empty");
  await type("oneshot.rumors.1.text", "The guild master has never audited anything himself.");
  await choose("oneshot.rumors.1.truth", "false");
  check(!(await issueAt("oneshot.rumors.0.text")) && !(await issueAt("oneshot.rumors.1.text")), "fixed rumors pass");
  await add("oneshot.notices", "notice");
  await type("oneshot.notices.0.title", "AUDITORS EXPECTED AT DUSK");
  await add("oneshot.coins", "inspiration coins");
  await type("oneshot.coins.tossesPerAct", "9");
  check(await issueAt("oneshot.coins.tossesPerAct"), "coin tosses past five a player an act are flagged");
  await type("oneshot.coins.tossesPerAct", "2");

  // ---- Reorder: Cora to the top of the board ----
  await page.getByRole("button", { name: "Move Cora Vale up the board" }).click();
  await page.getByRole("button", { name: "Move Cora Vale up the board" }).click();
  check((await page.locator("[data-cast]").first().getAttribute("data-cast")) === "cora-vale", "the cast reorders");

  const left = await issues();
  if (left) console.log(await page.locator("[data-issue-count]").innerText());
  check(left === 0, "every problem is fixed: 0 left");
  await saved();
  await shot(page, "02-heist-ready");

  // The unsaved-changes guard.
  let guard = "";
  onDialog = (msg) => {
    guard = msg;
    return false;
  };
  await type("oneshot.setting", "The Counting-House of Vell, a river city at night");
  await page.getByRole("link", { name: "All one-shots" }).click();
  await page.waitForTimeout(300);
  check(/unsaved/i.test(guard) && page.url().endsWith(`/admin/${HEIST}`), "leaving with unsaved changes asks first");
  onDialog = () => true;
  await saved();

  // Preview pane: the board and the sheet use the real components.
  await page.getByRole("tab", { name: "Sheet" }).click();
  await page.waitForTimeout(400);
  check(/proficiency/i.test(await page.locator(`[aria-label="Live preview"]`).innerText()), "the sheet preview renders the real sheet");
  await publish(HEIST);
  await shot(page, "03-heist-published");
  {
    const written = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "oneshots", HEIST, "oneshot.json"), "utf8"));
    check(written.acts?.[0]?.title === "The Vault Door" && written.letters?.[0]?.act === written.acts[0].id, "the act card and the letter's act are published");
    check(written.rumors?.length === 2 && written.rumors[1].truth === "false", "the rumors are published with their truths");
    check(written.notices?.[0]?.title === "AUDITORS EXPECTED AT DUSK" && written.coins?.tossesPerAct === 2, "the notice and the coin settings are published");
  }

  const board = await textOf("/");
  check(board.includes("Builder Test Heist"), "the new 5e one-shot is on the home board");
  const job = await textOf(`/${HEIST}`);
  check(job.includes("Ada Quill") && job.includes("Bram Stone") && job.includes("????"), "its job page shows the posters (Cora behind her alias)");
  await shot(page, "04-heist-job");
  const sheet = await textOf(`/${HEIST}/ada-quill`);
  check(sheet.includes("Ada Quill") && sheet.includes("Mage Hand") && sheet.includes("Wizard 3"), "Ada's sheet has her class and spells");
  await shot(page, "05-ada-sheet");
  const bram = await textOf(`/${HEIST}/bram-stone`);
  check(bram.includes("Maul"), "Bram's sheet has his attack");
  const cards = await textOf(`/${HEIST}/cards`);
  check(cards.includes("Fire Bolt"), "the cards page has Ada's spell cards");

  // ======================= A Ten Candles module from scratch =======================
  await newOneShot("tencandles", "Builder Test Night", NIGHT);
  await type("oneshot.posting.header", "MISSING: THE LIGHTHOUSE KEEPER");
  await type("oneshot.pitch", "The lamp went out at midnight. The keeper went to fix it and never came down.");
  await type("oneshot.premise", "You are the last people on the island, and the boat isn't coming.");
  await type("oneshot.posting.reward", "A place in the boat, if it comes");
  await type("oneshot.setting", "A tidal island lighthouse");
  await tag("oneshot.tone", "tragic horror");
  await type("oneshot.module.intro", "The sea is very quiet tonight.\n\nThe lamp is out.");
  await type("oneshot.module.goal", "Relight the lamp before the boat passes.");
  await type("oneshot.module.them", "They come up the steps with the tide.");
  check(await issueAt("oneshot.module.areas"), "a module needs at least two areas");
  for (const [n, area] of ["The lamp room", "The keeper's cottage"].entries()) {
    await add("oneshot.module.areas", "area");
    await type(`oneshot.module.areas.${n}.name`, area);
    await type(`oneshot.module.areas.${n}.text`, "Cold, wet, and not empty.");
  }
  await add("oneshot.module.stages", "stage");
  await add("oneshot.module.stages", "stage");
  await type("oneshot.module.stages.0.candles", "4");
  await type("oneshot.module.stages.0.title", "The water rises");
  await type("oneshot.module.stages.0.text", "The steps flood.");
  await type("oneshot.module.stages.1.candles", "9");
  await type("oneshot.module.stages.1.title", "The quiet");
  await type("oneshot.module.stages.1.text", "Nothing happens, loudly.");
  check(await issueAt("oneshot.module.stages"), "stages out of order are flagged");
  await page.getByRole("button", { name: "Sort stages from ten candles down" }).click();
  check(!(await issueAt("oneshot.module.stages")), "…and sorting them fixes it");
  await type("oneshot.module.lastStand", "The lamp, the last match, the last of them.");
  await add("oneshot.suggestedTruths", "truth");
  await type("oneshot.suggestedTruths.0", "The keeper's boots are at the top of the stairs.");
  await addCharacter("Dot Harrow");
  await openCharacter("dot-harrow");
  await type("cast.0.poster.epithet", "the Keeper's Daughter");
  await type("cast.0.poster.hook", "Last seen carrying a lamp toward the sea.");
  await type("cast.0.story.concept", "She grew up in the lighthouse and knows every step in the dark.");
  await type("cast.0.story.look", "Oilskin coat, bare feet, a lamp with no oil.");
  await tag("cast.0.story.namePrompts", "Dorothy");
  await add("cast.0.story.carrying", "thing");
  await type("cast.0.story.carrying.0", "A box of matches, three left");
  const tcLeft = await issues();
  if (tcLeft) console.log(await page.locator("[data-issue-count]").innerText());
  check(tcLeft === 0, "the Ten Candles module passes every check");
  await saved();
  await shot(page, "06-night-ready");
  await publish(NIGHT);
  const night = await textOf(`/${NIGHT}`);
  check(night.includes("Builder Test Night") && night.includes("Dot Harrow"), "the module's job page shows its pre-made");
  const dot = await textOf(`/${NIGHT}/dot-harrow`);
  check(dot.includes("A box of matches"), "the pre-made's page shows what she carries");
  const gm = await textOf(`/${NIGHT}/gm`);
  check(gm.includes("They come up the steps with the tide."), "the GM page has the module");
  check(!night.includes("They come up the steps"), "the job page doesn't leak the module");

  // ======================= A Daggerheart one-shot from scratch =======================
  await newOneShot("daggerheart", "Builder Test Vow", VOW);
  await type("oneshot.posting.header", "HIRING: TWO BLADES FOR THE TOLL BRIDGE");
  await type("oneshot.pitch", "The bridge-troll wants a song, a riddle and a fair fight, in that order.");
  await type("oneshot.premise", "Two friends owe the toll and have one night to pay it.");
  await type("oneshot.posting.reward", "Free crossing for a year");
  await type("oneshot.setting", "A toll bridge over a loud river");
  await type("oneshot.players.min", "2");
  await tag("oneshot.tone", "hopeful");
  await add("oneshot.adversaries", "adversary");
  await type("oneshot.adversaries.0.name", "The Toll-Troll");
  for (const name of ["Kit Fenn", "Lark Abernathy"]) await addCharacter(name);
  const dhStory = async (i: number, other: string) => {
    await type(`cast.${i}.poster.epithet`, "the Debtor");
    await type(`cast.${i}.poster.hook`, "Owes the bridge a toll and means to pay it in steel.");
    await type(`cast.${i}.story.pronouns`, "she/her");
    await type(`cast.${i}.story.concept`, "A river-guard who lost a bet.");
    await type(`cast.${i}.story.stake`, "No crossing, no wedding on the far bank.");
    await type(`cast.${i}.story.goal`, "Pay the toll.");
    await type(`cast.${i}.story.secret`, "She could swim it, and hasn't told anyone.");
    await type(`cast.${i}.story.appearance`, "Wet boots, dry wit.");
    await type(`cast.${i}.story.voice`, "Low and amused.");
    await add(`cast.${i}.story.mannerisms`, "mannerism");
    await type(`cast.${i}.story.mannerisms.0`, "Flips a copper while thinking");
    await add(`cast.${i}.story.ties`, "tie");
    await choose(`cast.${i}.story.ties.0.to`, other);
    await type(`cast.${i}.story.ties.0.text`, "Shared the bet, and the loss.");
    await type(`cast.${i}.mech.ancestry`, "Human");
    await type(`cast.${i}.mech.community`, "Seaborne");
    for (const [n, x] of ["River Guard", "Bad Bets"].entries()) {
      await add(`cast.${i}.mech.experiences`, "Experience");
      await type(`cast.${i}.mech.experiences.${n}.name`, x);
    }
  };
  await openCharacter("kit-fenn");
  await dhStory(0, "Lark Abernathy");
  check(await issueAt("cast.0.mech.domainCards"), "Daggerheart: a level-1 character without two domain cards is flagged on the field");
  await page.getByRole("button", { name: "Not Good Enough (Blade)" }).click();
  await page.getByRole("button", { name: "Untouchable (Bone)" }).click();
  check(!(await issueAt("cast.0.mech.domainCards")), "…and picking two from the Warrior's domains (Blade, Bone) clears it");
  await type("cast.0.mech.evasion", "14");
  check(await issueAt("cast.0.mech.evasion"), "a hand-typed Evasion that breaks the rules is flagged");
  await page.getByRole("button", { name: "Use the rules' numbers" }).click();
  check((await field("cast.0.mech.evasion").inputValue()) === "11" && !(await issueAt("cast.0.mech.evasion")), "…'Use the rules' numbers' puts back Warrior 11 in leather");
  await type("cast.0.mech.traits.knowledge", "2");
  check(await issueAt("cast.0.mech.traits"), "a trait spread that isn't +2 +1 +1 +0 +0 −1 is flagged");
  await page.getByRole("button", { name: "Spread for a Warrior" }).click();
  check(!(await issueAt("cast.0.mech.traits")), "…and 'Spread for a Warrior' lays it out");
  await shell("cast.0.mech.weapons").scrollIntoViewIfNeeded();
  await page.getByLabel("Add a tier-1 weapon").click();
  await page.getByRole("option", { name: /^Longsword/ }).click();
  check((await field("cast.0.mech.weapons.0.name").inputValue()) === "Longsword", "a tier-1 weapon from the SRD table fills in its numbers");
  await shot(page, "08-dh-mechanics");
  await openCharacter("lark-abernathy");
  await dhStory(1, "Kit Fenn");
  await choose("cast.1.mech.class", "Wizard");
  await choose("cast.1.mech.subclass", "School of War (Spellcast: Knowledge)");
  await page.getByRole("button", { name: "Spread for a Wizard" }).click();
  await page.getByRole("button", { name: "Use the rules' numbers" }).click();
  await page.getByRole("button", { name: "Book of Ava (Codex)" }).click();
  await page.getByRole("button", { name: "Bolt Beacon (Splendor)" }).click();
  check((await field("cast.1.mech.hp").inputValue()) === "5", "a Wizard's Hit Points follow the class (5)");
  const dhLeft = await issues();
  if (dhLeft) console.log(await page.locator("[data-issue-count]").innerText());
  check(dhLeft === 0, "the Daggerheart one-shot passes every check");
  await saved();
  await publish(VOW);
  const vow = await textOf(`/${VOW}`);
  check(vow.includes("Builder Test Vow") && vow.includes("Kit Fenn") && !vow.includes("Toll-Troll"), "its job page shows the cast and not the GM-only adversary");
  const kit = await textOf(`/${VOW}/kit-fenn`);
  check(kit.includes("Not Good Enough") && kit.includes("Evasion"), "Kit's sheet shows her domain cards and Evasion");
  check((await textOf(`/${VOW}/gm`)).includes("The Toll-Troll"), "the GM page has the adversary");

  // ======================= A Paranoia mission from scratch =======================
  await newOneShot("paranoia", "Builder Test Mission", MISSION);
  await type("oneshot.posting.header", "TROUBLESHOOTERS REQUIRED. HAPPINESS MANDATORY.");
  await type("oneshot.pitch", "Fetch a box from sector ZZZ. The box is ticking.");
  await type("oneshot.premise", "Friend Computer has chosen you. Rejoice.");
  await type("oneshot.posting.reward", "XP Points, possibly");
  await type("oneshot.setting", "Alpha Complex");
  await type("oneshot.team", "Team Builder");
  await type("oneshot.players.min", "2");
  await tag("oneshot.tone", "darkly comic");
  await type("oneshot.briefing", "Citizens, retrieve the box. Do not open the box.");
  await add("oneshot.objectives", "objective");
  await type("oneshot.objectives.0", "Retrieve the box unopened");
  for (const name of ["Mabel", "Otto"]) await addCharacter(name);
  const draft: [string, number][] = [
    ["bureaucracy", 5],
    ["alphaComplex", 4],
    ["psychology", 3],
    ["bluff", 2],
    ["guns", 1],
    ["melee", -1],
    ["athletics", -2],
    ["demolitions", -3],
    ["engineer", -4],
    ["program", -5],
  ];
  const trouble = async (i: number, sector: string, other: string, society: string) => {
    await openCharacter(i === 0 ? "mabel" : "otto");
    await type(`cast.${i}.poster.epithet`, "the Diligent");
    await type(`cast.${i}.poster.hook`, "Volunteered. Was not asked.");
    await type(`cast.${i}.mech.clone.name`, i === 0 ? "Mabel" : "Otto");
    await type(`cast.${i}.mech.clone.sector`, sector);
    await type(`cast.${i}.mech.serviceGroup`, "Central Processing Unit");
    await type(`cast.${i}.mech.bonusDuty`, i === 0 ? "Team Leader" : "Loyalty Officer");
    for (const [k, v] of draft.slice(0, i === 0 ? 9 : 10)) {
      await shell(`cast.${i}.mech.skills`).getByLabel(k === "alphaComplex" ? "Alpha Complex" : k.charAt(0).toUpperCase() + k.slice(1), { exact: true }).click();
      await page.getByRole("option", { name: v > 0 ? `+${v}` : `−${-v}`, exact: true }).click();
    }
    for (const [f, v] of [
      ["pronouns", "she/her"],
      ["concept", "A clerk who reads every form."],
      ["stake", "A promotion."],
      ["goal", "Survive."],
      ["appearance", "Ironed red."],
      ["voice", "Clipped."],
      ["treasonButton", "Someone mentions the Outdoors"],
      ["violenceButton", "Anyone skips a form"],
    ])
      await type(`cast.${i}.story.${f}`, v);
    await add(`cast.${i}.story.mannerisms`, "mannerism");
    await type(`cast.${i}.story.mannerisms.0`, "Salutes the cameras");
    await add(`cast.${i}.story.ties`, "tie");
    await choose(`cast.${i}.story.ties.0.to`, other);
    await type(`cast.${i}.story.ties.0.text`, "Same corridor.");
    await type(`cast.${i}.naughty.society`, society);
    await type(`cast.${i}.naughty.mutantPower.name`, "Charm");
    await type(`cast.${i}.naughty.mutantPower.text`, "People like you, briefly and against their judgement.");
    await add(`cast.${i}.naughty.objectives`, "objective");
    await type(`cast.${i}.naughty.objectives.0`, `SECRET-OBJECTIVE-${i} open the box`);
  };
  await trouble(0, "MXT", "Otto", "Free Enterprise");
  check(await issueAt("cast.0.mech.skills"), "Paranoia: a skill draft missing its −5 is flagged on the field");
  check((await page.locator('[data-testid="draft-left"]').innerText()).includes("−5"), "…and the panel says which value is still to place");
  await shell("cast.0.mech.skills").getByLabel("Program", { exact: true }).click();
  await page.getByRole("option", { name: "−5", exact: true }).click();
  check(!(await issueAt("cast.0.mech.skills")), "…placing it clears the flag");
  check((await page.locator('[data-testid="stat-brains"]').innerText()) === "3", "stats follow the draft (Brains 3)");
  check((await page.locator('[data-testid="clone-preview"]').innerText()).startsWith("Mabel-R-MXT-1"), "the clone name is previewed as Mabel-R-MXT-1");
  await shot(page, "09-paranoia-mechanics");
  await trouble(1, "MXT", "Mabel", "Communists");
  await type("cast.1.mech.clone.name", "Mabel");
  check(await issueAt("cast.1.mech.clone.name"), "two Troubleshooters can't share a clone name");
  await type("cast.1.mech.clone.name", "Otto");
  const paLeft = await issues();
  if (paLeft) console.log(await page.locator("[data-issue-count]").innerText());
  check(paLeft === 0, "the Paranoia mission passes every check");
  await saved();
  await publish(MISSION);
  const missionJob = await textOf(`/${MISSION}`);
  check(missionJob.includes("Builder Test Mission") && !missionJob.includes("SECRET-OBJECTIVE") && !missionJob.includes("Free Enterprise"), "its job page shows the team and no naughty side");
  const sheetPage = await textOf(`/${MISSION}/mabel`);
  check(sheetPage.includes("Mabel-R-MXT-1") && !sheetPage.includes("SECRET-OBJECTIVE-0"), "Mabel's sheet shows her clone name, not her secret objectives");
  check((await textOf(`/${MISSION}/gm`)).includes("SECRET-OBJECTIVE-0"), "the GM page has the naughty sides");

  // ======================= Duplicate, edit, unpublish =======================
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(`[data-slug="${NIGHT}"]`).getByRole("button", { name: "Duplicate as template" }).click();
  await type("slug", COPY);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.waitForURL(`**/admin/${COPY}`, { timeout: 60000 });
  check((await field("oneshot.title").inputValue()) === "Builder Test Night (copy)", "the duplicate opens as a draft copy");
  await type("oneshot.title", "Builder Test Night, Again");
  await saved();
  await publish(COPY);
  check((await textOf("/")).includes("Builder Test Night, Again"), "the edited copy is on the board");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(`[data-slug="${COPY}"]`).getByRole("button", { name: "Unpublish" }).click();
  await page.locator(`[data-slug="${COPY}"] [data-status="draft"]`).waitFor({ timeout: 30000 });
  // (Dev's path cache can serve the old list once here too.)
  let gone = 0;
  for (let i = 0; i < 5 && gone !== 404; i++) {
    gone = (await page.request.get(`${BASE}/${COPY}`)).status();
    if (gone !== 404) await page.waitForTimeout(1500);
  }
  check(gone === 404, `after unpublishing, its job page is gone (${gone})`);
  check(!(await textOf("/")).includes("Builder Test Night, Again"), "…and so is its posting on the board");
  await shot(page, "07-admin-list");

  // ======================= Players can't get in =======================
  const playerCtx = await browser.newContext();
  await playerCtx.request.post(`${BASE}/api/login`, { data: { password: env("APP_PASSWORD") } });
  const player = await playerCtx.newPage();
  for (const url of ["/admin", `/admin/${HEIST}`, `/admin/preview/${HEIST}`]) {
    await player.goto(`${BASE}${url}`);
    check(new URL(player.url()).pathname === "/login", `a player opening ${url} is sent to the login page`);
  }
  for (const [method, url] of [
    ["GET", "/api/admin/oneshots"],
    ["POST", "/api/admin/oneshots"],
    ["GET", `/api/admin/oneshots/${HEIST}`],
    ["PUT", `/api/admin/oneshots/${HEIST}`],
    ["DELETE", `/api/admin/oneshots/${HEIST}`],
    ["POST", `/api/admin/oneshots/${HEIST}/unpublish`],
    ["GET", `/api/admin/oneshots/${HEIST}/export`],
  ] as const) {
    const r = await playerCtx.request.fetch(`${BASE}${url}`, { method, data: { confirm: HEIST, action: "create", system: "dnd5e", title: "x" } });
    check(r.status() === 403, `a player gets 403 from ${method} ${url}`);
  }
  const stranger = await browser.newContext();
  const r = await stranger.request.get(`${BASE}/api/admin/oneshots`, { maxRedirects: 0 });
  check(r.status() === 307 || r.status() === 403, "someone not signed in can't reach the admin API");
  await playerCtx.close();
  await stranger.close();
  check(fs.existsSync(path.join(ROOT, "content", "oneshots", HEIST, "oneshot.json")), "nothing the player tried changed the content");

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
} finally {
  // ======================= Clean up through the UI =======================
  if (!KEEP) {
    onDialog = () => true;
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" }).catch(() => {});
    for (const slug of TEST_SLUGS) {
      const row = page.locator(`[data-slug="${slug}"]`);
      if (!(await row.count())) continue;
      await row.getByRole("button", { name: "Delete" }).click();
      await type("confirm-delete", slug);
      await page.getByRole("button", { name: "Delete for good" }).click();
      await row.waitFor({ state: "detached", timeout: 30000 });
    }
    // Only the "remember to commit" list of this browser mentions them; clear it.
    await page.evaluate(() => localStorage.removeItem("tearoff:admin:changed")).catch(() => {});
  }
  await browser.close();
}
if (!KEEP) {
  const left = TEST_SLUGS.flatMap((slug) =>
    ["oneshots", "drafts"].filter((d) => fs.existsSync(path.join(ROOT, "content", d, slug))).map((d) => `content/${d}/${slug}`),
  );
  check(left.length === 0, `the test one-shots are deleted${left.length ? ` (left: ${left.join(", ")})` : ""}`);
}
console.log("\nThe builder works end to end.");
