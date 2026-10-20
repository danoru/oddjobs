import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs, spellBookFor } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicDhOneShot, type PublicOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import { CardsView } from "@/systems/dnd5e/components/cards/CardsView";
import { DhCardsView } from "@/systems/daggerheart/pages/Printables";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = { os: PublicOneShot; book: Record<string, SpellInfo> } | { os: PublicDhOneShot; book?: undefined };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "cards"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk<Props>(async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  if (os.system === "daggerheart") return { props: { os: toPublic(os) } };
  if (os.system !== "dnd5e") return { notFound: true };
  return { props: { os: toPublic(os), book: spellBookFor(os) } };
});

/** Every card for the cast: 5e spells, items and features, or Daggerheart domain cards, weapons and features. */
export default function CastCardsPage(props: Props) {
  return props.os.system === "daggerheart" ? <DhCardsView os={props.os} /> : <CardsView os={props.os} book={props.book!} />;
}
