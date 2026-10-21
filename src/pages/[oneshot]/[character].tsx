import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { CharacterPage as Dnd5eCharacter } from "@/systems/dnd5e/pages/CharacterPage";
import { PremadePage } from "@/systems/tencandles/pages/PremadePage";
import { CharacterPage as DhCharacter } from "@/systems/daggerheart/pages/CharacterPage";
import { CharacterPage as PaCharacter } from "@/systems/paranoia/pages/CharacterPage";
import { publishedPaths, withPublished } from "@/lib/published";

type Props = { os: PublicAnyOneShot; id: string };

export const getStaticPaths: GetStaticPaths = publishedPaths({ perCharacter: true });

export const getStaticProps: GetStaticProps<Props> = withPublished((os, { params }) => ({
  props: { os: toPublic(os), id: String(params!.character) },
}));

/** A character's own page: the 5e or Daggerheart sheet, or a Ten Candles pre-made concept. */
export default function CharacterPage({ os, id }: Props) {
  if (os.system === "dnd5e") return <Dnd5eCharacter os={os} id={id} />;
  if (os.system === "daggerheart") return <DhCharacter os={os} id={id} />;
  if (os.system === "paranoia") return <PaCharacter os={os} id={id} />;
  return <PremadePage os={os} id={id} />;
}
