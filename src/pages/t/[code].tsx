import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import { db } from "@/lib/prisma";
import { gameOneShot } from "@/lib/games.server";
import { readClaims } from "@/lib/session";
import { normalizeCode } from "@/lib/tables";
import { fullLoad } from "@/lib/fullLoad";
import { sitDown } from "@/lib/storage";
import { DoorPage, Field, Seal, Alert, doorStyles as d } from "@/components/door/Door";

type Props = { code: string; title: string | null; to: string | null };

/**
 * Sitting down at a game without an account (`/t/<code>`, public: the code
 * is the key). A name is all it takes: the server hands this browser a guest
 * pass for that one game (src/lib/guestPass.ts) and it goes to the job page,
 * or the phone page for Ten Candles. Nothing goes on a profile, but the GM
 * can later send an invite that turns the seat into an account. Someone
 * signed in goes straight to the table.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const code = normalizeCode(params?.code) ?? String(params?.code ?? "").toUpperCase().slice(0, 12);
  const game = normalizeCode(code) ? await db().game.findUnique({ where: { code }, select: { id: true, oneshot: true, pinnedAt: true } }) : null;
  const os = game ? await gameOneShot(game).catch(() => null) : null;
  const to = os ? `/${os.slug}${os.system === "tencandles" ? "/play" : ""}?table=${code}` : null;
  if (to && (await readClaims(req.headers.cookie))) return { redirect: { destination: to, permanent: false } };
  return { props: { code, title: os?.title ?? null, to } };
};

export default function GuestDoor({ code, title, to }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Tell the table your name.");
    setBusy(true);
    const r = await fetch("/api/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name }) }).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { error?: string; oneshot?: string };
    if (!r?.ok || !body.oneshot) {
      setBusy(false);
      return setError(body?.error ?? "Couldn't reach the tavern. Try again.");
    }
    sitDown(body.oneshot, code, name.trim());
    fullLoad(to ?? `/${body.oneshot}?table=${code}`);
  }

  return (
    <>
      <Head>
        <title>{`Table ${code} · Oddjobs`}</title>
      </Head>
      {to ? (
        <DoorPage header={`Table ${code}`} title={title ?? "Pull up a chair"} lede="No account needed tonight: give the table your name and tear a poster. Nothing of tonight goes on a profile unless the GM sends you an invite later.">
          <form className={d.form} onSubmit={submit} noValidate>
            <Field id="name" label="Your name" hint="What the table calls you tonight." autoComplete="nickname" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            {error && <Alert>{error}</Alert>}
            <div className={d.actions}>
              <Seal busy={busy}>Sit down</Seal>
            </div>
          </form>
          <p className={d.small}>
            On the board already? <Link href={`/login?next=${encodeURIComponent(to)}`} className={d.link}>Sign in</Link> and sit down as yourself.
          </p>
        </DoorPage>
      ) : (
        <DoorPage header="Notice" title="No such table" lede={`There's no table ${code}. Check the code with your GM.`}>
          <p className={d.small}>
            <Link href="/" className={d.link}>Back to the door</Link>
          </p>
        </DoorPage>
      )}
    </>
  );
}
