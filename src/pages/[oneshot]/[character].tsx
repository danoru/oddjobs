import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { CharacterPage as Dnd5eCharacter } from "@/systems/dnd5e/pages/CharacterPage";
import { PremadePage } from "@/systems/tencandles/pages/PremadePage";
import { CharacterPage as DhCharacter } from "@/systems/daggerheart/pages/CharacterPage";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = { os: PublicAnyOneShot; id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().flatMap((slug) =>
    loadOneShot(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk(async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))), id: String(params!.character) },
}));

/** A character's own page: the 5e or Daggerheart sheet, or a Ten Candles pre-made concept. */
export default function CharacterPage({ os, id }: Props) {
  if (os.system === "dnd5e") return <Dnd5eCharacter os={os} id={id} />;
  if (os.system === "daggerheart") return <DhCharacter os={os} id={id} />;
  return <PremadePage os={os} id={id} />;
}
