import type { GetStaticPaths, GetStaticProps } from "next";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { cameosFor, type Survivor } from "@/lib/legacy";
import { JobPage } from "@/components/board/JobPage";
import { publishedPaths, withPublished } from "@/lib/published";
import { survivors } from "@/lib/source";

export const getStaticPaths: GetStaticPaths = publishedPaths();

export const getStaticProps: GetStaticProps<{ os: PublicAnyOneShot; cameos: Survivor[] }> = withPublished(async (os) => ({
  props: { os: toPublic(os), cameos: cameosFor(os.slug, await survivors()) },
}));

export default JobPage;
