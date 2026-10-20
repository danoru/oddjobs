import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicDhOneShot, type PublicOneShot } from "@/lib/public";
import { TentsView } from "@/systems/dnd5e/components/tents/TentsView";
import { DhTentsView } from "@/systems/daggerheart/pages/Printables";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = { os: PublicOneShot | PublicDhOneShot; id: string };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .map((slug) => loadOneShot(slug))
    .filter((os) => hasRoute(os, "tents"))
    .flatMap((os) => os.cast.map((c) => ({ params: { oneshot: os.slug, character: c.id } }))),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk<Props>(async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  if (os.system === "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) as PublicOneShot | PublicDhOneShot, id: String(params!.character) } };
});

export default function CharacterTentPage({ os, id }: Props) {
  return os.system === "daggerheart" ? <DhTentsView os={os} only={id} /> : <TentsView os={os} only={id} />;
}
