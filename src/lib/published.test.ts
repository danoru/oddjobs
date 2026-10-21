import type { GetStaticPropsContext } from "next";
import { describe, expect, it } from "vitest";
import { publishedPaths, withPublished } from "./published";

const ctx = (params: Record<string, string>) => ({ params }) as unknown as GetStaticPropsContext;

describe("player pages from the published one-shots (files)", () => {
  it("lists the paths known now and renders any other on its first visit", async () => {
    const paths = await publishedPaths({ route: "play" })({});
    expect(paths.fallback).toBe("blocking");
    expect(paths.paths).toEqual([{ params: { oneshot: "lights-out-at-marrowby" } }]);
    const perChar = await publishedPaths({ route: "cards", perCharacter: true })({});
    expect(perChar.paths).toContainEqual({ params: { oneshot: "the-drowned-bell", character: expect.any(String) } });
  });

  it("is a 404 for a one-shot that isn't published, a character it doesn't have, or a route its system lacks", async () => {
    const props = withPublished((os) => ({ props: { title: os.title } }));
    expect(await props(ctx({ oneshot: "the-drowned-bell" }))).toEqual({ props: { title: "The Drowned Bell" }, revalidate: false });
    expect(await props(ctx({ oneshot: "no-such-thing" }))).toMatchObject({ notFound: true });
    expect(await props(ctx({ oneshot: "../content" }))).toMatchObject({ notFound: true });
    expect(await props(ctx({ oneshot: "the-drowned-bell", character: "nobody" }))).toMatchObject({ notFound: true });
    const play = withPublished(() => ({ props: {} }), { route: "play" });
    expect(await play(ctx({ oneshot: "the-drowned-bell" }))).toMatchObject({ notFound: true });
    expect(await play(ctx({ oneshot: "lights-out-at-marrowby" }))).toMatchObject({ props: {} });
  });
});
