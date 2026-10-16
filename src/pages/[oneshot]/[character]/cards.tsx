import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs, spellBookFor } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import type { SpellInfo } from "@/lib/schema";
import { CardsView } from "@/components/cards/CardsView";

type Props = { os: PublicOneShot; id: string; book: Record<string, SpellInfo> };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().flatMap((slug) =>
    loadOneShot(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  return { props: { os: toPublic(os), id: String(params!.character), book: spellBookFor(os) } };
};

export default function CharacterCardsPage({ os, id, book }: Props) {
  return <CardsView os={os} only={id} book={book} />;
}
