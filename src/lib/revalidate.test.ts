import { describe, expect, it } from "vitest";
import { loadOneShot } from "./content";
import { cardPagesOf, pagesOf, pagesOfDoc, revalidatePages } from "./revalidate";

describe("pagesOf", () => {
  it("lists every static page of a 5e one-shot, per character too", () => {
    const os = loadOneShot("the-drowned-bell");
    const pages = pagesOf(os);
    const id = os.cast[0].id;
    expect(pages).toEqual(
      expect.arrayContaining([
        "/the-drowned-bell",
        "/the-drowned-bell/print",
        "/the-drowned-bell/cards",
        "/the-drowned-bell/tents",
        "/the-drowned-bell/flyer",
        "/the-drowned-bell/tv",
        "/the-drowned-bell/sounds",
        "/the-drowned-bell/epilogue",
        "/the-drowned-bell/tapestry",
        `/the-drowned-bell/${id}`,
        `/the-drowned-bell/${id}/cards`,
        `/the-drowned-bell/${id}/tent`,
      ]),
    );
    expect(pages).toHaveLength(9 + os.cast.length * 3);
    // GM pages render per request, so they're never listed.
    expect(pages.some((p) => /\/(gm|kit|box)$/.test(p))).toBe(false);
    expect(pages).not.toContain("/the-drowned-bell/play");
    expect(cardPagesOf(os)).toEqual(["/the-drowned-bell/cards", ...os.cast.map((c) => `/the-drowned-bell/${c.id}/cards`)]);
  });

  it("follows the system's routes: Ten Candles has play, no sheets' printables", () => {
    const os = loadOneShot("lights-out-at-marrowby");
    const pages = pagesOf(os);
    expect(pages).toContain("/lights-out-at-marrowby/play");
    expect(pages.filter((p) => /\/(print|cards|tents|tent)$/.test(p))).toEqual([]);
    expect(pages).toContain(`/lights-out-at-marrowby/${os.cast[0].id}`);
  });

  it("lists nothing for a doc it can't trust", () => {
    expect(pagesOfDoc(null)).toEqual([]);
    expect(pagesOf({ slug: "../x", system: "dnd5e", cast: [] })).toEqual([]);
    expect(pagesOf({ slug: "fine", system: "nope", cast: [] })).toEqual([]);
    expect(pagesOf({ slug: "fine", system: "tencandles", cast: [{ id: "../up" }] })).not.toContain("/fine/../up");
  });
});

describe("revalidatePages", () => {
  const recorder = (fail: Record<string, string> = {}) => {
    const asked: string[] = [];
    return {
      asked,
      res: {
        async revalidate(p: string) {
          asked.push(p);
          if (fail[p]) throw new Error(fail[p]);
        },
      },
    };
  };

  it("asks for each path once and counts a 404 as done (the page is gone, as it should be)", async () => {
    const { asked, res } = recorder({ "/gone": "Invalid response 404", "/broken": "Invalid response 500" });
    const out = await revalidatePages(res, ["/", "/a", "/a", "/gone", "/broken"], { enabled: true });
    expect(asked.sort()).toEqual(["/", "/a", "/broken", "/gone"]);
    expect(out.done.sort()).toEqual(["/", "/a", "/gone"]);
    expect(out.failed).toEqual([{ path: "/broken", error: "Invalid response 500" }]);
  });

  it("does nothing outside a production server, or without res.revalidate", async () => {
    const { asked, res } = recorder();
    expect(await revalidatePages(res, ["/"], { enabled: false })).toEqual({ done: [], failed: [] });
    expect(asked).toEqual([]);
    expect(await revalidatePages({}, ["/"], { enabled: true })).toEqual({ done: [], failed: [] });
  });
});
