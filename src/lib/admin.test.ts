import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeAll, describe, expect, it } from "vitest";
import { installTestUsers, sessionCookies, type TestWho } from "./testAuth";
import { FileStore } from "./store";
import { handler as listRoute } from "@/pages/api/admin/oneshots";
import { handler as oneRoute } from "@/pages/api/admin/oneshots/[slug]";
import { handler as actionRoute } from "@/pages/api/admin/oneshots/[slug]/[action]";
import { handler as survivorRoute, type SurvivorWriter } from "@/pages/api/admin/survivors";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
  installTestUsers();
});

/** A content folder in a temp dir with one real one-shot. */
function tempStore(writable: boolean): FileStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-admin-"));
  fs.cpSync(path.join(process.cwd(), "content", "rules"), path.join(root, "rules"), { recursive: true });
  fs.cpSync(
    path.join(process.cwd(), "content", "oneshots", "lights-out-at-marrowby"),
    path.join(root, "oneshots", "lights-out-at-marrowby"),
    { recursive: true },
  );
  return new FileStore({ root, gate: () => (writable ? { writable: true } : { writable: false, reason: "deployed: read-only" }) });
}

type Res = { statusCode: number; body: unknown; headers: Record<string, string> };

async function call(
  route: (req: NextApiRequest, res: NextApiResponse, store?: FileStore) => Promise<unknown>,
  store: FileStore,
  opts: { role?: TestWho | null; method: string; query?: Record<string, string>; body?: unknown },
): Promise<Res> {
  const cookies = await sessionCookies(opts.role);
  const out: Res = { statusCode: 200, body: undefined, headers: {} };
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
      out.headers[k.toLowerCase()] = v;
      return res;
    },
  };
  const req = { method: opts.method, query: opts.query ?? {}, body: opts.body, cookies, headers: {} };
  await route(req as unknown as NextApiRequest, res as unknown as NextApiResponse, store);
  return out;
}

const SLUG = "lights-out-at-marrowby";

/** Every admin endpoint, as [name, route, request]. */
const endpoints = [
  ["list", listRoute, { method: "GET" }],
  ["create", listRoute, { method: "POST", body: { action: "create", system: "tencandles", title: "A Test Night" } }],
  ["get", oneRoute, { method: "GET", query: { slug: SLUG } }],
  ["save draft", oneRoute, { method: "PUT", query: { slug: SLUG }, body: { doc: { oneshot: {}, cast: [], variants: [] } } }],
  ["delete", oneRoute, { method: "DELETE", query: { slug: SLUG }, body: { confirm: SLUG } }],
  ["publish", actionRoute, { method: "POST", query: { slug: SLUG, action: "publish" } }],
  ["unpublish", actionRoute, { method: "POST", query: { slug: SLUG, action: "unpublish" } }],
  ["duplicate", actionRoute, { method: "POST", query: { slug: SLUG, action: "duplicate" }, body: { to: "copy" } }],
  ["export", actionRoute, { method: "GET", query: { slug: SLUG, action: "export" } }],
  ["history", actionRoute, { method: "GET", query: { slug: SLUG, action: "history" } }],
  ["restore", actionRoute, { method: "POST", query: { slug: SLUG, action: "restore" }, body: { revision: "x" } }],
] as const;

