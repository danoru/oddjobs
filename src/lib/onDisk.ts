import fs from "node:fs";
import path from "node:path";
import type { GetStaticProps, GetStaticPropsContext } from "next";
import { CONTENT_ROOT } from "./content";

/**
 * Wraps a one-shot page's getStaticProps so a one-shot (or character) that
 * isn't on disk is a 404. A production build never asks for one, but a dev
 * server keeps each page's list of paths for a moment, so right after the
 * builder unpublishes or deletes something it can still ask.
 */
export function onlyIfOnDisk<P extends { [key: string]: unknown }>(fn: GetStaticProps<P>): GetStaticProps<P> {
  return (ctx: GetStaticPropsContext) => {
    const slug = String(ctx.params?.oneshot ?? "");
    const character = ctx.params?.character;
    const safe = (x: string) => /^[a-z0-9-]+$/.test(x);
    if (!safe(slug) || !fs.existsSync(path.join(CONTENT_ROOT, slug, "oneshot.json"))) return { notFound: true };
    if (character !== undefined) {
      const id = String(character);
      if (!safe(id) || !fs.existsSync(path.join(CONTENT_ROOT, slug, "characters", `${id}.json`))) return { notFound: true };
    }
    return fn(ctx);
  };
}
