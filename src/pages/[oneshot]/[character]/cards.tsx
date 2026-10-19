import type { GetStaticPaths, GetStaticProps } from "next";
import { load5e, loadOneShot, publishedSlugs, spellBookFor } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import { CardsView } from "@/systems/dnd5e/components/cards/CardsView";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = { os: PublicOneShot; id: string; book: Record<string, SpellInfo> };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "cards"))
    .flatMap((slug) => load5e(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } }))),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk(async ({ params }) => {
  const os = load5e(String(params!.oneshot));
  return { props: { os: toPublic(os), id: String(params!.character), book: spellBookFor(os) } };
});

export default function CharacterCardsPage({ os, id, book }: Props) {
  return <CardsView os={os} only={id} book={book} />;
}
