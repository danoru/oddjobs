import Head from "next/head";
import { useRouter } from "next/router";
import { Container } from "@mui/material";
import type { PublicTcOneShot } from "@/lib/public";
import { useClaims } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import { TableNote } from "@/components/board/TableNote";
import { Poster } from "@/components/board/Poster";
import { PlayerExtras } from "@/components/table/PlayerExtras";
import { TableToys } from "@/components/table/TableToys";
import { useLive } from "@/lib/useLive";
import { PlayerTable } from "../components/PlayerTable";
import b from "@/components/board/Board.module.css";
import k from "@/components/board/Skins.module.css";
import s from "../components/Tc.module.css";

/**
 * The phone at a Ten Candles table. Join with the GM's code, optionally take
 * a pre-made, sit down, and play the whole night from here.
 */
export function PlayPage({ os }: { os: PublicTcOneShot }) {
  const router = useRouter();
  const claims = useClaims(os.slug);
  const { table, player, claimedBy, toggle } = claims;
  const linkCode = typeof router.query.table === "string" ? router.query.table : undefined;
  const mine = Object.entries(claimedBy).find(([, c]) => c.mine)?.[0] ?? null;
  const premade = os.cast.find((c) => c.id === mine);
  // The bell, notes and rumors (Ten Candles has no inspiration coins; its dice are the game's own).
  const live = useLive(table && player ? table : null, "player");

  return (
    <>
      <Head>
        <title>{`At the table · ${os.title} · Oddjobs`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="md" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <main id="main" tabIndex={-1}>
          {!(table && player) && <TableNote claims={claims} initialCode={linkCode} />}
          <section className={s.room} aria-labelledby="play-title">
            <p className={s.eyebrow}>Ten Candles · {os.title}</p>
            <h1 id="play-title">At the table</h1>
            {table && player ? (
              <PlayerTable os={os} code={table} player={player} claimedId={mine} />
            ) : (
              <p className={s.prose}>Join the GM&apos;s table above with its code and your name. Then you&apos;ll take a seat.</p>
            )}
          </section>

          {table && player && <TableToys live={live} coin={null} rumors={os.hasRumors} />}

          {table && player && premade?.flashback && mine && (
            <PlayerExtras code={table} characterId={mine} flashback={premade.flashback} />
          )}

          {table && player && os.cast.length > 0 && (
            <section style={{ marginTop: 32 }} aria-labelledby="premades">
              <h2 id="premades" className={b.noteTitle} style={{ color: "var(--parchment)" }}>
                {mine ? "Your pre-made" : "Want a head start? Take a pre-made"}
              </h2>
              <p style={{ fontFamily: "var(--font-print)", color: "var(--parchment-dark)", marginTop: 0 }}>
                A name, a look and who they were before the dark. You still write your traits, moment and brink at the
                table.
              </p>
              <div className={`${b.grid} ${k.skinned}`} data-skin={os.skin}>
                {os.cast
                  .filter((c) => !mine || c.id === mine)
                  .map((c) => (
                    <Poster key={c.id} slug={os.slug} character={c} claim={claimedBy[c.id]} onToggleClaim={() => toggle(c.id)} skin={os.skin} />
                  ))}
              </div>
            </section>
          )}
        </main>
      </Container>
    </>
  );
}
