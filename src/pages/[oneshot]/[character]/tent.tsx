import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicDhOneShot, type PublicOneShot, type PublicPaOneShot } from "@/lib/public";
import { TentsView } from "@/systems/dnd5e/components/tents/TentsView";
import { DhTentsView } from "@/systems/daggerheart/pages/Printables";
import { PaTentsView } from "@/systems/paranoia/pages/Printables";
import { publishedPaths, withPublished } from "@/lib/published";

type Props = { os: PublicOneShot | PublicDhOneShot | PublicPaOneShot; id: string };

export const getStaticPaths: GetStaticPaths = publishedPaths({ route: "tents", perCharacter: true });

export const getStaticProps: GetStaticProps<Props> = withPublished<Props>((os, { params }) => {
  if (os.system === "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) as PublicOneShot | PublicDhOneShot | PublicPaOneShot, id: String(params!.character) } };
});

export default function CharacterTentPage({ os, id }: Props) {
  if (os.system === "paranoia") return <PaTentsView os={os} only={id} />;
  return os.system === "daggerheart" ? <DhTentsView os={os} only={id} /> : <TentsView os={os} only={id} />;
}
