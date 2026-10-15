/**
 * Tear-Off table sync: polls the Tear-Off site for the current table and, on
 * the active GM's client, hands torn characters to the players who tore them.
 *
 * Only Foundry's public client API (v12/v13) is used. Spots where the code
 * leans on an assumption about that API are marked "ASSUMPTION".
 *
 * Nothing in here throws out to Foundry: network and document errors are
 * caught, shown once with ui.notifications.warn, then retried quietly.
 */

export const MODULE_ID = "tearoff-sync";
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 10000;

/** Shared, read-only-ish state the board window renders. */
export const state = {
  /** Last good response from the site, or null. */
  table: null,
  /** One row per poster; see analyse(). */
  rows: [],
  /** Human-readable problem with the last poll, or null. */
  error: null,
  /** Date of the last good poll. */
  updatedAt: null,
};

const listeners = new Set();
let timer = null;
let generation = 0; // bumped by start()/stop() so stale poll loops quit
let running = false; // a refresh is in flight
let lastWarned = null; // last error text we showed with ui.notifications
const notified = new Set(); // "unmatched" warnings already shown

/** Call `fn` whenever state changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      console.error("Tear-Off sync | listener failed", e);
    }
  }
}

// ---------------------------------------------------------------- helpers

/** Names are matched case-insensitively with whitespace trimmed and collapsed. */
export const normName = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** "ab-c 2d" -> "ABC2D" (same rule as the site). */
const normCode = (s) => String(s ?? "").toUpperCase().replace(/[\s-]/g, "");

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function readConfig() {
  const get = (key) => game.settings.get(MODULE_ID, key);
  return {
    url: String(get("siteUrl") ?? "").trim().replace(/\/+$/, ""),
    token: String(get("token") ?? "").trim(),
    code: normCode(get("tableCode")),
    autoAssign: Boolean(get("autoAssign")),
  };
}

/**
 * Only one GM client may write, otherwise two logged-in GMs would both create
 * the secret journal. ASSUMPTION: `game.users.activeGM` (v11+) is the GM with
 * the lowest id among those online.
 */
function isActiveGM() {
  return game.user?.isGM === true && game.users.activeGM?.id === game.user.id;
}

// ------------------------------------------------------------------ fetch

async function fetchTable(cfg) {
  let base;
  try {
    base = new URL(cfg.url).origin + new URL(cfg.url).pathname.replace(/\/+$/, "");
  } catch {
    throw new Error(`"${cfg.url}" is not a valid site URL (include https://).`);
  }
  const url = `${base}/api/foundry/tables/${encodeURIComponent(cfg.code)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    // Bearer token, no cookies: the endpoint answers CORS with `*`.
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch {
    throw new Error(`Could not reach ${base} (offline, wrong URL, or timed out).`);
  } finally {
    clearTimeout(t);
  }
  if (res.status === 401) throw new Error("The site rejected the token. Check it matches FOUNDRY_TOKEN.");
  if (res.status === 503) throw new Error("The site has no FOUNDRY_TOKEN set.");
  if (res.status === 404) throw new Error(`No Tear-Off table with code ${cfg.code}.`);
  if (!res.ok) throw new Error(`The site answered ${res.status}.`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("The site's answer was not JSON. Is the URL the Tear-Off site?");
  }
  if (!data || !Array.isArray(data.cast)) throw new Error("Unexpected answer from the site.");
  return data;
}

// --------------------------------------------------------------- analysis

/**
 * ASSUMPTION: the export (src/lib/export/foundry.ts) writes
 * `flags.tearoff.{oneshot, character}`. We read `actor.flags.tearoff` directly
 * rather than actor.getFlag("tearoff", ...) because getFlag can throw for a
 * scope that isn't a module or system id.
 */
function findActor(oneshot, characterId) {
  return (
    game.actors.find((a) => {
      const f = a.flags?.tearoff;
      return f?.character === characterId && f?.oneshot === oneshot;
    }) ?? null
  );
}

function findUser(playerName) {
  const want = normName(playerName);
  return game.users.find((u) => normName(u.name) === want) ?? null;
}

const OWNER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

function secretKey(oneshot, characterId) {
  return `${oneshot}/${characterId}`;
}

function findSecretJournal(oneshot, characterId) {
  const key = secretKey(oneshot, characterId);
  return game.journal.find((j) => j.flags?.[MODULE_ID]?.secretFor === key) ?? null;
}

function secretHtml(secret) {
  return `<p><em>Your character's secret. Keep it from the rest of the table.</em></p><p>${esc(secret)}</p>`;
}