describe("admin API auth", () => {
  it.each(endpoints)("%s refuses players and strangers", async (_name, route, req) => {
    for (const role of ["table", null] as const) {
      const store = tempStore(true);
      const res = await call(route, store, { ...req, role });
      // Strangers: sign in first (401). Players: not for them (403).
      expect(res.statusCode).toBe(role ? 403 : 401);
      expect(JSON.stringify(res.body)).not.toContain("Marrowby");
      // Nothing was written.
      expect(fs.existsSync(path.join(store.root, "drafts"))).toBe(false);
      expect(fs.existsSync(path.join(store.root, "oneshots", SLUG, "oneshot.json"))).toBe(true);
    }
  });

  it("lets the GM read and write", async () => {
    const store = tempStore(true);
    const list = await call(listRoute, store, { role: "gm", method: "GET" });
    expect(list.statusCode).toBe(200);
    expect(list.body).toMatchObject({ gate: { writable: true }, oneshots: [{ slug: SLUG, status: "published" }] });
    expect(list.headers["cache-control"]).toBe("private, no-store");

    const created = await call(listRoute, store, {
      role: "gm",
      method: "POST",
      body: { action: "create", system: "tencandles", title: "A Test Night" },
    });
    expect(created).toMatchObject({ statusCode: 201, body: { slug: "a-test-night" } });

    const exported = await call(actionRoute, store, { role: "gm", method: "GET", query: { slug: SLUG, action: "export" } });
    expect(exported.statusCode).toBe(200);
    expect(JSON.parse(exported.body as string).oneshot.title).toBe("Lights Out at Marrowby");
  });

  it("is read-only for the GM when the store can't write, and says why", async () => {
    const store = tempStore(false);
    expect((await call(listRoute, store, { role: "gm", method: "GET" })).body).toMatchObject({
      gate: { writable: false, reason: "deployed: read-only" },
    });
    expect((await call(oneRoute, store, { role: "gm", method: "GET", query: { slug: SLUG } })).statusCode).toBe(200);
    for (const [name, route, req] of endpoints) {
      if (req.method === "GET") continue;
      const res = await call(route, store, { ...req, role: "gm" });
      expect(res.statusCode, name).toBe(403);
      expect(res.body, name).toMatchObject({ error: "deployed: read-only", readOnly: true });
    }
    expect(fs.existsSync(path.join(store.root, "drafts"))).toBe(false);
  });

  it("asks for the slug to be typed back before deleting", async () => {
    const store = tempStore(true);
    const res = await call(oneRoute, store, { role: "gm", method: "DELETE", query: { slug: SLUG }, body: { confirm: "yes" } });
    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(path.join(store.root, "oneshots", SLUG))).toBe(true);
  });

  it("rejects bad slugs from the URL", async () => {
    const store = tempStore(true);
    const res = await call(oneRoute, store, { role: "gm", method: "GET", query: { slug: "../oneshots" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("the history with files", () => {
  it("isn't there: git is the history", async () => {
    const store = tempStore(true);
    const res = await call(actionRoute, store, { role: "gm", method: "GET", query: { slug: SLUG, action: "history" } });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).toMatch(/git is the history/);
  });
});

describe("saving to the shared world", () => {
  const writer = (writable: boolean) => {
    const saved: unknown[] = [];
    const w: SurvivorWriter = {
      gate: () => (writable ? { writable: true } : { writable: false, reason: "files: download them" }),
      save: async (records) => {
        saved.push(records);
        return { saved: ["x"], skipped: [] };
      },
      remove: async (ids) => {
        saved.push(ids);
        return ids;
      },
    };
    return { w, saved };
  };
  const post = (role: "gm" | "table" | null, w: SurvivorWriter) =>
    call(survivorRoute as never, w as never, { role, method: "POST", body: { records: [] } });

  it("is GM-only", async () => {
    const { w, saved } = writer(true);
    for (const role of ["table", null] as const) {
      expect((await post(role, w)).statusCode).toBe(role ? 403 : 401);
      expect((await call(survivorRoute as never, w as never, { role, method: "DELETE", body: { ids: ["x"] } })).statusCode).toBe(role ? 403 : 401);
    }
    expect(saved).toEqual([]);
    expect((await post("gm", w)).statusCode).toBe(200);
    expect(saved).toHaveLength(1);
  });

  it("refuses when the shared world is files", async () => {
    const { w, saved } = writer(false);
    expect((await post("gm", w)).body).toMatchObject({ error: "files: download them", readOnly: true });
    expect(saved).toEqual([]);
  });
});
