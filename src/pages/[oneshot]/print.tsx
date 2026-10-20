import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicDhOneShot, type PublicOneShot } from "@/lib/public";
import { hasRoute } from "@/systems/registry";
import { PrintCastPage } from "@/systems/dnd5e/pages/PrintPage";
import { DhPrintCastPage } from "@/systems/daggerheart/pages/Printables";
import { onlyIfOnDisk } from "@/lib/onDisk";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "print"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

type Props = { os: PublicOneShot | PublicDhOneShot };

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk<Props>(async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  if (os.system === "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) as PublicOneShot | PublicDhOneShot } };
});

/** Every character sheet, ready to print. (Ten Candles prints its table kit at /<slug>/kit.) */
export default function PrintPage({ os }: Props) {
  return os.system === "daggerheart" ? <DhPrintCastPage os={os} /> : <PrintCastPage os={os} />;
}
