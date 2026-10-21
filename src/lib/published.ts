import type { GetStaticPaths, GetStaticProps, GetStaticPropsContext, GetStaticPropsResult } from "next";
import { hasRoute, type SystemRoutes } from "@/systems/registry";
import type { OneShotWithCast } from "./schema";
import { publishedOneShot, publishedOneShots, revalidateSeconds } from "./source";

/**
 * getStaticPaths and getStaticProps for the player pages under /<oneshot>.
 * They're built from the published one-shots known at build time, and any
 * other path renders on its first visit (`fallback: "blocking"`), so a
 * one-shot published later in the database is on the site at once. A
 * one-shot that isn't published (a draft, unpublished, deleted) or a
 * character it doesn't have is a 404. With the database, publishing also
 * revalidates the pages straight away (src/lib/revalidate.ts).
 */

type Route = keyof SystemRoutes;

export function publishedPaths(opts: { route?: Route; perCharacter?: boolean } = {}): GetStaticPaths {
  return async () => {
    let all: OneShotWithCast[] = [];
    try {
      all = (await publishedOneShots()).filter((os) => !opts.route || hasRoute(os, opts.route));
    } catch (e) {
      // Files fail the build on a broken one-shot, as always. A database that can't be
      // reached at build time just means every page renders on its first visit.
      if (!(e instanceof Error) || !e.name.startsWith("PrismaClient")) throw e;
      console.warn(`[content] no paths at build time: ${e.message.split("\n")[0]}`);
    }
    return {
      paths: all.flatMap((os) =>
        opts.perCharacter ? os.cast.map((c) => ({ params: { oneshot: os.slug, character: c.id } })) : [{ params: { oneshot: os.slug } }],
      ),
      fallback: "blocking",
    };
  };
}

/**
 * Loads the published one-shot named by the path (404 unless it's published,
 * has the character, and its system has the route), then hands it to `fn`.
 */
export function withPublished<P extends { [key: string]: unknown }>(
  fn: (os: OneShotWithCast, ctx: GetStaticPropsContext) => GetStaticPropsResult<P> | Promise<GetStaticPropsResult<P>>,
  opts: { route?: Route } = {},
): GetStaticProps<P> {
  return async (ctx) => {
    const os = await publishedOneShot(String(ctx.params?.oneshot ?? ""));
    if (!os || (opts.route && !hasRoute(os, opts.route))) return { notFound: true, revalidate: revalidateSeconds() || undefined };
    const character = ctx.params?.character;
    if (character !== undefined && !os.cast.some((c) => c.id === String(character))) return { notFound: true, revalidate: revalidateSeconds() || undefined };
    const result = await fn(os, ctx);
    return "props" in result ? { ...result, revalidate: result.revalidate ?? revalidateSeconds() } : result;
  };
}
