import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Container } from "@mui/material";
import { pageViewer } from "@/lib/auth";
import { profileFor, type Profile } from "@/lib/profile.server";
import { SiteHeader } from "@/components/SiteHeader";
import { Cabinet, JobRecord, WantedPoster } from "@/components/profile/WantedPoster";
import b from "@/components/board/Board.module.css";
import s from "@/components/profile/Profile.module.css";

type Props = { profile: Profile };

/**
 * A member's WANTED poster: their woodcut, name and pronouns, the titles and
 * scars the paper gave their characters, the bounty (jobs survived) and the
 * record of every game they saw to the end. Members only: a guest or a
 * stranger goes to the door (the proxy sends them there too). Secrets stay
 * off it, except your own once they came out at the table.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl, params }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "member");
  if (gate.redirect) return { redirect: gate.redirect };
  res.setHeader("Cache-Control", "private, no-store");
  const profile = await profileFor(String(params?.username ?? ""), gate.viewer);
  if (!profile) return { notFound: true };
  return { props: { profile } };
};

export default function ProfilePage({ profile }: Props) {
  return (
    <>
      <Head>
        <title>{`${profile.displayName} · Wanted · Oddjobs`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/board", label: "the board" }} />
        <main id="main" tabIndex={-1}>
          <div className={b.frame}>
            <div className={s.layout}>
              <WantedPoster profile={profile} />
              <JobRecord profile={profile} />
            </div>
            <Cabinet entries={profile.history} />
          </div>
        </main>
      </Container>
    </>
  );
}
