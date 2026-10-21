import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicDhOneShot, type PublicOneShot, type PublicPaOneShot } from "@/lib/public";
import type { SpellInfo } from "@/systems/dnd5e/schema";
import { CardsView } from "@/systems/dnd5e/components/cards/CardsView";
import { DhCardsView } from "@/systems/daggerheart/pages/Printables";
import { PaCardsView } from "@/systems/paranoia/pages/Printables";
import { publishedPaths, withPublished } from "@/lib/published";
import { spellBookFor } from "@/lib/source";

type Props = { os: PublicOneShot; book: Record<string, SpellInfo> } | { os: PublicDhOneShot; book?: undefined } | { os: PublicPaOneShot; book?: undefined };

export const getStaticPaths: GetStaticPaths = publishedPaths({ route: "cards" });

export const getStaticProps: GetStaticProps<Props> = withPublished<Props>(async (os) => {
  if (os.system === "daggerheart") return { props: { os: toPublic(os) } };
  if (os.system === "paranoia") return { props: { os: toPublic(os) } };
  if (os.system !== "dnd5e") return { notFound: true };
  return { props: { os: toPublic(os), book: await spellBookFor(os) } };
}, { route: "cards" });

/** Every card for the cast: 5e spells, items and features, or Daggerheart domain cards, weapons and features. */
export default function CastCardsPage(props: Props) {
  if (props.os.system === "paranoia") return <PaCardsView os={props.os} />;
  return props.os.system === "daggerheart" ? <DhCardsView os={props.os} /> : <CardsView os={props.os} book={props.book!} />;
}