/** What the secret journal should look like for this row. */
function wantedJournal(row, oneshot) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  return {
    name: `Secret: ${row.actor.name}`,
    html: secretHtml(row.entry.secret),
    // Nobody by default, the claiming player may read (OBSERVER, not edit).
    // GMs always see everything.
    ownership: { default: L.NONE, [row.user.id]: L.OBSERVER },
    key: secretKey(oneshot, row.entry.id),
  };
}

function journalInSync(row, oneshot) {
  if (!row.entry.secret) return true;
  const j = findSecretJournal(oneshot, row.entry.id);
  if (!j) return false;
  const want = wantedJournal(row, oneshot);
  const have = j.ownership ?? {};
  const sameOwnership =
    Object.keys(want.ownership).every((k) => have[k] === want.ownership[k]) &&
    Object.keys(have).every((k) => k in want.ownership);
  const page = j.pages?.contents?.[0];
  return j.name === want.name && sameOwnership && page?.text?.content === want.html;
}

/**
 * One row per poster with what we'd do about it. status is one of:
 *   unclaimed  nobody has torn it
 *   no-actor   claimed, but no world actor carries the matching flags
 *   no-user    claimed, but no Foundry user has that name
 *   gm         the matching user is a GM (nothing to grant)
 *   pending    claimed and matched, but ownership or the journal is not set up yet
 *   assigned   done
 */
export function analyse(table) {
  return table.cast.map((entry) => {
    const row = { entry, actor: null, user: null, status: "unclaimed" };
    if (!entry.claimedBy) return row;
    row.actor = findActor(table.oneshot, entry.id);
    row.user = findUser(entry.claimedBy);
    if (!row.actor) row.status = "no-actor";
    else if (!row.user) row.status = "no-user";
    else if (row.user.isGM) row.status = "gm";
    else {
      const owned = row.actor.ownership?.[row.user.id] === OWNER();
      row.status = owned && journalInSync(row, table.oneshot) ? "assigned" : "pending";
    }
    return row;
  });
}

// ------------------------------------------------------------------ apply

/** Give the player the actor and their secret journal. Idempotent. */
async function apply(row, oneshot) {
  const { actor, user } = row;
  let granted = false;

  // ownership merges per key on update, so other users' levels are untouched.
  if (actor.ownership?.[user.id] !== OWNER()) {
    await actor.update({ ownership: { [user.id]: OWNER() } });
    granted = true;
    // Only fill an empty slot; never override a character the player already has.
    if (!user.character) await user.update({ character: actor.id });
  }

  await syncSecretJournal(row, oneshot);

  if (granted) {
    await ChatMessage.create({
      speaker: { alias: "Tear-Off" },
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
      content: `<p><strong>${esc(user.name)}</strong> tore <strong>${esc(actor.name)}</strong> and now owns the actor. Their secret is in the journal "Secret: ${esc(actor.name)}".</p>`,
    });
  }
}

async function syncSecretJournal(row, oneshot) {
  if (!row.entry.secret) return;
  const want = wantedJournal(row, oneshot);
  const j = findSecretJournal(oneshot, row.entry.id);
  // ASSUMPTION: CONST.JOURNAL_ENTRY_PAGES.FORMATS.HTML is 1 on v12 and v13.
  const htmlFormat = CONST.JOURNAL_ENTRY_PAGES?.FORMATS?.HTML ?? 1;

  if (!j) {
    await JournalEntry.create({
      name: want.name,
      ownership: want.ownership,
      flags: { [MODULE_ID]: { secretFor: want.key } },
      pages: [{ name: "Secret", type: "text", text: { content: want.html, format: htmlFormat } }],
    });
    return;
  }

  if (journalInSync(row, oneshot)) return;

  // If the poster changed hands, drop the previous player's access. A plain
  // ownership update would only merge keys and leave them able to read it.
  const ownership = { ...want.ownership };
  for (const k of Object.keys(j.ownership ?? {})) if (!(k in ownership)) ownership[`-=${k}`] = null;
  await j.update({ name: want.name, ownership });

  const page = j.pages?.contents?.[0];
  if (page) {
    if (page.text?.content !== want.html) await page.update({ "text.content": want.html });
  } else {
    await j.createEmbeddedDocuments("JournalEntryPage", [
      { name: "Secret", type: "text", text: { content: want.html, format: htmlFormat } },
    ]);
  }
}

