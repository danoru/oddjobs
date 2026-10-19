import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicTcOneShot } from "@/lib/public";
import { hasRoute } from "@/systems/registry";
import { PlayPage } from "@/systems/tencandles/pages/PlayPage";
import { onlyIfOnDisk } from "@/lib/onDisk";

/** The phone at the table, for systems with live play (Ten Candles). */
export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs()
    .filter((slug) => hasRoute(loadOneShot(slug), "play"))
    .map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicTcOneShot }> = onlyIfOnDisk<{ os: PublicTcOneShot }>(async ({ params }) => {
  const os = loadOneShot(String(params!.oneshot));
  if (os.system !== "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) } };
});

export default function Play({ os }: { os: PublicTcOneShot }) {
  return <PlayPage os={os} />;
}
