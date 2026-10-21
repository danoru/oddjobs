import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs, spellBookFor } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicDhOneShot, type PublicOneShot, type PublicPaOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import { CardsView } from "@/systems/dnd5e/components/cards/CardsView";
import { DhCardsView } from "@/systems/daggerheart/pages/Printables";
import { PaCardsView } from "@/systems/paranoia/pages/Printables";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = ({ os: PublicOneShot; book: Record<string, SpellInfo> } | { os: PublicDhOneShot; book?: undefined } | { os: PublicPaOneShot; book?: undefined }) & { id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .map((slug) => loadOneShot(slug))
    .filter((os) => hasRoute(os, "cards"))
    .flatMap((os) => os.cast.map((c) => ({ params: { oneshot: os.slug, character: c.id } }))),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk<Props>(async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  const id = String(params!.character);
  if (os.system === "daggerheart") return { props: { os: toPublic(os), id } };
  if (os.system === "paranoia") return { props: { os: toPublic(os), id } };
  if (os.system !== "dnd5e") return { notFound: true };
  return { props: { os: toPublic(os), id, book: spellBookFor(os) } };
});

export default function CharacterCardsPage(props: Props) {
  if (props.os.system === "paranoia") return <PaCardsView os={props.os} only={props.id} />;
  return props.os.system === "daggerheart" ? <DhCardsView os={props.os} only={props.id} /> : <CardsView os={props.os} only={props.id} book={props.book!} />;
}
