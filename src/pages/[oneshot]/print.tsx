import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicDhOneShot, type PublicOneShot, type PublicPaOneShot } from "@/lib/public";
import { PrintCastPage } from "@/systems/dnd5e/pages/PrintPage";
import { DhPrintCastPage } from "@/systems/daggerheart/pages/Printables";
import { PaPrintCastPage } from "@/systems/paranoia/pages/Printables";
import { publishedPaths, withPublished } from "@/lib/published";

export const getStaticPaths: GetStaticPaths = publishedPaths({ route: "print" });

type Props = { os: PublicOneShot | PublicDhOneShot | PublicPaOneShot };

export const getStaticProps: GetStaticProps<Props> = withPublished<Props>((os) => {
  if (os.system === "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) as Props["os"] } };
}, { route: "print" });

/** Every character sheet, ready to print. (Ten Candles prints its table kit at /<slug>/kit.) */
export default function PrintPage({ os }: Props) {
  if (os.system === "paranoia") return <PaPrintCastPage os={os} />;
  return os.system === "daggerheart" ? <DhPrintCastPage os={os} /> : <PrintCastPage os={os} />;
}
