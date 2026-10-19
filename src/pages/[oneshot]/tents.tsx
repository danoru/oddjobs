import type { GetStaticPaths, GetStaticProps } from "next";
import { load5e, loadOneShot, publishedSlugs } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { TentsView } from "@/systems/dnd5e/components/tents/TentsView";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "tents"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot }> = async ({ params }) => ({
  props: { os: toPublic(load5e(String(params!.oneshot))) },
});

export default function CastTentsPage({ os }: { os: PublicOneShot }) {
  return <TentsView os={os} />;
}
