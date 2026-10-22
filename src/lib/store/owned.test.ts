import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeAll, describe, expect, it } from "vitest";
import { installTestUsers, sessionCookies, TEST_USERS, type TestWho } from "@/lib/testAuth";
import { FileStore } from "./fileStore";
import { OwnedStore } from "./owned";
import { MemoryOwnerBook } from "./owners";
import { StoreError } from "./types";
import type { OneShotDoc } from "@/lib/oneShotCheck";
import { handler as listRoute } from "@/pages/api/admin/oneshots";
import { handler as oneRoute } from "@/pages/api/admin/oneshots/[slug]";
import { handler as actionRoute } from "@/pages/api/admin/oneshots/[slug]/[action]";

/**
 * Ownership in the builder (phase 10), over the FileStore: an author sees and
 * changes only their own one-shots, through the store and through every
 * API route; admins see and change everything; unowned is admins only. The
 * same rules over the DbStore are in dbStore.test.ts.
 */

const LEGACY = "lights-out-at-marrowby";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
  installTestUsers();
});

function tempStore(): FileStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-owned-"));
  fs.cpSync(path.join(process.cwd(), "content", "rules"), path.join(root, "rules"), { recursive: true });
  fs.cpSync(path.join(process.cwd(), "content", "oneshots", LEGACY), path.join(root, "oneshots", LEGACY), { recursive: true });
  return new FileStore({ root, gate: () => ({ writable: true }), owners: new MemoryOwnerBook() });
}

const doc = (title: string): OneShotDoc => ({ oneshot: { title, system: "tencandles" }, cast: [], variants: [] });
const as = (store: FileStore, who: TestWho) => new OwnedStore(store, TEST_USERS[who]);

async function refused(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toBeInstanceOf(StoreError);
  await expect(p).rejects.toMatchObject({ status });
}

describe("OwnedStore", () => {
  it("gives new one-shots to whoever made them, and shows authors only their own", async () => {
    const store = tempStore();
    await as(store, "author").import("quills-night", doc("Quill's Night"));
    await as(store, "author2").saveDraft("nibs-night", doc("Nib's Night"));
    await as(store, "gm").import("barkeeps-night", doc("The Barkeep's Night"));
    expect(await store.owner("quills-night")).toBe(TEST_USERS.author.id);
    expect(await store.owner("nibs-night")).toBe(TEST_USERS.author2.id);

    expect((await as(store, "author").list()).map((s) => s.slug)).toEqual(["quills-night"]);
    expect((await as(store, "gm").list()).map((s) => s.slug).sort()).toEqual(["barkeeps-night", LEGACY, "nibs-night", "quills-night"]);
  });

  it("refuses an author every write to someone else's one-shot, and writes nothing", async () => {
    const store = tempStore();
    await as(store, "author2").import("nibs-night", doc("Nib's Night"));
    const quill = as(store, "author");
    const before = JSON.stringify(await store.get("nibs-night"));
    await refused(quill.saveDraft("nibs-night", doc("Stolen")), 403);
    await refused(quill.publish("nibs-night"), 403);
    await refused(quill.delete("nibs-night"), 403);
    await refused(quill.duplicate("nibs-night", "my-copy"), 403);
    expect(await quill.get("nibs-night")).toBeNull();
    expect(await quill.export("nibs-night")).toBeNull();
    expect(JSON.stringify(await store.get("nibs-night"))).toBe(before);
    expect(await store.get("my-copy")).toBeNull();
  });

  it("keeps unowned content (everything from before accounts) for the admins", async () => {
    const store = tempStore();
    const quill = as(store, "author");
    expect(await quill.get(LEGACY)).toBeNull();
    await refused(quill.unpublish(LEGACY), 403);
    await refused(quill.setOwner(LEGACY, TEST_USERS.author.id), 403);
    const gm = as(store, "gm");
    expect(await gm.get(LEGACY)).not.toBeNull();
    // An admin can hand it over, and then it's theirs.
    await gm.setOwner(LEGACY, TEST_USERS.author.id);
    expect((await quill.list()).map((s) => s.slug)).toEqual([LEGACY]);
    await quill.saveDraft(LEGACY, { ...(await quill.export(LEGACY))!, oneshot: { ...(await quill.export(LEGACY))!.oneshot, title: "Lights Out, Again" } });
    expect((await store.get(LEGACY))!.draft!.oneshot.title).toBe("Lights Out, Again");
  });

  it("forgets the owner when a one-shot is deleted, so its slug starts fresh", async () => {
    const store = tempStore();
    await as(store, "author").import("quills-night", doc("Quill's Night"));
    await as(store, "author").delete("quills-night");
    expect(await store.owner("quills-night")).toBeNull();
    await as(store, "author2").import("quills-night", doc("Now Nib's"));
    expect(await store.owner("quills-night")).toBe(TEST_USERS.author2.id);
  });
});

