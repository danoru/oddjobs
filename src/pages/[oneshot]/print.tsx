import type { GetStaticPaths, GetStaticProps } from "next";
import { load5e, loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { hasRoute } from "@/systems/registry";
import { PrintCastPage } from "@/systems/dnd5e/pages/PrintPage";
import { onlyIfOnDisk } from "@/lib/onDisk";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "print"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot }> = onlyIfOnDisk(async ({ params }) => ({
  props: { os: toPublic(load5e(String(params!.oneshot))) },
}));

/** Every character sheet, ready to print. (Ten Candles prints its table kit at /<slug>/kit.) */
export default function PrintPage({ os }: { os: PublicOneShot }) {
  return <PrintCastPage os={os} />;
}
