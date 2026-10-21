import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Alert, Container } from "@mui/material";
import { requestRole } from "@/lib/auth";
import { loadSpellBook } from "@/lib/content";
import { getStore } from "@/lib/store";
import { isSafeId } from "@/lib/store/doc";
import { checkDoc } from "@/lib/oneShotCheck";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { JobPage } from "@/components/board/JobPage";
import { CharacterPage } from "@/systems/dnd5e/pages/CharacterPage";
import { PrintCastPage } from "@/systems/dnd5e/pages/PrintPage";
import { PremadePage } from "@/systems/tencandles/pages/PremadePage";
import { CharacterPage as DhCharacterPage } from "@/systems/daggerheart/pages/CharacterPage";
import { DhPrintCastPage } from "@/systems/daggerheart/pages/Printables";
import { CharacterPage as PaCharacterPage } from "@/systems/paranoia/pages/CharacterPage";
import { PaPrintCastPage } from "@/systems/paranoia/pages/Printables";

type Props =
  | { slug: string; page: string | null; os: PublicAnyOneShot; problems: null }
  | { slug: string; page: string | null; os: null; problems: string[] };

/**
 * The real player pages, rendered from the newest saved version (the draft
 * if there is one): /admin/preview/<slug> is the job page,
 * /admin/preview/<slug>/<id> a sheet or pre-made, /admin/preview/<slug>/print
 * every 5e or Daggerheart sheet ready to print. GM only, never static. Links on them lead to
 * the published site.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, resolvedUrl }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  const [slug, page = null, ...rest] = (params?.path as string[] | undefined) ?? [];
  if (!isSafeId(slug) || rest.length || (page !== null && !isSafeId(page))) return { notFound: true };
  const got = await getStore().get(slug);
  if (!got) return { notFound: true };
  res.setHeader("Cache-Control", "private, no-store");
  const { issues, parsed } = checkDoc((got.draft ?? got.published)!, loadSpellBook());
  if (!parsed) return { props: { slug, page, os: null, problems: issues.map((i) => `${i.path.join(".")}: ${i.message}`) } };
  if (page && page !== "print" && !parsed.cast.some((c) => c.id === page)) return { notFound: true };
  if (page === "print" && parsed.system === "tencandles") return { notFound: true };
  return { props: { slug, page, os: toPublic(parsed), problems: null } };
};

export default function PreviewPage({ slug, page, os, problems }: Props) {
  if (!os)
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Head>
          <title>Preview · Oddjobs</title>
        </Head>
        <Alert severity="warning">
          The saved version of <Link href={`/admin/${slug}`}>{slug}</Link> doesn&apos;t pass the checks yet, so it can&apos;t be shown as players
          would see it. Fix these in the builder:
          <ul>
            {problems.slice(0, 30).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Alert>
      </Container>
    );
  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      {page === null ? (
        <JobPage os={os} cameos={[]} />
      ) : page === "print" && os.system === "dnd5e" ? (
        <PrintCastPage os={os} />
      ) : page === "print" && os.system === "paranoia" ? (
        <PaPrintCastPage os={os} />
      ) : os.system === "paranoia" ? (
        <PaCharacterPage os={os} id={page} />
      ) : page === "print" && os.system === "daggerheart" ? (
        <DhPrintCastPage os={os} />
      ) : os.system === "daggerheart" ? (
        <DhCharacterPage os={os} id={page} />
      ) : os.system === "dnd5e" ? (
        <CharacterPage os={os} id={page} />
      ) : (
        <PremadePage os={os} id={page} />
      )}
      {/* After the page, so its skip link stays the first thing on it. */}
      <aside
        aria-label="Builder preview"
        className="no-print"
        style={{ position: "sticky", bottom: 0, zIndex: 50, background: "var(--wax)", color: "#fff3df", padding: "6px 16px", fontFamily: "var(--font-label)" }}
      >
        Preview of the saved draft of <Link href={`/admin/${slug}`}>{os.title}</Link>. Links on this page lead to the published site.
      </aside>
    </>
  );
}
