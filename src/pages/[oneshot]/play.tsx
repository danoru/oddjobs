import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicTcOneShot } from "@/lib/public";
import { PlayPage } from "@/systems/tencandles/pages/PlayPage";
import { publishedPaths, withPublished } from "@/lib/published";

/** The phone at the table, for systems with live play (Ten Candles). */
export const getStaticPaths: GetStaticPaths = publishedPaths({ route: "play" });

export const getStaticProps: GetStaticProps<{ os: PublicTcOneShot }> = withPublished<{ os: PublicTcOneShot }>((os) => {
  if (os.system !== "tencandles") return { notFound: true };
  return { props: { os: toPublic(os) } };
}, { route: "play" });

export default function Play({ os }: { os: PublicTcOneShot }) {
  return <PlayPage os={os} />;
}
