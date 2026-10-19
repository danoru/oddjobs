import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listSlugs, loadOneShot, publishedSlugs } from "@/lib/content";
import { contentWriteGate, FileStore, writeFileAtomic } from "./fileStore";
import { PublishError, StoreError } from "./types";
import type { OneShotDoc } from "@/lib/oneShotCheck";
import { removeCharacter } from "./doc";

const REPO_CONTENT = path.join(process.cwd(), "content");
const writable = () => ({ writable: true });

/** A content folder in a temp dir: the spell book plus whichever real one-shots a test wants. */
function tempContent(slugs: string[] = []): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-store-"));
  fs.mkdirSync(path.join(root, "rules"), { recursive: true });
  fs.copyFileSync(path.join(REPO_CONTENT, "rules", "spells.json"), path.join(root, "rules", "spells.json"));
  for (const s of slugs)
    fs.cpSync(path.join(REPO_CONTENT, "oneshots", s), path.join(root, "oneshots", s), { recursive: true });
  return root;
}

/** Every file under a folder with its bytes, for before/after comparisons. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

const tmpLeftovers = (dir: string) => Object.keys(snapshot(dir)).filter((f) => f.includes(".tmp-"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FileStore: paths", () => {
  it("rejects slugs that would leave the content folder", async () => {
    const root = tempContent();
    const store = new FileStore({ root, gate: writable });
    const doc: OneShotDoc = { oneshot: { title: "x" }, cast: [], variants: [] };
    for (const bad of ["../escape", "..", "a/b", "a\\b", "..\\escape", "/abs", "C:", "Upper", "", "trailing-", "a..b"]) {
      await expect(store.saveDraft(bad, doc)).rejects.toBeInstanceOf(StoreError);
      await expect(store.get(bad)).rejects.toBeInstanceOf(StoreError);
      await expect(store.delete(bad)).rejects.toBeInstanceOf(StoreError);
    }
    expect(fs.existsSync(path.join(root, "..", "escape"))).toBe(false);
    expect(fs.existsSync(path.join(root, "drafts"))).toBe(false);
  });

  it("won't publish a character whose id would leave its folder", async () => {
    const root = tempContent(["lights-out-at-marrowby"]);
    const store = new FileStore({ root, gate: writable });
    const doc = (await store.export("lights-out-at-marrowby"))!;
    doc.cast[0] = { ...doc.cast[0], id: "../../evil" };
    await store.saveDraft("lights-out-at-marrowby", doc);
    await expect(store.publish("lights-out-at-marrowby")).rejects.toBeInstanceOf(PublishError);
    expect(fs.existsSync(path.join(root, "evil.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "oneshots", "evil.json"))).toBe(false);
  });

  it("keeps reserved page names free", async () => {
    const root = tempContent(["lights-out-at-marrowby"]);
    const store = new FileStore({ root, gate: writable });
    await expect(store.duplicate("lights-out-at-marrowby", "admin")).rejects.toThrow(/already a page/);
  });
});

describe("FileStore: atomic writes", () => {
  it("leaves no temp files behind", async () => {
    const root = tempContent(["the-drowned-bell"]);
    const store = new FileStore({ root, gate: writable });
    const doc = (await store.export("the-drowned-bell"))!;
    await store.saveDraft("the-drowned-bell", { ...doc, oneshot: { ...doc.oneshot, pitch: "A new pitch." } });
    await store.publish("the-drowned-bell");
    expect(tmpLeftovers(root)).toEqual([]);
  });

  it("never leaves a half-written file when the rename fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-atomic-"));
    const file = path.join(dir, "x.json");
    fs.writeFileSync(file, '{"old":true}\n');
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw Object.assign(new Error("disk on fire"), { code: "EIO" });
    });
    expect(() => writeFileAtomic(file, '{"new":true}\n')).toThrow(/disk on fire/);
    expect(fs.readFileSync(file, "utf8")).toBe('{"old":true}\n');
    expect(fs.readdirSync(dir)).toEqual(["x.json"]);
  });

  it("retries a rename Windows refuses for a moment", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tearoff-atomic-"));
    const file = path.join(dir, "x.json");
    const real = fs.renameSync;
    let calls = 0;
    vi.spyOn(fs, "renameSync").mockImplementation((a, b) => {
      if (calls++ < 2) throw Object.assign(new Error("busy"), { code: "EPERM" });
      real(a, b);
    });
    writeFileAtomic(file, "{}\n");
    expect(fs.readFileSync(file, "utf8")).toBe("{}\n");
    expect(calls).toBe(3);
  });
});

describe("FileStore: drafts and publishing", () => {
  it("keeps drafts off the board until they're published", async () => {
    const root = tempContent(["lights-out-at-marrowby"]);
    const oneshots = path.join(root, "oneshots");
    const store = new FileStore({ root, gate: writable });
    await store.duplicate("lights-out-at-marrowby", "second-night");

    expect(fs.existsSync(path.join(root, "drafts", "second-night", "draft.json"))).toBe(true);
    expect(listSlugs(oneshots)).toEqual(["lights-out-at-marrowby"]);
    expect(publishedSlugs(oneshots)).toEqual(["lights-out-at-marrowby"]);
    const list = await store.list();
    expect(list.map((x) => [x.slug, x.status])).toEqual([
      ["lights-out-at-marrowby", "published"],
      ["second-night", "draft"],
    ]);

    const result = await store.publish("second-night");
    expect(publishedSlugs(oneshots)).toEqual(["lights-out-at-marrowby", "second-night"]);
    expect(loadOneShot("second-night", oneshots).title).toBe("Lights Out at Marrowby (copy)");
    expect(fs.existsSync(path.join(root, "drafts", "second-night"))).toBe(false);
    expect(result.changed).toContain("content/oneshots/second-night/oneshot.json");
    expect(result.changed).toContain("content/drafts/second-night/draft.json");
  });

  it("saves an invalid draft but refuses to publish it, leaving the board untouched", async () => {
    const root = tempContent(["lights-out-at-marrowby"]);
    const store = new FileStore({ root, gate: writable });
    const before = snapshot(path.join(root, "oneshots"));
    const doc = (await store.export("lights-out-at-marrowby"))!;
    const broken = { ...doc, oneshot: { ...doc.oneshot, title: undefined, players: { min: 5, max: 3 } } };
    await store.saveDraft("lights-out-at-marrowby", broken);
    expect((await store.get("lights-out-at-marrowby"))!.status).toBe("changed");
    expect((await store.list())[0].issueCount).toBeGreaterThan(0);

    const err = await store.publish("lights-out-at-marrowby").catch((e) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect((err as PublishError).issues.map((i) => i.path.join("."))).toContain("oneshot.title");
    expect(snapshot(path.join(root, "oneshots"))).toEqual(before);
  });

  it("publishes edits, removes dropped characters and unpublishes back to a draft", async () => {
    const root = tempContent(["lights-out-at-marrowby"]);
    const dir = path.join(root, "oneshots", "lights-out-at-marrowby");
    const store = new FileStore({ root, gate: writable });
    const doc = (await store.export("lights-out-at-marrowby"))!;
    const dropped = doc.cast[3].id as string;
    await store.saveDraft("lights-out-at-marrowby", removeCharacter(doc, dropped));
    const { changed } = await store.publish("lights-out-at-marrowby");
    expect(changed).toContain(`content/oneshots/lights-out-at-marrowby/characters/${dropped}.json`);
    expect(fs.existsSync(path.join(dir, "characters", `${dropped}.json`))).toBe(false);

    await store.unpublish("lights-out-at-marrowby");
    expect(fs.existsSync(dir)).toBe(false);
    const got = (await store.get("lights-out-at-marrowby"))!;
    expect(got.status).toBe("draft");
    expect(got.draft!.cast).toHaveLength(3);
  });

  it("round-trips every real one-shot without changing a byte", async () => {
    const slugs = listSlugs();
    const root = tempContent(slugs);
    const before = snapshot(path.join(root, "oneshots"));
    const store = new FileStore({ root, gate: writable });
    for (const slug of slugs) {
      const got = (await store.get(slug))!;
      expect(got.status).toBe("published");
      await store.saveDraft(slug, got.published!);
      const { changed } = await store.publish(slug);
      expect(changed).toEqual([`content/drafts/${slug}/draft.json`]);
    }
    expect(snapshot(path.join(root, "oneshots"))).toEqual(before);
  });

  it("duplicates, imports, exports and deletes", async () => {
    const root = tempContent(["the-drowned-bell"]);
    const store = new FileStore({ root, gate: writable });
    const doc = (await store.export("the-drowned-bell"))!;
    expect(doc.variants.map((v) => v.level)).toEqual([3]);

    await store.import("bell-again", doc);
    await expect(store.import("bell-again", doc)).rejects.toThrow(/already exists/);
    expect((await store.export("bell-again"))!.oneshot.slug).toBe("bell-again");

    await store.delete("bell-again");
    expect(await store.get("bell-again")).toBeNull();
    await store.delete("the-drowned-bell");
    expect(fs.existsSync(path.join(root, "oneshots", "the-drowned-bell"))).toBe(false);
  });
});

describe("FileStore: write gate", () => {
  it("writes nothing when the gate is shut", async () => {
    const root = tempContent(["lights-out-at-marrowby"]);
    const before = snapshot(root);
    const store = new FileStore({ root, gate: () => ({ writable: false, reason: "read-only here" }) });
    const doc = (await store.export("lights-out-at-marrowby"))!;
    for (const attempt of [
      () => store.saveDraft("lights-out-at-marrowby", doc),
      () => store.publish("lights-out-at-marrowby"),
      () => store.unpublish("lights-out-at-marrowby"),
      () => store.duplicate("lights-out-at-marrowby", "copy"),
      () => store.delete("lights-out-at-marrowby"),
      () => store.import("other", doc),
    ]) {
      const err = await attempt().catch((e) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect((err as StoreError).status).toBe(403);
      expect((err as StoreError).message).toBe("read-only here");
    }
    expect(snapshot(root)).toEqual(before);
    expect((await store.list()).length).toBe(1);
  });

  it("opens only for a local dev server or an explicit flag", () => {
    expect(contentWriteGate({ NODE_ENV: "development" }).writable).toBe(true);
    expect(contentWriteGate({ NODE_ENV: "production", TEAROFF_CONTENT_WRITE: "1" }).writable).toBe(true);
    expect(contentWriteGate({ NODE_ENV: "production" })).toMatchObject({ writable: false, reason: expect.stringMatching(/read-only/) });
    expect(contentWriteGate({ NODE_ENV: "development", TEAROFF_CONTENT_WRITE: "0" }).writable).toBe(false);
    expect(contentWriteGate({ NODE_ENV: "development", TEAROFF_CONTENT_WRITE: "1", VERCEL: "1" }).writable).toBe(false);
    expect(contentWriteGate({ NODE_ENV: "test" }).writable).toBe(false);
  });
});
