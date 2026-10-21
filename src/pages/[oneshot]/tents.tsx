import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { hasRoute } from "@/systems/registry";
import { toPublic, type PublicDhOneShot, type PublicOneShot, type PublicPaOneShot } from "@/lib/public";
import { TentsView } from "@/systems/dnd5e/components/tents/TentsView";
import { DhTentsView } from "@/systems/daggerheart/pages/Printables";
import { PaTentsView } from "@/systems/paranoia/pages/Printables";
import { onlyIfOnDisk } from "@/lib/onDisk";

type Props = { os: PublicOneShot | PublicDhOneShot | PublicPaOneShot };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "tents"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = onlyIfOnDisk<Props>(async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  if (os.system === "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) as PublicOneShot | PublicDhOneShot | PublicPaOneShot } };
});

export default function CastTentsPage({ os }: Props) {
  if (os.system === "paranoia") return <PaTentsView os={os} />;
  return os.system === "daggerheart" ? <DhTentsView os={os} /> : <TentsView os={os} />;
}
