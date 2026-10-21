import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDbUrls } from "@/lib/dbUrl";
import { db } from "@/lib/prisma";
import { AUTH_COOKIE, createToken } from "@/lib/auth";
import type { OneShotDoc } from "@/lib/oneShotCheck";
import { DbSpellStore } from "./dbSpellStore";
import { DbStore, KEEP_REVISIONS } from "./dbStore";
import { FileStore } from "./fileStore";
import { importOneShots, importSpells, importSurvivors } from "./importContent";
import { readSurvivors, saveSurvivors } from "./survivorStore";
import { PublishError, StoreError } from "./types";
import { handler as actionRoute } from "@/pages/api/admin/oneshots/[slug]/[action]";
import { handler as survivorRoute } from "@/pages/api/admin/survivors";

/**
 * The database store, against the local Postgres in .env (`pnpm db:dev`) in a
 * schema of its own, `tearoff_test`, which this file migrates and empties:
 * the real tables are never touched. Every database test lives in this one
 * file, because `prisma dev` takes one connection at a time and vitest runs
 * files in parallel. Without a reachable database the tests are skipped
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
  process.env.DATABASE_URL = withSchema(urls.url!);
  process.env.DIRECT_URL = withSchema(urls.directUrl!);
  execSync("pnpm exec prisma migrate deploy", { cwd: ROOT, env: process.env, stdio: "pipe" });
}, 120_000);

beforeEach(async () => {
  vi.unstubAllEnvs();
  if (!up) return;
  const c = db();
  await c.oneShot.deleteMany();
  await c.spell.deleteMany();
  await c.survivor.deleteMany();
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
      expect(res.statusCode).toBe(403);
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
      expect((await call(actionRoute, { role, method: "GET", query: { slug: "night", action: "history" } }, store)).statusCode).toBe(403);
      expect((await call(actionRoute, { role, method: "POST", query: { slug: "night", action: "restore" }, body: { revision: "x" } }, store)).statusCode).toBe(403);
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
  const cookies: Record<string, string> = opts.role ? { [AUTH_COOKIE]: await createToken(opts.role) } : {};
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
