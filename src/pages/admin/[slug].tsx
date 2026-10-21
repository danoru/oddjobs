import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Container } from "@mui/material";
import { pageViewer } from "@/lib/auth";
import { spellBook } from "@/lib/source";
import { storeFor } from "@/lib/store";
import { isSafeId } from "@/lib/store/doc";
import { Builder, type BuilderProps } from "@/components/admin/Builder";

/**
 * Editing one one-shot. Its author or an admin only (someone else's is a 404), rendered per request: drafts and GM-only
 * fields never get a static page. On a deployed build the FileStore can't
 * write, so the builder opens read-only and says why; the DbStore can.
 */
export const getServerSideProps: GetServerSideProps<BuilderProps> = async ({ req, res, params, resolvedUrl }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "author");
  if (gate.redirect) return { redirect: gate.redirect };
  const slug = String(params?.slug ?? "");
  if (!isSafeId(slug)) return { notFound: true };
  const store = storeFor(gate.viewer);
  const got = await store.get(slug);
  if (!got) return { notFound: true };
  res.setHeader("Cache-Control", "private, no-store");
  return {
    props: {
      slug,
      initial: (got.draft ?? got.published)!,
      status: got.status,
      hasPublished: Boolean(got.published),
      spells: await spellBook(),
      gate: JSON.parse(JSON.stringify(store.gate())),
      hasHistory: Boolean(store.history),
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
