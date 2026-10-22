import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDbUrls } from "@/lib/dbUrl";
import { db } from "@/lib/prisma";
import { installTestUsers, sessionCookies } from "@/lib/testAuth";
import type { OneShotDoc } from "@/lib/oneShotCheck";
import { DbSpellStore } from "./dbSpellStore";
import { DbStore, KEEP_REVISIONS } from "./dbStore";
import { FileStore } from "./fileStore";
import { importOneShots, importSpells, importSurvivors } from "./importContent";
import { readSurvivors, saveSurvivors } from "./survivorStore";
import { PublishError, StoreError } from "./types";
import { OwnedStore } from "./owned";
import { DbOwnerBook } from "./owners";
import { Accounts, AccountError, toViewer } from "@/lib/users.server";
import { RateLimiter } from "@/lib/rateLimit.server";
import { handler as actionRoute } from "@/pages/api/admin/oneshots/[slug]/[action]";
import { handler as survivorRoute } from "@/pages/api/admin/survivors";
import type { Viewer } from "@/lib/accounts";
import { createGame, gameOneShot, gmPage } from "@/lib/games.server";
import { GUEST_COOKIE, signGuestPass, type GuestPass } from "@/lib/guestPass";
import tableRoute from "@/pages/api/tables/[code]/index";
import claimsRoute from "@/pages/api/tables/[code]/claims";
import lettersRoute from "@/pages/api/tables/[code]/letters";
import liveRoute from "@/pages/api/tables/[code]/live";
import secretsRoute from "@/pages/api/tables/[code]/secrets";
import flashbacksRoute from "@/pages/api/tables/[code]/flashbacks";
import epilogueRoute from "@/pages/api/tables/[code]/epilogue";
import tapestryRoute from "@/pages/api/tables/[code]/tapestry";
import stateRoute from "@/pages/api/tables/[code]/game";
import recordingsRoute from "@/pages/api/tables/[code]/recordings";
import gamesRoute from "@/pages/api/games/index";
import gameRoute from "@/pages/api/games/[code]";
import guestRoute from "@/pages/api/guest";
import { handler as joinRoute } from "@/pages/api/join";

/**
 * The database store, against the local Postgres in .env (`pnpm db:dev`) in a
 * schema of its own, `tearoff_test`, which this file migrates and empties:
 * the real tables are never touched. Every database test lives in this one
 * file, because `prisma dev` takes one connection at a time and vitest runs
 * files in parallel. That includes accounts (phase 10): invites, reset links,
 * the door's rate limit, and who owns which one-shot. Without a reachable database the tests are skipped
 * (loudly); start one with `pnpm db:dev`.
 */

const ROOT = process.cwd();
const TEST_SCHEMA = "tearoff_test";