// ---- Over the API, as the browser would ----

type Res = { statusCode: number; body: unknown };
async function call(
  route: (req: NextApiRequest, res: NextApiResponse, store?: FileStore) => Promise<unknown>,
  store: FileStore,
  opts: { role: TestWho | null; method: string; query?: Record<string, string>; body?: unknown },
): Promise<Res> {
  const out: Res = { statusCode: 200, body: undefined };
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
    revalidate: async () => {},
  };
  const req = { method: opts.method, query: opts.query ?? {}, body: opts.body, cookies: await sessionCookies(opts.role), headers: {} };
  await route(req as unknown as NextApiRequest, res as unknown as NextApiResponse, store);
  return out;
}

describe("the builder API and ownership", () => {
  it("lets an author make and change their own one-shot, and nobody else's", async () => {
    const store = tempStore();
    const made = await call(listRoute, store, { role: "author", method: "POST", body: { action: "create", system: "tencandles", title: "Quill's Night" } });
    expect(made).toMatchObject({ statusCode: 201, body: { slug: "quills-night" } });
    await call(listRoute, store, { role: "author2", method: "POST", body: { action: "create", system: "tencandles", title: "Nib's Night" } });

    const list = await call(listRoute, store, { role: "author", method: "GET" });
    expect((list.body as { oneshots: { slug: string }[] }).oneshots.map((o) => o.slug)).toEqual(["quills-night"]);

    const nibs = { slug: "nibs-night" };
    const attempts = [
      ["read", oneRoute, { method: "GET", query: nibs }, 404],
      ["save", oneRoute, { method: "PUT", query: nibs, body: { doc: doc("Stolen") } }, 403],
      ["delete", oneRoute, { method: "DELETE", query: nibs, body: { confirm: "nibs-night" } }, 403],
      ["publish", actionRoute, { method: "POST", query: { ...nibs, action: "publish" } }, 403],
      ["unpublish", actionRoute, { method: "POST", query: { ...nibs, action: "unpublish" } }, 403],
      ["discard", actionRoute, { method: "POST", query: { ...nibs, action: "discard" } }, 403],
      ["duplicate", actionRoute, { method: "POST", query: { ...nibs, action: "duplicate" }, body: { to: "mine-now" } }, 403],
      ["export", actionRoute, { method: "GET", query: { ...nibs, action: "export" } }, 404],
      ["owner", actionRoute, { method: "POST", query: { ...nibs, action: "owner" }, body: { ownerId: TEST_USERS.author.id } }, 403],
    ] as const;
    for (const [name, route, req, status] of attempts) {
      const r = await call(route, store, { ...req, role: "author" });
      expect(r.statusCode, name).toBe(status);
      expect(JSON.stringify(r.body), name).not.toContain("Nib's Night");
    }
    expect((await store.get("nibs-night"))!.draft!.oneshot.title).toBe("Nib's Night");
    expect(await store.get("mine-now")).toBeNull();

    // Their own works.
    const own = await call(oneRoute, store, { role: "author", method: "PUT", query: { slug: "quills-night" }, body: { doc: doc("Quill's Long Night") } });
    expect(own.statusCode).toBe(200);
    expect((await store.get("quills-night"))!.draft!.oneshot.title).toBe("Quill's Long Night");
  });

  it("lets authors and admins edit keepsakes only where they may edit at all, and checks them on publish", async () => {
    const store = tempStore();
    await call(listRoute, store, { role: "author", method: "POST", body: { action: "create", system: "tencandles", title: "Quill's Night" } });
    const paddle = { name: "Paddle No. 13", note: "Raised once.", art: "paddle" };
    const gavel = { name: "The gavel", note: "Gone.", art: "gavel" };
    const withKeepsakes = (d: OneShotDoc): OneShotDoc => ({ ...d, oneshot: { ...d.oneshot, keepsakes: { player: paddle, gm: gavel } } });

    // The author, on their own.
    const mine = (await store.get("quills-night"))!.draft!;
    expect((await call(oneRoute, store, { role: "author", method: "PUT", query: { slug: "quills-night" }, body: { doc: withKeepsakes(mine) } })).statusCode).toBe(200);
    expect((await store.get("quills-night"))!.draft!.oneshot.keepsakes).toEqual({ player: paddle, gm: gavel });

    // Someone else's, and the admins' unowned one: refused, nothing written.
    for (const [who, slug, status] of [["author2", "quills-night", 403], ["author", LEGACY, 403], ["table", LEGACY, 403], [null, LEGACY, 401]] as const) {
      const before = await store.get(slug);
      const r = await call(oneRoute, store, { role: who, method: "PUT", query: { slug }, body: { doc: withKeepsakes((before!.draft ?? before!.published)!) } });
      expect(r.statusCode, `${who} on ${slug}`).toBe(status);
      expect(await store.get(slug), `${who} on ${slug}`).toEqual(before);
    }

    // An admin, on the unowned one: the shared keepsakes and a character's own, published.
    const legacy = (await store.get(LEGACY))!.published!;
    const ida = legacy.cast.findIndex((c) => c.id === "ida-kell");
    const watch = { name: "A watch", note: "Kept to the minute.", art: "pocketwatch" };
    const edited = withKeepsakes({ ...legacy, cast: legacy.cast.map((c, i) => (i === ida ? { ...c, keepsake: watch } : c)) });
    expect((await call(oneRoute, store, { role: "gm", method: "PUT", query: { slug: LEGACY }, body: { doc: edited } })).statusCode).toBe(200);
    expect((await call(actionRoute, store, { role: "gm", method: "POST", query: { slug: LEGACY, action: "publish" } })).statusCode).toBe(200);
    const published = (await store.get(LEGACY))!.published!;
    expect(published.oneshot.keepsakes).toEqual({ player: paddle, gm: gavel });
    expect(published.cast.find((c) => c.id === "ida-kell")!.keepsake).toEqual(watch);

    // A keepsake the checks refuse doesn't publish.
    const bad = { ...edited, oneshot: { ...edited.oneshot, keepsakes: { player: { ...paddle, art: "trophy" }, gm: gavel } } };
    await call(oneRoute, store, { role: "gm", method: "PUT", query: { slug: LEGACY }, body: { doc: bad } });
    const refusedPublish = await call(actionRoute, store, { role: "gm", method: "POST", query: { slug: LEGACY, action: "publish" } });
    expect(refusedPublish.statusCode).toBeGreaterThanOrEqual(400);
    expect((await store.get(LEGACY))!.published!.oneshot.keepsakes).toEqual({ player: paddle, gm: gavel });
  });

  it("keeps members without the badge out of the builder entirely", async () => {
    const store = tempStore();
    for (const [route, req] of [
      [listRoute, { method: "GET" }],
      [listRoute, { method: "POST", body: { action: "create", system: "tencandles", title: "Sneaky" } }],
      [oneRoute, { method: "GET", query: { slug: LEGACY } }],
    ] as const) {
      expect((await call(route, store, { ...req, role: "table" })).statusCode).toBe(403);
      expect((await call(route, store, { ...req, role: null })).statusCode).toBe(401);
    }
    expect(await store.get("sneaky")).toBeNull();
  });
});
