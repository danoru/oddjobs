import Head from "next/head";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Container } from "@mui/material";
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic } from "@/lib/public";
import type { Sounds } from "@/lib/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { Soundboard } from "@/components/sound/Soundboard";

type Props = { slug: string; title: string; sounds: Sounds | null };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const os = toPublic(loadOneShot(String(params!.oneshot)));
  return { props: { slug: os.slug, title: os.title, sounds: os.sounds ?? null } };
};

/** The GM's one-tap soundboard: synthesised ambience beds and stingers, built for a phone on the table. */
export default function SoundsPage({ slug, title, sounds }: Props) {
  return (
    <>
      <Head>
        <title>{`Sounds · ${title} · Tear-Off`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="md" sx={{ pb: 0 }}>
        <SiteHeader back={{ href: `/${slug}`, label: title }} />
        <Soundboard title={title} sounds={sounds} />
      </Container>
    </>
  );
}