function envFile(): Record<string, string> {
  const file = path.join(ROOT, ".env");
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const withSchema = (raw: string) => {
  const u = new URL(raw);
  u.searchParams.set("schema", TEST_SCHEMA);
  return u.toString();
};

const env = envFile();
const urls = resolveDbUrls({ DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL });
const local = urls.url ? ["localhost", "127.0.0.1"].includes(new URL(urls.url).hostname) : false;

/** Only ever a local database: these tests empty their tables. */
async function reachable(): Promise<boolean> {
  if (!urls.url || !local) return false;
  const u = new URL(urls.url);
  return new Promise((done) => {
    const sock = net.connect({ host: u.hostname, port: Number(u.port || 5432) });
    sock.setTimeout(1500);
    sock.on("connect", () => (sock.destroy(), done(true)));
    sock.on("error", () => done(false));
    sock.on("timeout", () => (sock.destroy(), done(false)));
  });
}

const up = await reachable();
if (!up) console.warn("\n[dbStore.test] SKIPPED: no local database (pnpm db:dev, and DATABASE_URL in .env pointing at localhost)\n");

const doc = (title: string, extra: Partial<OneShotDoc["oneshot"]> = {}): OneShotDoc => ({ oneshot: { title, system: "tencandles", ...extra }, cast: [], variants: [] });
const files = new FileStore({ root: path.join(ROOT, "content"), gate: () => ({ writable: false }) });
const gitDoc = async (slug: string) => (await files.get(slug))!.published!;

beforeAll(() => {
  if (!up) return;
  process.env.AUTH_SECRET = "test-secret";
  installTestUsers();
  process.env.DATABASE_URL = withSchema(urls.url!);
  process.env.DIRECT_URL = withSchema(urls.directUrl!);
  execSync("pnpm exec prisma migrate deploy", { cwd: ROOT, env: process.env, stdio: "pipe" });
}, 120_000);

beforeEach(async () => {
  vi.unstubAllEnvs();
  if (!up) return;
  const c = db();
  await c.game.deleteMany();
  await c.oneShot.deleteMany();
  await c.spell.deleteMany();
  await c.survivor.deleteMany();
  await c.authAttempt.deleteMany();
  await c.oneShotOwner.deleteMany();
  await c.user.deleteMany();
  await c.invite.deleteMany();
});

afterAll(async () => {
  if (up) await db().$disconnect();
});

describe.skipIf(!up)("DbStore against Postgres", () => {
  it("is writable everywhere, and says so", () => {
    expect(new DbStore().gate()).toEqual({ writable: true, kind: "db" });
  });

  it("refuses unsafe slugs before touching the database", async () => {
    const store = new DbStore();
    for (const bad of ["../escape", "a/b", "Upper", "", "trailing-"]) {
      await expect(store.saveDraft(bad, doc("x"))).rejects.toBeInstanceOf(StoreError);
      await expect(store.get(bad)).rejects.toBeInstanceOf(StoreError);
    }
    await expect(store.import("admin", doc("x"))).rejects.toThrow(/already a page/);
    expect(await db().oneShot.count()).toBe(0);
  });

  it("keeps drafts off the board until they pass every check, then publishes", async () => {
    await importSpells();
    const store = new DbStore();
    const slug = "lights-out-at-marrowby";
    const { pitch: _, ...noPitch } = (await gitDoc(slug)).oneshot; // eslint-disable-line @typescript-eslint/no-unused-vars
    await store.import(slug, { ...(await gitDoc(slug)), oneshot: noPitch });
    expect(await store.get(slug)).toMatchObject({ status: "draft", published: null });

    const err = await store.publish(slug).catch((e) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect((err as PublishError).issues.some((i) => i.path.join(".") === "oneshot.pitch")).toBe(true);
    expect((await store.get(slug))!.published).toBeNull();

    await store.saveDraft(slug, await gitDoc(slug));
    await store.publish(slug);
    const got = (await store.get(slug))!;
    expect(got).toMatchObject({ status: "published", draft: null });
    expect(got.published).toEqual(await gitDoc(slug));
    expect((await store.list())[0]).toMatchObject({ slug, status: "published", system: "tencandles", issueCount: 0 });

    // Edit → changed; discard → the published version, with the discarded draft kept in the history.
    await store.saveDraft(slug, { ...got.published!, oneshot: { ...got.published!.oneshot, title: "Edited" } });
    expect((await store.get(slug))!.status).toBe("changed");
    await store.discardDraft(slug);
    expect((await store.get(slug))!.status).toBe("published");
    expect((await store.history(slug))[0]).toMatchObject({ action: "discard", title: "Edited" });

    // Unpublish → a draft again; delete → gone, history and all.
    await store.unpublish(slug);
    expect(await store.get(slug)).toMatchObject({ status: "draft", published: null });
    await expect(store.discardDraft(slug)).rejects.toThrow(/never published/);
    await store.delete(slug);
    expect(await store.get(slug)).toBeNull();
    expect(await db().oneShotRevision.count({ where: { slug } })).toBe(0);
  });

  it("checks spells against the database's spell book", async () => {
    const store = new DbStore();
    const slug = "the-drowned-bell";
    await store.import(slug, await gitDoc(slug));
    const err = (await store.publish(slug).catch((e) => e)) as PublishError;
    expect(err).toBeInstanceOf(PublishError);
    expect(err.issues.map((i) => i.message).join(" ")).toMatch(/spell book/i);
    await importSpells();
    await store.publish(slug);
    expect((await store.get(slug))!.status).toBe("published");
  });

  it("duplicates into a new draft and won't reuse a slug", async () => {
    const store = new DbStore();
    await store.import("night-one", doc("Night One"));
    await store.duplicate("night-one", "night-two");
    expect((await store.get("night-two"))!.draft!.oneshot).toMatchObject({ title: "Night One (copy)", slug: "night-two" });
    await expect(store.duplicate("night-one", "night-two")).rejects.toThrow(/already exists/);
    await expect(store.duplicate("nope", "night-three")).rejects.toThrow(/doesn't exist/);
  });

  it("keeps one revision per minute of autosaves and the newest 50", async () => {
    let t = Date.parse("2026-10-21T10:00:00Z");
    const store = new DbStore({ now: () => new Date(t) });
    await store.import("night", doc("v0"));
    await store.saveDraft("night", doc("v1"));
    t += 20_000;
    await store.saveDraft("night", doc("v2"));
    let h = await store.history("night");
    expect(h.map((r) => [r.action, r.title])).toEqual([
      ["save", "v2"],
      ["import", "v0"],
    ]);
    t += 61_000;
    await store.saveDraft("night", doc("v3"));
    // Saving the same doc again writes nothing.
    t += 61_000;
    await store.saveDraft("night", doc("v3"));
    h = await store.history("night");
    expect(h.map((r) => r.title)).toEqual(["v3", "v2", "v0"]);

    for (let i = 4; i < KEEP_REVISIONS + 10; i++) {
      t += 61_000;
      await store.saveDraft("night", doc(`v${i}`));
    }
    h = await store.history("night");
    expect(h).toHaveLength(KEEP_REVISIONS);
    expect(h[0].title).toBe(`v${KEEP_REVISIONS + 9}`);
  }, 60_000);

  it("restores an earlier revision as the draft, and publishing puts it back on the board", async () => {
    await importSpells();
    let t = Date.parse("2026-10-21T10:00:00Z");
    const store = new DbStore({ now: () => new Date((t += 61_000)) });
    const slug = "lights-out-at-marrowby";
    const v1 = await gitDoc(slug);
    await store.import(slug, v1);
    await store.publish(slug);
    await store.saveDraft(slug, { ...v1, oneshot: { ...v1.oneshot, title: "Lights Out, Again" } });
    await store.publish(slug);
    expect((await store.get(slug))!.published!.oneshot.title).toBe("Lights Out, Again");

    const first = (await store.history(slug)).find((r) => r.action === "publish" && r.title === "Lights Out at Marrowby")!;
    await store.restore(slug, first.id);
    const got = (await store.get(slug))!;
    expect(got.status).toBe("changed");
    expect(got.draft!.oneshot.title).toBe("Lights Out at Marrowby");
    expect(got.published!.oneshot.title).toBe("Lights Out, Again");
    await store.publish(slug);
    expect((await store.get(slug))!.published).toEqual(v1);
    expect((await store.history(slug)).slice(0, 2).map((r) => r.action)).toEqual(["publish", "restore"]);

    await expect(store.restore(slug, "not-a-revision")).rejects.toThrow(/isn't in this one-shot's history/);
    await store.import("other", doc("Other"));
    await expect(store.restore("other", first.id)).rejects.toThrow(/isn't in this one-shot's history/);
  });

  it("keeps JSON key order, so an export reads like the files", async () => {
    const store = new DbStore();
    const slug = "the-drowned-bell";
    await store.import(slug, await gitDoc(slug));
    const out = (await store.export(slug))!;
    expect(Object.keys(out.oneshot)).toEqual(Object.keys((await gitDoc(slug)).oneshot));
    expect(Object.keys(out.cast[0].mech as object)).toEqual(Object.keys((await gitDoc(slug)).cast[0].mech as object));
  });
});

describe.skipIf(!up)("DbSpellStore", () => {
  const NEW = { level: 1, school: "divination", time: "Action", range: "Self", components: "V", duration: "Instantaneous", concentration: false, ritual: false, text: "You know which way is north, and roughly how far it is to the sea." };

  it("adds, refuses a taken name, validates, and won't delete a spell in use", async () => {
    const spells = new DbSpellStore();
    expect(spells.gate()).toEqual({ writable: true, kind: "db" });
    await spells.put("Know North", NEW, { create: true });
    expect(await spells.get("Know North")).toMatchObject({ level: 1 });
    await expect(spells.put("Know North", NEW, { create: true })).rejects.toThrow(/already in the spell book/);
    await expect(spells.put("Know North", { ...NEW, text: "short" })).rejects.toBeInstanceOf(StoreError);
    await spells.put("Know North", { ...NEW, level: 2 });
    expect((await spells.get("Know North"))!.level).toBe(2);

    await importSpells();
    await new DbStore().import("the-drowned-bell", await gitDoc("the-drowned-bell"));
    expect(await spells.usedBy("Guidance")).toEqual(["the-drowned-bell"]);
    await expect(spells.delete("Guidance")).rejects.toThrow(/used by the-drowned-bell/);
    await spells.delete("Know North");
    expect(await spells.get("Know North")).toBeNull();
    await expect(spells.delete("Know North")).rejects.toThrow(/isn't in the spell book/);
  });
});

describe.skipIf(!up)("the shared world in the database", () => {
  const record = (id: string, extra = {}) => ({
    id,
    oneshot: id.split("/")[0],
    oneshotTitle: "The Drowned Bell",
    characterId: id.split("/")[1],
    name: "Wren",
    epithet: "the bell-ringer",
    fate: "survived",
    date: id.split("/")[2],
    ...extra,
  });

  it("saves records, updates them on a second save, and refuses bad ones", async () => {
    await expect(saveSurvivors([{ id: "nope" }])).rejects.toBeInstanceOf(StoreError);
    expect(await saveSurvivors([record("the-drowned-bell/wren/2026-10-20")])).toEqual({ saved: ["the-drowned-bell/wren/2026-10-20"], skipped: [] });
    expect(await saveSurvivors([record("the-drowned-bell/wren/2026-10-20")])).toEqual({ saved: [], skipped: ["the-drowned-bell/wren/2026-10-20"] });
    await saveSurvivors([record("the-drowned-bell/wren/2026-10-20", { title: "Bell-thief" })]);
    expect(await readSurvivors()).toEqual([record("the-drowned-bell/wren/2026-10-20", { title: "Bell-thief" })]);
  });

  it("lets only the GM save, and revalidates the board and the job pages", async () => {
    vi.stubEnv("TEAROFF_STORE", "db");
    vi.stubEnv("NODE_ENV", "production");
    await importSpells();
    await importOneShots();
    const records = [record("the-drowned-bell/wren/2026-10-21")];
    for (const role of ["table", null] as const) {
      const res = await call(survivorRoute, { role, method: "POST", body: { records } });
      expect(res.statusCode).toBe(role ? 403 : 401);
    }
    expect(await readSurvivors()).toEqual([]);
    const res = await call(survivorRoute, { role: "gm", method: "POST", body: { records } });
    expect(res).toMatchObject({ statusCode: 200, body: { saved: ["the-drowned-bell/wren/2026-10-21"] } });
    expect(res.revalidated).toEqual(expect.arrayContaining(["/", "/the-drowned-bell", "/lights-out-at-marrowby"]));
    expect(await readSurvivors()).toHaveLength(1);
  });
});

describe.skipIf(!up)("importing git content", () => {
  it("copies everything once, and a second run changes nothing", async () => {
    const first = [await importSpells(), await importSurvivors(), await importOneShots()];
    expect(first[0].written.length).toBeGreaterThan(50);
    expect(first[2].written).toEqual(["a-vow-before-dawn", "lights-out-at-marrowby", "lot-thirteen", "open-in-case-of-future", "the-cooling-concord", "the-drowned-bell"]);
    expect(first.flatMap((r) => r.failed)).toEqual([]);
    const store = new DbStore();
    for (const s of await store.list()) expect(s.status).toBe("published");
    const revisions = await db().oneShotRevision.count();

    const again = [await importSpells(), await importSurvivors(), await importOneShots()];
    expect(again.flatMap((r) => r.written)).toEqual([]);
    expect(again[2].skipped).toHaveLength(6);
    expect(await db().oneShotRevision.count()).toBe(revisions);

    // --overwrite leaves identical ones alone and puts git's version back over an edit.
    const slug = "lights-out-at-marrowby";
    const git = await gitDoc(slug);
    await store.saveDraft(slug, { ...git, oneshot: { ...git.oneshot, title: "Edited in the builder" } });
    await store.publish(slug);
    const over = await importOneShots({ overwrite: true });
    expect(over.written).toEqual([slug]);
    expect((await store.get(slug))!.published).toEqual(git);
    expect((await importOneShots({ overwrite: true })).written).toEqual([]);
  }, 60_000);
});

describe.skipIf(!up)("history over the API", () => {
  it("is GM-only, and restore makes the revision the draft", async () => {
    const store = new DbStore();
    await store.import("night", doc("First"));
    await store.saveDraft("night", doc("Second"));
    for (const role of ["table", null] as const) {
      expect((await call(actionRoute, { role, method: "GET", query: { slug: "night", action: "history" } }, store)).statusCode).toBe(role ? 403 : 401);
      expect((await call(actionRoute, { role, method: "POST", query: { slug: "night", action: "restore" }, body: { revision: "x" } }, store)).statusCode).toBe(role ? 403 : 401);
    }
    const h = await call(actionRoute, { role: "gm", method: "GET", query: { slug: "night", action: "history" } }, store);
    const revisions = (h.body as { revisions: { id: string; title: string }[] }).revisions;
    expect(revisions.map((r) => r.title)).toEqual(["Second", "First"]);
    const r = await call(actionRoute, { role: "gm", method: "POST", query: { slug: "night", action: "restore" }, body: { revision: revisions[1].id } }, store);
    expect(r.statusCode).toBe(200);
    expect((await store.get("night"))!.draft!.oneshot.title).toBe("First");
  });

  it("revalidates the board and every page of a one-shot on publish and unpublish", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await importSpells();
    const store = new DbStore();
    const slug = "lights-out-at-marrowby";
    await store.import(slug, await gitDoc(slug));
    const pub = await call(actionRoute, { role: "gm", method: "POST", query: { slug, action: "publish" } }, store);
    expect(pub.statusCode).toBe(200);
    expect(pub.revalidated).toEqual(expect.arrayContaining(["/", `/${slug}`, `/${slug}/play`, `/${slug}/tv`, `/${slug}/epilogue`]));
    expect(pub.revalidated).not.toContain(`/${slug}/cards`);
    const unpub = await call(actionRoute, { role: "gm", method: "POST", query: { slug, action: "unpublish" } }, store);
    // The pages it had before are rebuilt (as 404s).
    expect(unpub.revalidated).toEqual(pub.revalidated);
  });
});

type Res = { statusCode: number; body: unknown; revalidated: string[] };

async function call<S>(
  route: (req: NextApiRequest, res: NextApiResponse, injected?: S) => Promise<unknown>,
  opts: { role: "gm" | "table" | null; method: string; query?: Record<string, string>; body?: unknown },
  injected?: S,
): Promise<Res> {
  const cookies = await sessionCookies(opts.role);
  const out: Res = { statusCode: 200, body: undefined, revalidated: [] };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    send(body: unknown) {
      out.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
    async revalidate(p: string) {
      out.revalidated.push(p);
    },
  };
  const req = { method: opts.method, query: opts.query ?? {}, body: opts.body, cookies, headers: {} };
  await route(req as unknown as NextApiRequest, res as unknown as NextApiResponse, injected);
  return out;
}

// ---- Accounts (phase 10) ----

const PW = "a long enough password";
const at = (iso: string) => () => new Date(iso);

async function person(username: string, extra: { role?: "admin" | "member"; author?: boolean; canInvite?: boolean } = {}) {
  return new Accounts().createUser({ username, password: PW, displayName: username, ...extra });
}

async function refusedWith(p: Promise<unknown>, status: number, message?: RegExp) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AccountError);
  expect((e as AccountError).status).toBe(status);
  if (message) expect((e as AccountError).message).toMatch(message);
}

describe.skipIf(!up)("invites", () => {
  it("lets one person in with a single-use invite, then refuses it", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const accounts = new Accounts();
    const { code } = await accounts.makeInvite(admin, { maxUses: 1, days: 1, grantsAuthor: true });
    const wren = await accounts.join(code, { username: "Wren", password: PW, displayName: "Wren", pronouns: "she/her" }, "ip-1");
    expect(wren).toMatchObject({ username: "Wren", usernameLower: "wren", author: true, role: "member", invitedById: admin.id, pronouns: "she/her" });
    await refusedWith(accounts.join(code, { username: "Second", password: PW, displayName: "Second" }, "ip-1"), 410, /used up/);
    expect(await db().user.findUnique({ where: { usernameLower: "second" } })).toBeNull();
    expect((await db().invite.findUnique({ where: { code } }))!.uses).toBe(1);
  });

  it("counts uses on a multi-use invite and stops at the limit", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const accounts = new Accounts();
    const { code } = await accounts.makeInvite(admin, { maxUses: 2, days: 7 });
    await accounts.join(code, { username: "one", password: PW, displayName: "One" }, "ip");
    await accounts.join(code, { username: "two", password: PW, displayName: "Two" }, "ip");
    await refusedWith(accounts.join(code, { username: "three", password: PW, displayName: "Three" }, "ip"), 410, /used up/);
  });

  it("refuses an expired or taken-down invite, and a name that's taken in any case", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const accounts = new Accounts({ now: at("2026-10-21T12:00:00Z") });
    const { code } = await accounts.makeInvite(admin, { maxUses: 5, days: 1 });
    const later = new Accounts({ now: at("2026-10-22T12:00:01Z") });
    await refusedWith(later.join(code, { username: "late", password: PW, displayName: "Late" }, "ip"), 410, /expired/);
    expect((await later.inviteInfo(code)).problem).toMatch(/expired/);

    const now = new Accounts();
    const fresh = await now.makeInvite(admin, { maxUses: 5, days: 1 });
    await refusedWith(now.join(fresh.code, { username: "BARKEEP", password: PW, displayName: "Copycat" }, "ip"), 409, /already/);
    // The refused sign-up didn't use the invite up.
    expect((await db().invite.findUnique({ where: { code: fresh.code } }))!.uses).toBe(0);
    const inv = await db().invite.findUnique({ where: { code: fresh.code } });
    await now.revokeInvite(admin, inv!.id);
    await refusedWith(now.join(fresh.code, { username: "after", password: PW, displayName: "After" }, "ip"), 410, /taken down/);
  });

  it("lets a member an admin allows make single-use, week-long invites without the badge", async () => {
    const member = toViewer(await person("Pip", { canInvite: true }));
    const nobody = toViewer(await person("Moss"));
    const accounts = new Accounts();
    await refusedWith(accounts.makeInvite(nobody, {}), 403);
    const inv = await accounts.makeInvite(member, { maxUses: 10, days: 30, grantsAuthor: true });
    const row = await db().invite.findUnique({ where: { code: inv.code } });
    expect(row).toMatchObject({ maxUses: 1, grantsAuthor: false });
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 5000);
    expect((await accounts.listInvites(member)).map((i) => i.code)).toEqual([inv.code]);
  });
});

