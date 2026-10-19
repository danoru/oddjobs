import type { GetStaticPaths, GetStaticProps } from "next";
import { load5e, loadOneShot, publishedSlugs, spellBookFor } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import { CardsView } from "@/systems/dnd5e/components/cards/CardsView";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = { os: PublicOneShot; book: Record<string, SpellInfo> };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "cards"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk(async ({ params }) => {
  const os = load5e(String(params!.oneshot));
  return { props: { os: toPublic(os), book: spellBookFor(os) } };
});

export default function CastCardsPage({ os, book }: Props) {
  return <CardsView os={os} book={book} />;
}
