import Head from "next/head";

/**
 * Link-preview tags (Open Graph and Twitter), so a link pasted into Discord
 * unfurls as a poster card. The image comes from /api/og (src/app/api/og),
 * and must be an absolute URL: build it with `siteOrigin`.
 */
export function OgMeta({ title, description, image, url }: { title: string; description: string; image: string; url: string }) {
  return (
    <Head>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Oddjobs" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={`${title}: a notice pinned to the Oddjobs board`} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="theme-color" content="#9e2f22" />
    </Head>
  );
}