describe.skipIf(!up)("signing in", () => {
  it("checks the password, case-insensitively on the name", async () => {
    await person("Rook");
    const accounts = new Accounts();
    expect((await accounts.authenticate("ROOK", PW, "ip")).ok).toBe(true);
    expect(await accounts.authenticate("rook", "wrong password!", "ip")).toEqual({ ok: false, reason: "bad" });
    expect(await accounts.authenticate("nobody", PW, "ip")).toEqual({ ok: false, reason: "bad" });
  });

  it("shuts the door on a name after five wrong passwords, even for the right one, and opens it again later", async () => {
    await person("Rook");
    let t = Date.parse("2026-10-21T12:00:00Z");
    const limiter = new RateLimiter(db, () => t);
    const accounts = new Accounts({ limiter });
    for (let i = 0; i < 5; i++) expect((await accounts.authenticate("rook", `wrong ${i} password`, "ip-a")).ok).toBe(false);
    expect(await accounts.authenticate("rook", PW, "ip-b")).toEqual({ ok: false, reason: "limited" });
    t += 16 * 60 * 1000;
    expect((await accounts.authenticate("rook", PW, "ip-b")).ok).toBe(true);
  });

  it("refuses a closed account, and its session stops counting", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const moss = await person("Moss");
    const accounts = new Accounts();
    expect(await accounts.viewer(moss.id, 0)).not.toBeNull();
    await accounts.setAccess(admin, moss.id, { disabled: true });
    expect(await accounts.viewer(moss.id, 0)).toBeNull();
    expect(await accounts.viewer(moss.id, 1)).toBeNull();
    expect(await accounts.authenticate("moss", PW, "ip")).toEqual({ ok: false, reason: "bad" });
  });
});

