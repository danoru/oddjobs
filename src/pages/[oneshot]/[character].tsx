import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { CharacterPage as Dnd5eCharacter } from "@/systems/dnd5e/pages/CharacterPage";
import { PremadePage } from "@/systems/tencandles/pages/PremadePage";

type Props = { os: PublicAnyOneShot; id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().flatMap((slug) =>
    loadOneShot(slug).cast.map((c) => ({ params: { oneshot: slug, character: c.id } })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))), id: String(params!.character) },
});

/** A character's own page: the 5e sheet, or a Ten Candles pre-made concept. */
export default function CharacterPage({ os, id }: Props) {
  return os.system === "dnd5e" ? <Dnd5eCharacter os={os} id={id} /> : <PremadePage os={os} id={id} />;
}
