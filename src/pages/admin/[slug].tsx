import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Container } from "@mui/material";
import { requestRole } from "@/lib/auth";
import { loadSpellBook } from "@/lib/content";
import { getStore } from "@/lib/store";
import { isSafeId } from "@/lib/store/doc";
import { Builder, type BuilderProps } from "@/components/admin/Builder";

/**
 * Editing one one-shot. GM only, rendered per request: drafts and GM-only
 * fields never get a static page. On a deployed build the store can't
 * write, so the builder opens read-only and says why.
 */
export const getServerSideProps: GetServerSideProps<BuilderProps> = async ({ req, res, params, resolvedUrl }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  const slug = String(params?.slug ?? "");
  if (!isSafeId(slug)) return { notFound: true };
  const store = getStore();
  const got = await store.get(slug);
  if (!got) return { notFound: true };
  res.setHeader("Cache-Control", "private, no-store");
  return {
    props: {
      slug,
      initial: (got.draft ?? got.published)!,
      status: got.status,
      hasPublished: Boolean(got.published),
      spells: loadSpellBook(),
      gate: JSON.parse(JSON.stringify(store.gate())),
    },
  };
};

export default function BuilderPage(props: BuilderProps) {
  const title = typeof props.initial.oneshot.title === "string" ? props.initial.oneshot.title : props.slug;
  return (
    <>
      <Head>
        <title>{`Builder · ${title} · Oddjobs`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth={false} sx={{ pb: 8, pt: 2, maxWidth: 1800 }}>
        <Builder {...props} />
      </Container>
    </>
  );
}