describe.skipIf(!up)("reset links and passwords", () => {
  it("work once, end every session, and set the new password", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const rook = await person("Rook");
    const accounts = new Accounts();
    const { token } = await accounts.makeReset(admin, rook.id);
    expect(await accounts.resetInfo(token)).toEqual({ problem: null, username: "Rook" });
    // Only the hash is kept.
    expect(JSON.stringify(await db().passwordReset.findMany())).not.toContain(token);
    await accounts.useReset(token, "a brand new password", "ip");
    expect(await accounts.viewer(rook.id, 0)).toBeNull();
    expect(await accounts.viewer(rook.id, 1)).not.toBeNull();
    expect((await accounts.authenticate("rook", "a brand new password", "ip")).ok).toBe(true);
    expect((await accounts.authenticate("rook", PW, "ip")).ok).toBe(false);
    await refusedWith(accounts.useReset(token, "another new password", "ip"), 410, /already been used/);
    await refusedWith(accounts.useReset("not-a-token", "another new password", "ip"), 410);
  });

  it("expire, and a newer link replaces an older one", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const rook = await person("Rook");
    const accounts = new Accounts({ now: at("2026-10-21T12:00:00Z") });
    const first = await accounts.makeReset(admin, rook.id);
    expect((await new Accounts({ now: at("2026-10-23T12:00:01Z") }).resetInfo(first.token)).problem).toMatch(/expired/);
    const second = await accounts.makeReset(admin, rook.id);
    expect((await accounts.resetInfo(first.token)).problem).toMatch(/expired/);
    expect((await accounts.resetInfo(second.token)).problem).toBeNull();
    await refusedWith(accounts.makeReset(toViewer(rook), admin.id), 403);
  });

  it("changing your own password needs the current one and signs you out elsewhere", async () => {
    const rook = await person("Rook");
    const accounts = new Accounts();
    await refusedWith(accounts.changePassword(rook.id, "not my password", "a brand new password"), 400);
    await refusedWith(accounts.changePassword(rook.id, PW, "short"), 400);
    const after = await accounts.changePassword(rook.id, PW, "a brand new password");
    expect(after.tokenVersion).toBe(1);
  });
});

describe.skipIf(!up)("the people page's rules", () => {
  it("keeps one admin, and an admin can't demote or close themselves", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const pip = await person("Pip");
    const accounts = new Accounts();
    await refusedWith(accounts.setAccess(admin, admin.id, { role: "member" }), 409);
    await refusedWith(accounts.setAccess(admin, admin.id, { disabled: true }), 409);
    await refusedWith(accounts.setAccess(toViewer(pip), admin.id, { role: "member" }), 403);
    const promoted = await accounts.setAccess(admin, pip.id, { role: "admin", author: true });
    expect(promoted).toMatchObject({ role: "admin", author: true, tokenVersion: 0 });
    // Now there are two, Pip can be demoted again, and losing admin ends Pip's sessions.
    const demoted = await accounts.setAccess(admin, pip.id, { role: "member" });
    expect(demoted).toMatchObject({ role: "member", tokenVersion: 1 });
  });
});

describe.skipIf(!up)("ownership in the database", () => {
  it("records who made a one-shot, and lets authors touch only their own", async () => {
    const admin = toViewer(await person("Barkeep", { role: "admin" }));
    const quill = toViewer(await person("Quill", { author: true }));
    const nib = toViewer(await person("Nib", { author: true }));
    const store = new DbStore({ spells: async () => ({}) });
    await new OwnedStore(store, quill).import("quills-night", doc("Quill's Night"));
    await new OwnedStore(store, nib).saveDraft("nibs-night", doc("Nib's Night"));
    expect((await db().oneShot.findUnique({ where: { slug: "quills-night" } }))!.ownerId).toBe(quill.id);
    expect((await db().oneShot.findUnique({ where: { slug: "nibs-night" } }))!.ownerId).toBe(nib.id);

    const asQuill = new OwnedStore(store, quill);
    expect((await asQuill.list()).map((s) => s.slug)).toEqual(["quills-night"]);
    await expect(asQuill.saveDraft("nibs-night", doc("Mine now"))).rejects.toMatchObject({ status: 403 });
    await expect(asQuill.delete("nibs-night")).rejects.toMatchObject({ status: 403 });
    await expect(asQuill.restore!("nibs-night", "x")).rejects.toMatchObject({ status: 403 });
    await expect(asQuill.history!("nibs-night")).rejects.toMatchObject({ status: 404 });
    expect((await store.get("nibs-night"))!.draft!.oneshot.title).toBe("Nib's Night");
    expect((await new OwnedStore(store, admin).list()).length).toBe(2);
  });

  it("hands everything unowned to the first admin", async () => {
    await new DbStore({ spells: async () => ({}) }).import("old-night", doc("From before accounts"));
    expect((await db().oneShot.findUnique({ where: { slug: "old-night" } }))!.ownerId).toBeNull();
    const admin = await person("Barkeep", { role: "admin" });
    expect(await new Accounts().claimUnowned(admin.id)).toBe(1);
    expect((await db().oneShot.findUnique({ where: { slug: "old-night" } }))!.ownerId).toBe(admin.id);
  });

  it("keeps a file one-shot's owner in the database too", async () => {
    const quill = await person("Quill", { author: true });
    const book = new DbOwnerBook();
    await book.set("some-night", quill.id);
    expect(await book.get("some-night")).toBe(quill.id);
    expect((await book.all()).get("some-night")).toBe(quill.id);
    await book.set("some-night", null);
    expect(await book.get("some-night")).toBeNull();
  });
});

/**
 * The phase 11 migration (tables become games) on a scratch schema of its
 * own: every migration before it, then rows in the old shape, then the real
 * SQL file, and what the rows became. Run once with an admin and once without.
 */
