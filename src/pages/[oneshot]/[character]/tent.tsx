import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { TentsView } from "@/components/tents/TentsView";

type Props = { os: PublicOneShot; id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().flatMap((slug) =>
    loadOneShot(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))), id: String(params!.character) },
});

export default function CharacterTentPage({ os, id }: Props) {
  return <TentsView os={os} only={id} />;
}
