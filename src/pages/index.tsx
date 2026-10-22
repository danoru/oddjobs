import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import type { GetStaticProps } from "next";
import { publishedOneShots, revalidateSeconds } from "@/lib/source";
import { toLanding, type LandingJob } from "@/lib/landing";
import { siteOrigin } from "@/lib/siteOrigin";
import { POSTER_ICONS } from "@/lib/coreSchema";
import { PosterIcon } from "@/components/PosterIcon";
import { OgMeta } from "@/components/OgMeta";
import { tiltFor } from "@/components/board/Poster";
import l from "@/components/landing/Landing.module.css";

type Props = { jobs: LandingJob[]; origin: string };

/**
 * The front door, for strangers: public and static (signed-in members go
 * straight to /board, in src/proxy.ts). It shows our own 5e and Ten Candles
 * posters only, through the allowlist in src/lib/landing.ts, so no secret,
 * GM note, letter or licensed system ever reaches this page or its data.
 */
export const getStaticProps: GetStaticProps<Props> = async () => ({
  revalidate: revalidateSeconds(),
  props: { jobs: toLanding(await publishedOneShots()), origin: siteOrigin() },
});

const STEPS = [
  { icon: "eye", title: "Pick a job", text: "Each one-shot is a posting on the tavern board: one night, a handful of strangers, a reason to be in the same room." },
  { icon: "dagger", title: "Tear a poster", text: "Every character is a poster with a hook, a stake in tonight and a secret only you read. Tear yours down on your phone." },
  { icon: "candle", title: "Play tonight", text: "Sheets, cards and dice on the phone, the board on the TV, sealed letters arriving mid-scene. No prep, no homework." },
  { icon: "skull", title: "Keep the scar", text: "The morning after, the paper prints what happened. Survivors walk into other jobs on the board." },
] as const;

const isIcon = (i: string): i is (typeof POSTER_ICONS)[number] => (POSTER_ICONS as readonly string[]).includes(i);
const SYSTEM_LABEL = { dnd5e: "D&D 5e", tencandles: "Ten Candles" } as const;

/** A table code from the GM: sit down at that game as a guest (/t/<code>), no account needed. */
function TableCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      className={l.codeForm}
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.toUpperCase().replace(/[\s-]/g, "");
        if (c) void router.push(`/t/${encodeURIComponent(c)}`);
      }}
    >
      <label htmlFor="table-code" className={l.sub}>
        At a table tonight? Join with the code your GM reads out.
      </label>
      <span className={l.codeRow}>
        <input id="table-code" className={l.codeInput} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={7} autoCapitalize="characters" spellCheck={false} placeholder="ABCDE" />
        <button type="submit" className={l.button}>
          Sit down
        </button>
      </span>
    </form>
  );
}

export default function Landing({ jobs, origin }: Props) {
  const posters = jobs.flatMap((j) => j.posters.map((p) => ({ ...p, job: j.title, system: j.system })));
  return (
    <>
      <Head>
        <title>Oddjobs · odd jobs for one night</title>
      </Head>
      <OgMeta
        title="Oddjobs: odd jobs for one night"
        description="Ready-made one-shots for a table of friends. Pick a job, tear a poster, play tonight, keep the scar."
        image={`${origin}/api/og`}
        url={`${origin}/`}
      />
      <div className={l.page}>
        <nav className={l.topbar} aria-label="Account">
          <Link href="/login" className={l.topLink}>
            Sign in
          </Link>
        </nav>

        <main id="main" tabIndex={-1}>
          <section className={l.hero} aria-labelledby="site-name">
            <div className={l.bracket} aria-hidden="true" />
            <div className={l.sign}>
              <span className={l.chainLeft} aria-hidden="true" />
              <span className={l.chainRight} aria-hidden="true" />
              <h1 id="site-name" className={l.signText}>
                Oddjobs
              </h1>
            </div>
            <p className={l.pitch}>Odd jobs for one night</p>
            <p className={l.lede}>
              Ready-made one-shots for a table of friends. Every character is a poster on the tavern board, with a hook, a stake in tonight and a secret.
              Tear one down and play tonight.
            </p>
            <Link href="/login" className={l.seal}>
              <span>Have an invite?</span>
              <b>Sign in</b>
            </Link>
          </section>

          <section className={l.section} aria-labelledby="how-title">
            <h2 id="how-title" className={l.heading}>
              How it works
            </h2>
            <ol className={l.steps}>
              {STEPS.map((s, i) => (
                <li key={s.title} className={l.step} style={{ ["--tilt" as string]: `${tiltFor(s.title, 1.8)}deg` }}>
                  <span className={l.pin} aria-hidden="true" />
                  <span className={l.stepNo} aria-hidden="true">
                    {["I", "II", "III", "IV"][i]}
                  </span>
                  <PosterIcon icon={s.icon} size={34} />
                  <h3 className={l.stepTitle}>{s.title}</h3>
                  <p className={l.stepText}>{s.text}</p>
                </li>
              ))}
            </ol>
          </section>

          {posters.length > 0 && (
            <section className={l.section} aria-labelledby="board-title">
              <h2 id="board-title" className={l.heading}>
                Pinned to the board
              </h2>
              <p className={l.sub}>A few of the posters waiting tonight, from our own casts.</p>
              {/* Scrolls sideways: focusable, so a keyboard can scroll it too. */}
              <ul className={l.strip} tabIndex={0} aria-labelledby="board-title">
                {posters.map((p, i) => (
                  <li key={`${p.job}-${i}`} className={l.poster} style={{ ["--tilt" as string]: `${tiltFor(p.job + p.name, 2.2)}deg` }}>
                    <span className={l.pin} aria-hidden="true" />
                    <span className={l.posterHeader}>{p.header}</span>
                    {isIcon(p.icon) && <PosterIcon icon={p.icon} size={44} />}
                    <span className={l.posterName}>{p.name}</span>
                    <span className={l.posterEpithet}>{p.epithet}</span>
                    <span className={l.posterHook}>{p.hook}</span>
                    <span className={l.posterJob}>
                      {p.job} · {SYSTEM_LABEL[p.system]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${l.section} ${l.door}`} aria-labelledby="door-title">
            <h2 id="door-title" className={l.heading}>
              Have an invite?
            </h2>
            <p className={l.sub}>
              The board is for one table of friends, by invitation. Open the link you were sent to put your name down, or sign in if you already have.
            </p>
            <Link href="/login" className={l.button}>
              Sign in
            </Link>
            <TableCode />
          </section>
        </main>

        <footer className={l.footer}>
          Ten Candles casts here are a play aid for tables that own the game (Cavalry Games). D&amp;D 5e casts are our own.
        </footer>
      </div>
    </>
  );
}