describe.skipIf(!up)("the games migration", () => {
  const MIGRATIONS = path.join(ROOT, "prisma", "migrations");
  const GAMES = "20261023000000_games";
  const statements = (file: string) =>
    fs
      .readFileSync(path.join(MIGRATIONS, file, "migration.sql"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      // One connection, one implicit transaction per statement: BEGIN/COMMIT are for migrate deploy.
      .filter((s) => s && s !== "BEGIN" && s !== "COMMIT");

  async function migrated(withAdmin: boolean) {
    const { PrismaClient } = await import("@prisma/client");
    await db().$disconnect(); // prisma dev takes one connection at a time
    const u = new URL(urls.url!);
    u.searchParams.set("schema", "tearoff_migtest");
    const c = new PrismaClient({ datasourceUrl: u.toString() });
    try {
      await c.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "tearoff_migtest" CASCADE`);
      await c.$executeRawUnsafe(`CREATE SCHEMA "tearoff_migtest"`);
      const before = fs.readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d) && d < GAMES).sort();
      for (const m of before) for (const s of statements(m)) await c.$executeRawUnsafe(s);

      const run = (sql: string) => c.$executeRawUnsafe(sql);
      await run(`INSERT INTO "User" ("id","username","usernameLower","displayName","passwordHash","role","updatedAt","createdAt") VALUES
        ('m1','sam','sam','Sam','x','member',now(),'2026-01-01'),
        ${withAdmin ? `('a2','late','late','Late Admin','x','admin',now(),'2026-03-01'), ('a1','rook','rook','Rook','x','admin',now(),'2026-02-01'),` : ""}
        ('m2','ash','ash','Ash','x','member',now(),'2026-01-02')`);
      await run(`INSERT INTO "Table" ("id","code","oneshot","createdAt") VALUES
        ('t1','ABCDE','lot-thirteen','2026-05-01T19:00:00Z'), ('t2','FGHJK','the-drowned-bell','2026-06-01T19:00:00Z'), ('t3','LMNPQ','lot-thirteen','2026-07-01T19:00:00Z')`);
      await run(`INSERT INTO "Claim" ("id","tableId","characterId","playerId","playerName","claimedAt") VALUES
        ('c1','t1','rook','0123456789abcdef0123456789abcdef','Sam','2026-05-01T19:05:00Z'), ('c2','t2','tide','fedcba9876543210fedcba9876543210','Ash','2026-06-01T19:05:00Z')`);
      await run(`INSERT INTO "Game" ("id","tableId","system","state","version","updatedAt") VALUES ('g1','t2','tencandles','{"players":[{"playerId":"fedcba9876543210fedcba9876543210","name":"Ash"}]}',3,now())`);
      await run(`INSERT INTO "TableEvent" ("tableId","kind","byPlayer","toPlayer","hidden","data","createdAt") VALUES
        ('t1','roll','0123456789abcdef0123456789abcdef',NULL,false,'{"total":20}','2026-05-01T22:30:00Z'), ('t1','note',NULL,'0123456789abcdef0123456789abcdef',false,'{"text":"psst"}','2026-05-01T21:00:00Z')`);
      await run(`INSERT INTO "Delivery" ("id","tableId","letterId","characterId") VALUES ('d1','t1','rook-1','rook')`);
      await run(`INSERT INTO "Flashback" ("id","tableId","characterId","playerId","answer","updatedAt") VALUES ('f1','t1','rook','0123456789abcdef0123456789abcdef','The sea.',now())`);
      await run(`INSERT INTO "Recording" ("id","tableId","playerId","mime","text","size") VALUES ('r1','t2','fedcba9876543210fedcba9876543210','text/plain','bye',3)`);
      await run(`INSERT INTO "Epilogue" ("id","tableId","data","tapestry","updatedAt") VALUES ('e1','t3','{}','{}','2026-07-02T09:00:00Z')`);

      for (const s of statements(GAMES)) await c.$executeRawUnsafe(s);
      const games = await c.game.findMany({ orderBy: { code: "asc" }, include: { claims: true, deliveries: true, flashbacks: true, recordings: true, events: { orderBy: { id: "asc" } }, epilogue: true, state: true } });
      const spoilers = await c.spoiler.findMany({ orderBy: { oneshot: "asc" } });
      const drift = await c.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'tearoff_migtest' AND tablename = 'Table'`);
      return { games, spoilers, tableLeft: Number(drift[0].n) };
    } finally {
      await c.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "tearoff_migtest" CASCADE`).catch(() => {});
      await c.$disconnect();
    }
  }

  it("makes every table a finished game run by the first admin, and every claim a guest seat", async () => {
    const { games, spoilers, tableLeft } = await migrated(true);
    expect(tableLeft).toBe(0);
    expect(games.map((g) => [g.code, g.oneshot, g.gmId, g.status])).toEqual([
      ["ABCDE", "lot-thirteen", "a1", "finished"],
      ["FGHJK", "the-drowned-bell", "a1", "finished"],
      ["LMNPQ", "lot-thirteen", "a1", "epilogued"],
    ]);
    const [t1, t2, t3] = games;
    // Finished when the last thing happened at it.
    expect(t1.startedAt?.toISOString()).toBe("2026-05-01T19:00:00.000Z");
    expect(t1.finishedAt?.toISOString()).toBe("2026-05-01T22:30:00.000Z");
    expect(t3.finishedAt?.toISOString()).toBe("2026-07-02T09:00:00.000Z");
    // Unpinned: they play whatever is published.
    expect(games.every((g) => g.content === null && g.pinnedAt === null)).toBe(true);
    // Guest seats under the same browser key, so their history can still be claimed.
    expect(t1.claims).toMatchObject([{ characterId: "rook", playerId: "0123456789abcdef0123456789abcdef", playerName: "Sam", userId: null }]);
    expect(t1.events.map((e) => [e.kind, e.byPlayer, e.toPlayer])).toEqual([
      ["roll", "0123456789abcdef0123456789abcdef", null],
      ["note", null, "0123456789abcdef0123456789abcdef"],
    ]);
    expect(t1.deliveries).toMatchObject([{ letterId: "rook-1", characterId: "rook" }]);
    expect(t1.flashbacks).toMatchObject([{ answer: "The sea." }]);
    expect(t2.state).toMatchObject({ system: "tencandles", version: 3 });
    expect(t2.recordings).toMatchObject([{ text: "bye" }]);
    expect(t3.epilogue).not.toBeNull();
    // The admin who ran them knows their secrets, once per one-shot.
    expect(spoilers.map((s) => [s.userId, s.oneshot])).toEqual([
      ["a1", "lot-thirteen"],
      ["a1", "the-drowned-bell"],
    ]);
  }, 120_000);

  it("leaves them to the admins when there's no admin yet", async () => {
    const { games, spoilers } = await migrated(false);
    expect(games.map((g) => [g.gmId, g.status])).toEqual([
      [null, "finished"],
      [null, "finished"],
      [null, "epilogued"],
    ]);
    expect(spoilers).toEqual([]);
  }, 120_000);
});

// ---- Games (phase 11) ----

/** A request's caller at a game: an account, a guest pass, or nobody. */
type Who = Viewer | { guest: GuestPass } | null;
type Hit = { statusCode: number; body: unknown; cookies: string[] };

async function hit(route: (req: NextApiRequest, res: NextApiResponse) => unknown, who: Who, opts: { method: string; query?: Record<string, string>; body?: unknown }): Promise<Hit> {
  const cookies: Record<string, string> =
    who && "guest" in who ? { [GUEST_COOKIE]: encodeURIComponent(await signGuestPass(who.guest, process.env.AUTH_SECRET!)) } : await sessionCookies(who);
  const out: Hit = { statusCode: 200, body: undefined, cookies: [] };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    send(body: unknown) {
      out.body = body;
      return res;
    },
    setHeader(k: string, v: string) {
      if (k.toLowerCase() === "set-cookie") out.cookies.push(v);
      return res;
    },
  };
  const header = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const req = { method: opts.method, query: opts.query ?? {}, body: opts.body, cookies, headers: header ? { cookie: header } : {} };
  await route(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return out;
}

describe.skipIf(!up)("games", () => {
  const PARANOIA = "open-in-case-of-future";
  const CANDLES = "lights-out-at-marrowby";
  let gm: Viewer, co: Viewer, other: Viewer, admin: Viewer, stranger: Viewer;
  const sam = (code: string, key = "0123456789abcdef0123456789abcdef"): { guest: GuestPass } => ({
    guest: { code, oneshot: PARANOIA, key, name: "Sam", exp: Math.floor(Date.now() / 1000) + 3600 },
  });

  async function publish(slug: string, change?: (d: OneShotDoc) => void) {
    const store = new DbStore();
    const d = await gitDoc(slug);
    change?.(d);
    if (await store.get(slug)) await store.saveDraft(slug, d);
    else await store.import(slug, d);
    await store.publish(slug);
  }

  async function newGame(slug = PARANOIA) {
    const g = await createGame(gm, slug);
    return g!.code;
  }

  beforeEach(async () => {
    vi.stubEnv("TEAROFF_STORE", "db");
    gm = toViewer(await person("Mags"));
    co = toViewer(await person("Cobb"));
    other = toViewer(await person("Ollie"));
    stranger = toViewer(await person("Stray"));
    admin = toViewer(await person("Boss", { role: "admin", canInvite: true }));
    installTestUsers([gm, co, other, stranger, admin]);
    await publish(PARANOIA);
  });

  it("runs any published job with you as GM, pinned to what's published, and you know its secrets", async () => {
    const r = await hit(gamesRoute, other, { method: "POST", body: { oneshot: PARANOIA } });
    expect(r.statusCode).toBe(201);
    const code = (r.body as { code: string }).code;
    const row = await db().game.findUniqueOrThrow({ where: { code } });
    expect([row.gmId, row.status]).toEqual([other.id, "open"]);
    expect(row.content).not.toBeNull();
    expect(row.pinnedAt).not.toBeNull();
    expect(await db().spoiler.findMany({ where: { userId: other.id } })).toMatchObject([{ oneshot: PARANOIA }]);
    // A date makes it planned; the seats open when the GM says.
    const later = await hit(gamesRoute, other, { method: "POST", body: { oneshot: PARANOIA, scheduledAt: "2026-11-01T19:00:00.000Z", seats: 4 } });
    expect(later.body).toMatchObject({ status: "planned", seats: 4, scheduledAt: "2026-11-01T19:00:00.000Z" });
    expect((await hit(gamesRoute, other, { method: "POST", body: { oneshot: "no-such-job" } })).statusCode).toBe(404);
    expect((await hit(gamesRoute, null, { method: "POST", body: { oneshot: PARANOIA } })).statusCode).toBe(401);
  });

  it("gives the GM's side of every table API to the game's GM and co-GMs, a look to admins, and nothing to anyone else", async () => {
    const code = await newGame();
    const q = { code };
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "addCoGm", username: "Cobb" } })).statusCode).toBe(200);
    // Seats: Ollie holds Gloria, a guest holds Penny.
    expect((await hit(claimsRoute, other, { method: "POST", query: q, body: { characterId: "gloria-pop" } })).statusCode).toBe(201);
    expect((await hit(claimsRoute, sam(code), { method: "POST", query: q, body: { characterId: "penny-buy" } })).statusCode).toBe(201);

    const status = async (route: Parameters<typeof hit>[0], who: Who, opts: Parameters<typeof hit>[2]) => (await hit(route, who, opts)).statusCode;
    const ok = (n: number) => n >= 200 && n < 300;
    const everyone: [string, Who][] = [["gm", gm], ["co-GM", co], ["admin", admin], ["member", stranger], ["player", other], ["guest", sam(code)], ["nobody", null]];
    const runs = new Set(["gm", "co-GM"]);
    for (const [name, who] of everyone) {
      const acts = runs.has(name);
      // Sealed letters: only those who run it hand them out (and take them back).
      expect(ok(await status(lettersRoute, who, { method: "POST", query: q, body: { letterId: "the-sprinkles-crate" } })), `${name} delivers`).toBe(acts);
      // The live log's GM-only moves: Friend Computer speaks, the act card goes up.
      expect(ok(await status(liveRoute, who, { method: "POST", query: q, body: { action: { type: "computer", text: "Hello, citizen." } } })), `${name} as the Computer`).toBe(acts);
      expect(ok(await status(liveRoute, who, { method: "POST", query: q, body: { action: { type: "act", index: 0 } } })), `${name} raises the curtain`).toBe(acts);
      // The broadsheet and the tapestry's edits.
      expect(ok(await status(epilogueRoute, who, { method: "PUT", query: q, body: { epilogue: { date: "2026-10-21", headline: "", subhead: "", lead: "", entries: {} } } })), `${name} sets the front page`).toBe(acts);
      expect(ok(await status(epilogueRoute, who, { method: "PATCH", query: q, body: { tapestry: { dropped: [], titles: {} } } })), `${name} edits the tapestry`).toBe(acts);
      // The game's own controls.
      expect(ok(await status(gameRoute, who, { method: "PATCH", query: q, body: { op: "schedule", scheduledAt: null, seats: null } })), `${name} reschedules`).toBe(acts);
      // Reading the GM's side: every secret, every flashback, the tapestry's edits, the game's controls.
      const looks = acts || name === "admin";
      const secrets = (await hit(secretsRoute, who, { method: "GET", query: q })).body as { secrets?: Record<string, unknown> };
      expect(Object.keys(secrets.secrets ?? {}).length === 5, `${name} sees every secret`).toBe(looks);
      const tapestry = (await hit(tapestryRoute, who, { method: "GET", query: q })).body as { gm?: boolean };
      expect(tapestry.gm ?? false, `${name} sees the tapestry's edits`).toBe(looks);
      const detail = (await hit(gameRoute, who, { method: "GET", query: q })).body as { members?: unknown };
      expect("members" in (detail ?? {}), `${name} sees the controls`).toBe(looks);
    }
    // Pinning someone else's poster back up is the GM's.
    expect(await status(claimsRoute, stranger, { method: "DELETE", query: { ...q, characterId: "gloria-pop" } })).toBe(403);
    expect(await status(claimsRoute, admin, { method: "DELETE", query: { ...q, characterId: "gloria-pop" } })).toBe(403);
    expect(await status(claimsRoute, co, { method: "DELETE", query: { ...q, characterId: "gloria-pop" } })).toBe(200);
    // Handing it on and choosing co-GMs are the GM's alone.
    expect(await status(gameRoute, co, { method: "PATCH", query: q, body: { op: "transfer", to: "Ollie" } })).toBe(403);
    expect(await status(gameRoute, co, { method: "PATCH", query: q, body: { op: "addCoGm", username: "Ollie" } })).toBe(403);
  });

  it("scopes the GM's pages (GM view, kit, box) to the game", async () => {
    const code = await newGame();
    const ctx = async (who: Viewer | null, query: Record<string, string>) => {
      const cookies = await sessionCookies(who);
      return { req: { cookies, headers: {} } as never, resolvedUrl: `/${PARANOIA}/gm?${new URLSearchParams(query)}`, query };
    };
    const mine = await gmPage(await ctx(gm, { game: code }), PARANOIA);
    expect("game" in mine && mine.os.slug).toBe(PARANOIA);
    expect("game" in (await gmPage(await ctx(admin, { game: code }), PARANOIA))).toBe(true);
    // A member who doesn't run it is sent to the player's side.
    expect(await gmPage(await ctx(stranger, { game: code }), PARANOIA)).toEqual({ redirect: { destination: `/${PARANOIA}?table=${code}`, permanent: false } });
    // No game named: your newest of it, or the job page to run one.
    expect(await gmPage(await ctx(gm, {}), PARANOIA)).toEqual({ redirect: { destination: `/${PARANOIA}/gm?game=${code}`, permanent: false } });
    expect(await gmPage(await ctx(stranger, {}), PARANOIA)).toEqual({ redirect: { destination: `/${PARANOIA}?run=1`, permanent: false } });
    expect(await gmPage(await ctx(gm, { game: code }), "lot-thirteen")).toEqual({ notFound: true });
    expect((await gmPage(await ctx(null, { game: code }), PARANOIA)) as { redirect: { destination: string } }).toMatchObject({ redirect: { destination: expect.stringMatching(/^\/login/) } });
  });

  it("hands the reins on, keeps a co-GM, and the new GM knows the secrets", async () => {
    const code = await newGame();
    const q = { code };
    const r = await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "transfer", to: "ollie", stay: true } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ gm: { username: "Ollie" }, coGms: [{ username: "Mags" }] });
    expect(await db().spoiler.findUnique({ where: { userId_oneshot: { userId: other.id, oneshot: PARANOIA } } })).not.toBeNull();
    // Mags is a co-GM now: still on the GM's side, but no longer hands it on.
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "transfer", to: "Cobb" } })).statusCode).toBe(403);
    expect((await hit(lettersRoute, gm, { method: "GET", query: q })).statusCode).toBe(200);
    const off = await hit(gameRoute, other, { method: "PATCH", query: q, body: { op: "removeCoGm", username: "Mags" } });
    expect(off.body).toMatchObject({ coGms: [] });
    // Mags still knows what's in the envelopes.
    expect(((await hit(gamesRoute, gm, { method: "GET", query: { oneshot: PARANOIA } })).body as { youKnow: boolean }).youKnow).toBe(true);
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "transfer", to: "nobody-here" } })).statusCode).toBe(403);
  });

  it("seats a guest by code and name, then hands the seat and its history to the account they make", async () => {
    const code = await newGame();
    const q = { code };
    // Sitting down: a pass for that one game, and the same browser keeps its key.
    const sat = await hit(guestRoute, null, { method: "POST", body: { code: code.toLowerCase(), name: "Sam" } });
    expect(sat.statusCode).toBe(200);
    expect(sat.cookies[0]).toMatch(new RegExp(`^${GUEST_COOKIE}=.+HttpOnly`));
    expect((await hit(guestRoute, null, { method: "POST", body: { code: "ZZZZZ", name: "Sam" } })).statusCode).toBe(404);
    expect((await hit(guestRoute, other, { method: "POST", body: { code, name: "Sam" } })).statusCode).toBe(409);

    const guest = sam(code);
    expect((await hit(claimsRoute, guest, { method: "POST", query: q, body: { characterId: "penny-buy" } })).statusCode).toBe(201);
    const seen = (await hit(tableRoute, guest, { method: "GET", query: q })).body as { claims: { characterId: string; name: string; mine: boolean; guest: boolean }[] };
    expect(seen.claims).toEqual([expect.objectContaining({ characterId: "penny-buy", name: "Sam", mine: true, guest: true })]);
    // A pass for another game is nobody here.
    expect((await hit(claimsRoute, sam("FGHJK"), { method: "POST", query: q, body: { characterId: "gloria-pop" } })).statusCode).toBe(400);
    // Things happen: a roll, a flashback, a note from the GM.
    expect((await hit(liveRoute, guest, { method: "POST", query: q, body: { action: { type: "roll", label: "Moxie", count: 1, sides: 6, mod: 0 } } })).statusCode).toBe(201);
    const people = ((await hit(liveRoute, gm, { method: "GET", query: q })).body as { people: { handle: string; name: string }[] }).people;
    expect((await hit(liveRoute, gm, { method: "POST", query: q, body: { action: { type: "note", to: people[0].handle, text: "Psst, Sam." } } })).statusCode).toBe(201);
    expect((await hit(flashbacksRoute, guest, { method: "POST", query: q, body: { characterId: "penny-buy", answer: "The vat." } })).statusCode).toBe(200);
    const before = await db().claim.findFirstOrThrow({ where: { characterId: "penny-buy" } });
    expect([before.userId, before.playerId]).toEqual([null, guest.guest.key]);

    // The GM invites Sam to keep it. Mags can't make invites; an admin looking in can't act; a co-GM who may invite can.
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "inviteGuest", characterId: "penny-buy" } })).statusCode).toBe(403);
    expect((await hit(gameRoute, admin, { method: "PATCH", query: q, body: { op: "inviteGuest", characterId: "penny-buy" } })).statusCode).toBe(403);
    await db().user.update({ where: { id: gm.id }, data: { canInvite: true } });
    gm = { ...gm, canInvite: true };
    installTestUsers([gm, co, other, stranger, admin]);
    const inv = await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "inviteGuest", characterId: "penny-buy" } });
    expect(inv.statusCode).toBe(201);
    const invite = (inv.body as { invite: { code: string } }).invite.code;
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "inviteGuest", characterId: "gloria-pop" } })).statusCode).toBe(404);

    // Sam joins on another device (no pass there): the invite carries the seat.
    const joined = await hit((req, res) => joinRoute(req, res), null, { method: "POST", body: { code: invite, username: "sam", displayName: "Sam Ash", password: PW } });
    expect(joined.statusCode).toBe(201);
    expect(joined.body).toMatchObject({ seats: 1 });
    const user = await db().user.findUniqueOrThrow({ where: { usernameLower: "sam" } });
    const key = `u-${user.id}`;
    const after = await db().claim.findFirstOrThrow({ where: { characterId: "penny-buy" } });
    expect([after.userId, after.playerId, after.playerName]).toEqual([user.id, key, "Sam Ash"]);
    const events = await db().tableEvent.findMany({ where: { game: { code } }, orderBy: { id: "asc" } });
    expect(events.filter((e) => e.kind === "roll").map((e) => e.byPlayer)).toEqual([key]);
    expect(events.filter((e) => e.kind === "note").map((e) => e.toPlayer)).toEqual([key]);
    expect(JSON.stringify(events)).not.toContain(guest.guest.key);
    expect(await db().flashback.findFirst({ where: { playerId: key } })).not.toBeNull();
    // As Sam the account, it's still their seat, their note and their flashback.
    const samV = toViewer(user);
    installTestUsers([gm, co, other, stranger, admin, samV]);
    const mine = (await hit(tableRoute, samV, { method: "GET", query: q })).body as { claims: { mine: boolean; guest: boolean }[] };
    expect(mine.claims).toEqual([expect.objectContaining({ mine: true, guest: false })]);
    const log = (await hit(liveRoute, samV, { method: "GET", query: { ...q, as: "player" } })).body as { events: { kind: string; data: unknown }[] };
    expect(JSON.stringify(log.events)).toContain("Psst, Sam.");
    expect(((await hit(flashbacksRoute, samV, { method: "GET", query: q })).body as { flashbacks: { mine: boolean }[] }).flashbacks).toEqual([expect.objectContaining({ mine: true })]);
  });

  it("keeps the seat count, and a finished game's seats and log as they were", async () => {
    const code = await newGame();
    const q = { code };
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "schedule", scheduledAt: null, seats: 1 } })).statusCode).toBe(200);
    expect((await hit(claimsRoute, other, { method: "POST", query: q, body: { characterId: "gloria-pop" } })).statusCode).toBe(201);
    expect((await hit(claimsRoute, stranger, { method: "POST", query: q, body: { characterId: "penny-buy" } })).body).toMatchObject({ error: "All 1 seats are taken" });

    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "status", status: "live" } })).body).toMatchObject({ status: "live" });
    // A front page drafted mid-game is just a draft: the game plays on.
    const draft = await hit(epilogueRoute, gm, { method: "PUT", query: q, body: { epilogue: { date: "2026-10-21", headline: "Early edition", subhead: "", lead: "", entries: {} } } });
    expect(draft.body).toMatchObject({ status: "live" });
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "status", status: "open" } })).statusCode).toBe(409);
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "status", status: "finished" } })).body).toMatchObject({ status: "finished" });
    const row = await db().game.findUniqueOrThrow({ where: { code } });
    expect(row.startedAt).not.toBeNull();
    expect(row.finishedAt).not.toBeNull();
    // Over: no tearing, no pinning back, no rolling, no letters.
    expect((await hit(claimsRoute, other, { method: "DELETE", query: { ...q, characterId: "gloria-pop" } })).statusCode).toBe(409);
    expect((await hit(claimsRoute, stranger, { method: "POST", query: q, body: { characterId: "clem-grs" } })).statusCode).toBe(409);
    expect((await hit(liveRoute, other, { method: "POST", query: q, body: { action: { type: "roll", label: "x", count: 1, sides: 6, mod: 0 } } })).statusCode).toBe(409);
    expect((await hit(lettersRoute, gm, { method: "POST", query: q, body: { letterId: "the-sprinkles-crate" } })).statusCode).toBe(409);
    // The morning after still takes the paper, and puts the game in it.
    const ep = await hit(epilogueRoute, gm, { method: "PUT", query: q, body: { epilogue: { date: "2026-10-21", headline: "Sprinkles everywhere", subhead: "", lead: "", entries: {} } } });
    expect(ep.body).toMatchObject({ status: "epilogued" });
    expect(((await hit(epilogueRoute, other, { method: "PATCH", query: q, body: { characterId: "gloria-pop", entry: { line: "Never again." } } })).statusCode)).toBe(200);
    // Who has played it, for the next GM to pick a fresh table.
    const record = (await hit(gamesRoute, co, { method: "GET", query: { oneshot: PARANOIA } })).body as { youKnow: boolean; played: unknown[] };
    expect(record).toMatchObject({ youKnow: false, played: [{ displayName: "Mags", as: "gm" }, { displayName: "Ollie", as: "player" }] });
    expect(((await hit(gamesRoute, other, { method: "GET", query: { known: "1" } })).body as { known: string[] }).known).toEqual([PARANOIA]);
    expect(((await hit(gamesRoute, co, { method: "GET", query: { known: "1" } })).body as { known: string[] }).known).toEqual([]);
  });

  it("plays the version it was pinned to, and offers the latest only before it goes live", async () => {
    const code = await newGame();
    const q = { code };
    await hit(claimsRoute, other, { method: "POST", query: q, body: { characterId: "gloria-pop" } });
    await hit(lettersRoute, gm, { method: "POST", query: q, body: { letterId: "the-sprinkles-crate" } });
    // The author retitles the letter and the job, and publishes.
    await publish(PARANOIA, (d) => {
      d.oneshot.title = "Open In Case Of Future, Revised";
      (d.oneshot.letters as { id: string; title: string }[])[0].title = "A new title";
    });
    const game = await db().game.findUniqueOrThrow({ where: { code } });
    expect((await gameOneShot(game)).title).not.toMatch(/Revised/);
    const letters = (await hit(lettersRoute, other, { method: "GET", query: q })).body as { letters: { title: string }[] };
    expect(letters.letters.map((l) => l.title)).toEqual(["Under the sprinkles"]);
    expect((await hit(gameRoute, gm, { method: "GET", query: q })).body).toMatchObject({ newer: true });
    // Before it starts, the GM can move it on.
    const moved = await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "repin" } });
    expect(moved.body).toMatchObject({ newer: false });
    const again = (await hit(lettersRoute, other, { method: "GET", query: q })).body as { letters: { title: string }[] };
    expect(again.letters.map((l) => l.title)).toEqual(["A new title"]);
    // Once it's live, it keeps what it started with.
    await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "status", status: "live" } });
    await publish(PARANOIA, (d) => {
      d.oneshot.title = "Third time";
    });
    expect((await hit(gameRoute, gm, { method: "PATCH", query: q, body: { op: "repin" } })).statusCode).toBe(409);
    const live = await db().game.findUniqueOrThrow({ where: { code } });
    expect((await gameOneShot(live)).title).toBe("Open In Case Of Future, Revised");
  });

  it("never hands a player anyone else's secrets, keys or account ids", async () => {
    const code = await newGame();
    const q = { code };
    const guest = sam(code);
    await hit(claimsRoute, other, { method: "POST", query: q, body: { characterId: "gloria-pop" } });
    await hit(claimsRoute, guest, { method: "POST", query: q, body: { characterId: "penny-buy" } });
    await hit(lettersRoute, gm, { method: "POST", query: q, body: { letterId: "the-sprinkles-crate" } });
    await hit(lettersRoute, gm, { method: "POST", query: q, body: { letterId: "the-buyer-writes" } });
    await hit(flashbacksRoute, guest, { method: "POST", query: q, body: { characterId: "penny-buy", answer: "Sam's own past." } });
    const people = ((await hit(liveRoute, gm, { method: "GET", query: q })).body as { people: { handle: string; character: string }[] }).people;
    const penny = people.find((p) => p.character?.startsWith("Penny"))!;
    await hit(liveRoute, gm, { method: "POST", query: q, body: { action: { type: "note", to: penny.handle, text: "Only for Penny." } } });
    await hit(liveRoute, gm, { method: "POST", query: q, body: { action: { type: "roll", label: "Behind the screen", count: 1, sides: 20, mod: 0, hidden: true } } });

    const os = await gameOneShot(await db().game.findUniqueOrThrow({ where: { code } }));
    const pennysSecret = JSON.stringify((os.cast.find((c) => c.id === "penny-buy") as { naughty: unknown }).naughty);
    const forbidden = [guest.guest.key, gm.id, co.id, admin.id, "Only for Penny.", "Sam's own past.", pennysSecret, "Behind the screen"];
    const routes: [string, Parameters<typeof hit>[0], Record<string, string>][] = [
      ["table", tableRoute, q],
      ["live", liveRoute, { ...q, as: "player" }],
      ["letters", lettersRoute, q],
      ["secrets", secretsRoute, { ...q, as: "player" }],
      ["flashbacks", flashbacksRoute, q],
      ["tapestry", tapestryRoute, q],
      ["epilogue", epilogueRoute, q],
      ["recordings", recordingsRoute, { ...q, as: "player" }],
    ];
    for (const [name, route, query] of routes) {
      const seen = JSON.stringify((await hit(route, other, { method: "GET", query })).body);
      for (const f of forbidden) expect(seen.includes(f), `${name} shows Ollie ${f.slice(0, 30)}`).toBe(false);
      // Not even their own account id: keys stay on the server.
      expect(seen.includes(other.id), `${name} shows Ollie a key`).toBe(false);
    }
    // Their own secret, letter and nothing else.
    const mine = (await hit(secretsRoute, other, { method: "GET", query: { ...q, as: "player" } })).body as { secrets: Record<string, unknown> };
    expect(Object.keys(mine.secrets)).toEqual(["gloria-pop"]);
    const letters = (await hit(lettersRoute, other, { method: "GET", query: q })).body as { letters: { to: string; text?: string }[] };
    expect(letters.letters.map((l) => [l.to, !!l.text])).toEqual([["gloria-pop", true]]);
    // The TV sees the table, not the people at it.
    const tv = JSON.stringify((await hit(liveRoute, gm, { method: "GET", query: { ...q, as: "table" } })).body);
    for (const f of forbidden) expect(tv.includes(f)).toBe(false);
  });

  it("runs Ten Candles' own state per game: the GM's moves are the GM's", async () => {
    await publish(CANDLES);
    const code = await newGame(CANDLES);
    const q = { code };
    const sit = await hit(stateRoute, other, { method: "POST", query: { ...q, as: "player" }, body: { action: { type: "sit", name: "Ollie" } } });
    expect(sit.statusCode).toBe(200);
    const settings = { action: { type: "settings", patch: { onesToGm: true } } };
    expect((await hit(stateRoute, admin, { method: "POST", query: q, body: settings })).statusCode).toBe(403);
    expect((await hit(stateRoute, stranger, { method: "POST", query: q, body: settings })).statusCode).toBe(409);
    expect((await hit(stateRoute, gm, { method: "POST", query: q, body: settings })).statusCode).toBe(200);
    const state = await db().gameState.findFirstOrThrow({ where: { game: { code } } });
    expect(JSON.stringify(state.state)).toContain(`u-${other.id}`);
    expect(JSON.stringify((await hit(stateRoute, stranger, { method: "GET", query: { ...q, as: "player" } })).body)).not.toContain(other.id);
  });
});
