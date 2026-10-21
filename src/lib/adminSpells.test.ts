import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeAll, describe, expect, it } from "vitest";
import { installTestUsers, sessionCookies, type TestWho } from "./testAuth";
import { loadSpellBook } from "./content";
import { SpellBookStore } from "./store";
import { formatJson } from "./store/json";
import { spellBookSchema } from "@/systems/dnd5e/schema";
import { handler } from "@/pages/api/admin/spells";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
  installTestUsers();
});

/** A content folder in a temp dir: the real spell book and one 5e one-shot that uses it. */
function tempStore(writable: boolean): SpellBookStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-spells-"));
  fs.cpSync(path.join(process.cwd(), "content", "rules"), path.join(root, "rules"), { recursive: true });
  fs.cpSync(path.join(process.cwd(), "content", "oneshots", "the-drowned-bell"), path.join(root, "oneshots", "the-drowned-bell"), {
    recursive: true,
  });
  return new SpellBookStore({ root, gate: () => (writable ? { writable: true } : { writable: false, reason: "deployed: read-only" }) });
}

type Res = { statusCode: number; body: unknown; headers: Record<string, string> };

async function call(store: SpellBookStore, opts: { role?: TestWho | null; method: string; body?: unknown }): Promise<Res> {
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
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
      return res;
    },
  };
  const req = { method: opts.method, query: {}, body: opts.body, cookies, headers: {} };
  await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse, store);
  return out;
}

const NEW_SPELL = {
  level: 1,
  school: "divination",
  time: "Action",
  range: "Self",
  components: "V, S",
  duration: "Instantaneous",
  text: "You learn which way is north, and how far you are below the sea, as long as you're on the same plane.",
  higher: "",
};

const writes = [
  ["add", { method: "POST", body: { name: "Know North", info: NEW_SPELL } }],
  ["edit", { method: "PUT", body: { name: "Aid", info: { ...NEW_SPELL, level: 2 } } }],
  ["delete", { method: "DELETE", body: { name: "Aid" } }],
] as const;

const book = (store: SpellBookStore) => fs.readFileSync(store.file, "utf8");

describe("spell book API", () => {
  it.each([["list", { method: "GET" }], ...writes] as const)("%s refuses players and strangers", async (_name, req) => {
    for (const role of ["table", null] as const) {
      const store = tempStore(true);
      const before = book(store);
      const res = await call(store, { ...req, role });
      expect(res.statusCode).toBe(role ? 403 : 401);
      expect(JSON.stringify(res.body)).not.toContain("Armor of Agathys");
      expect(book(store)).toBe(before);
    }
  });

  it("is read-only for the GM when the gate is shut, and says why", async () => {
    const store = tempStore(false);
    const before = book(store);
    const list = await call(store, { role: "gm", method: "GET" });
    expect(list.statusCode).toBe(200);
    expect(list.body).toMatchObject({ gate: { writable: false, reason: "deployed: read-only" }, spells: { Aid: { level: 2 } } });
    expect(list.headers["cache-control"]).toBe("private, no-store");
    for (const [name, req] of writes) {
      const res = await call(store, { ...req, role: "gm" });
      expect(res.statusCode, name).toBe(403);
      expect(res.body, name).toMatchObject({ error: "deployed: read-only", readOnly: true });
    }
    expect(book(store)).toBe(before);
  });

  it("adds a spell that passes spellBookSchema, in alphabetical order, atomically", async () => {
    const store = tempStore(true);
    const res = await call(store, { role: "gm", method: "POST", body: { name: "Know North", info: NEW_SPELL } });
    expect(res).toMatchObject({ statusCode: 201, body: { name: "Know North", changed: ["content/rules/spells.json"] } });

    const text = book(store);
    const saved = spellBookSchema.parse(JSON.parse(text));
    expect(saved["Know North"]).toMatchObject({ level: 1, school: "divination", concentration: false, ritual: false });
    // An empty higher on the base means none, so it's left out; formatting is the builder's.
    expect(saved["Know North"]).not.toHaveProperty("higher");
    expect(text).toBe(formatJson(JSON.parse(text)));
    const names = Object.keys(saved);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(fs.readdirSync(path.dirname(store.file)).filter((f) => f.includes(".tmp-"))).toEqual([]);
    // The loader reads it back.
    expect(loadSpellBook(store.file)["Know North"].text).toBe(NEW_SPELL.text);
  });

  it("won't add over an existing spell, but edits one in place", async () => {
    const store = tempStore(true);
    const taken = await call(store, { role: "gm", method: "POST", body: { name: "Aid", info: NEW_SPELL } });
    expect(taken.statusCode).toBe(409);

    const edited = await call(store, {
      role: "gm",
      method: "PUT",
      body: { name: "Aid", info: { ...NEW_SPELL, level: 2, "2014": { higher: "", duration: "1 hour" } } },
    });
    expect(edited.statusCode).toBe(200);
    const saved = spellBookSchema.parse(JSON.parse(book(store)));
    expect(saved.Aid["2014"]).toEqual({ higher: "", duration: "1 hour" });
    expect(saved.Aid.text).toBe(NEW_SPELL.text);

    // Saving the same thing again touches nothing.
    const again = await call(store, { role: "gm", method: "PUT", body: { name: "Aid", info: saved.Aid } });
    expect(again.body).toMatchObject({ changed: [] });
  });

  it("rejects entries the schema rejects, and bad names", async () => {
    const store = tempStore(true);
    const before = book(store);
    for (const [name, info] of [
      ["Too Short", { ...NEW_SPELL, text: "Short." }],
      ["Too Long", { ...NEW_SPELL, text: "x".repeat(301) }],
      ["Bad School", { ...NEW_SPELL, school: "pyromancy" }],
      ["Level Ten", { ...NEW_SPELL, level: 10 }],
      ["", NEW_SPELL],
      [" Padded ", NEW_SPELL],
    ] as const) {
      const res = await call(store, { role: "gm", method: "POST", body: { name, info } });
      expect(res.statusCode, name).toBe(400);
    }
    expect((await call(store, { role: "gm", method: "POST", body: { info: NEW_SPELL } })).statusCode).toBe(400);
    expect(book(store)).toBe(before);
  });

  it("won't delete a spell a one-shot still uses, and deletes one nobody uses", async () => {
    const store = tempStore(true);
    const used = await call(store, { role: "gm", method: "DELETE", body: { name: "Bless" } });
    expect(used.statusCode).toBe(409);
    expect((used.body as { error: string }).error).toContain("the-drowned-bell");

    await call(store, { role: "gm", method: "POST", body: { name: "Know North", info: NEW_SPELL } });
    const gone = await call(store, { role: "gm", method: "DELETE", body: { name: "Know North" } });
    expect(gone).toMatchObject({ statusCode: 200, body: { changed: ["content/rules/spells.json"] } });
    expect(spellBookSchema.parse(JSON.parse(book(store)))).not.toHaveProperty("Know North");
    expect((await call(store, { role: "gm", method: "DELETE", body: { name: "Know North" } })).statusCode).toBe(404);
  });
});

describe("loadSpellBook cache", () => {
  it("picks up an edit to the file without a restart", async () => {
    const store = tempStore(true);
    expect(loadSpellBook(store.file)).not.toHaveProperty("Know North");
    await store.put("Know North", NEW_SPELL);
    expect(loadSpellBook(store.file)["Know North"].level).toBe(1);
  });
});
