import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicOneShot } from "@/lib/public";
import { TentsView } from "@/components/tents/TentsView";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicOneShot }> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
});

export default function CastTentsPage({ os }: { os: PublicOneShot }) {
  return <TentsView os={os} />;
}
