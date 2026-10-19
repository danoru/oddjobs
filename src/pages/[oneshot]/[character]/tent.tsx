import type { GetStaticPaths, GetStaticProps } from "next";
import { load5e, loadOneShot, publishedSlugs } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { TentsView } from "@/systems/dnd5e/components/tents/TentsView";

type Props = { os: PublicOneShot; id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "tents"))
    .flatMap((slug) => load5e(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } }))),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => ({
  props: { os: toPublic(load5e(String(params!.oneshot))), id: String(params!.character) },
});

export default function CharacterTentPage({ os, id }: Props) {
  return <TentsView os={os} only={id} />;
}
