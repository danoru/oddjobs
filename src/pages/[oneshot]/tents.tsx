import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicDhOneShot, type PublicOneShot, type PublicPaOneShot } from "@/lib/public";
import { TentsView } from "@/systems/dnd5e/components/tents/TentsView";
import { DhTentsView } from "@/systems/daggerheart/pages/Printables";
import { PaTentsView } from "@/systems/paranoia/pages/Printables";
import { publishedPaths, withPublished } from "@/lib/published";

type Props = { os: PublicOneShot | PublicDhOneShot | PublicPaOneShot };

export const getStaticPaths: GetStaticPaths = publishedPaths({ route: "tents" });

export const getStaticProps: GetStaticProps<Props> = withPublished<Props>((os) => {
  if (os.system === "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) as PublicOneShot | PublicDhOneShot | PublicPaOneShot } };
}, { route: "tents" });

export default function CastTentsPage({ os }: Props) {
  if (os.system === "paranoia") return <PaTentsView os={os} />;
  return os.system === "daggerheart" ? <DhTentsView os={os} /> : <TentsView os={os} />;
}
