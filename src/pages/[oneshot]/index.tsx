import type { GetStaticPaths, GetStaticProps } from "next";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { cameosFor, type Survivor } from "@/lib/legacy";
import { loadSurvivors } from "@/lib/legacy.server";
import { JobPage } from "@/components/board/JobPage";
import { onlyIfOnDisk } from "@/lib/onDisk";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicAnyOneShot; cameos: Survivor[] }> = onlyIfOnDisk(async ({ params }) => {
  const slug = String(params!.oneshot);
  return { props: { os: toPublic(loadOneShot(slug)), cameos: cameosFor(slug, loadSurvivors()) } };
});

export default JobPage;