/** Warn once per (poster, player, problem) about claims we can't match. */
function warnUnmatched(table) {
  for (const row of analyse(table)) {
    const { entry } = row;
    let text = null;
    if (row.status === "no-user")
      text = `${entry.claimedBy} tore ${entry.name} but there's no Foundry user called ${entry.claimedBy}.`;
    else if (row.status === "no-actor")
      text = `${entry.claimedBy} tore ${entry.name} but no actor for it is in this world (import the Foundry export from the sheet).`;
    if (!text) continue;
    const key = `${table.oneshot}|${entry.id}|${normName(entry.claimedBy)}|${row.status}`;
    if (notified.has(key)) continue;
    notified.add(key);
    ui.notifications.warn(`Tear-Off: ${text}`);
  }
}

async function applyAll(table) {
  warnUnmatched(table);
  for (const row of analyse(table)) {
    if (row.status !== "pending") continue;
    try {
      await apply(row, table.oneshot);
    } catch (e) {
      console.error(`Tear-Off sync | could not assign ${row.entry.id}`, e);
    }
  }
}

/** Assign one poster now (the board's button, for when auto-assign is off). */
export async function assignOne(characterId) {
  if (!isActiveGM() || !state.table) return;
  const row = analyse(state.table).find((r) => r.entry.id === characterId);
  if (!row || row.status !== "pending") return;
  try {
    await apply(row, state.table.oneshot);
  } catch (e) {
    console.error(`Tear-Off sync | could not assign ${characterId}`, e);
    ui.notifications.warn(`Tear-Off: could not assign ${row.entry.name}. See the console.`);
  }
  state.rows = analyse(state.table);
  emit();
}

// ------------------------------------------------------------------- loop

function fail(message) {
  state.error = message;
  // Tell the GM once per distinct problem, then stay quiet while it persists.
  if (lastWarned !== message) {
    lastWarned = message;
    ui.notifications.warn(`Tear-Off: ${message}`);
  }
  emit();
}

/** One poll. Safe to call any time; overlapping calls are dropped. */
export async function refresh() {
  if (!game.user?.isGM || running) return;
  running = true;
  const gen = generation; // settings changes bump this; drop results from before them
  try {
    const cfg = readConfig();
    if (!cfg.code) {
      state.table = null;
      state.rows = [];
      state.error = null;
      emit();
      return;
    }
    if (!cfg.url || !cfg.token) return fail("Set the site URL and token in the module settings.");

    let table;
    try {
      table = await fetchTable(cfg);
    } catch (e) {
      return gen === generation ? fail(e.message) : undefined;
    }
    if (gen !== generation) return;

    lastWarned = null;
    state.error = null;
    state.table = table;
    state.updatedAt = new Date();
    if (cfg.autoAssign && isActiveGM()) await applyAll(table);
    state.rows = analyse(table);
    emit();
  } catch (e) {
    console.error("Tear-Off sync | poll failed", e);
    fail("Something went wrong while syncing. See the console.");
  } finally {
    running = false;
  }
}

/** (Re)start polling. Does nothing on non-GM clients. */
export function start() {
  stop();
  if (!game.user?.isGM) return;
  const gen = generation;
  const tick = async () => {
    if (gen !== generation) return;
    await refresh();
    if (gen === generation) timer = setTimeout(tick, POLL_MS);
  };
  tick();
}

export function stop() {
  generation++;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Settings changed: forget per-table memory and poll right away. */
export function restart() {
  notified.clear();
  lastWarned = null;
  state.table = null;
  state.rows = [];
  state.error = null;
  emit();
  start();
}
