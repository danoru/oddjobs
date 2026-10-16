import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs, spellBookFor } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import type { SpellInfo } from "@/lib/schema";
import { CardsView } from "@/components/cards/CardsView";

type Props = { os: PublicOneShot; book: Record<string, SpellInfo> };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  return { props: { os: toPublic(os), book: spellBookFor(os) } };
};

export default function CastCardsPage({ os, book }: Props) {
  return <CardsView os={os} book={book} />;
}
