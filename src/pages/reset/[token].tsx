import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import { PASSWORD_MIN, passwordSchema } from "@/lib/accounts";
import { accounts } from "@/lib/users.server";
import { fullLoad } from "@/lib/fullLoad";
import { signInWithPassword } from "@/lib/signInClient";
import { Alert, DoorPage, Field, Seal, doorStyles as d } from "@/components/door/Door";

type Props = { token: string; problem: string | null; username: string | null };

/**
 * A one-time reset link an admin handed over. Public (the link is the key),
 * rendered per request, never indexed. Opening it changes nothing; setting
 * the new password uses it up.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ res, params }) => {
  const token = String(params?.token ?? "");
  const info = await accounts.resetInfo(token);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Referrer-Policy", "no-referrer");
  return { props: { token, problem: info.problem, username: info.username } };
};

export default function ResetPage({ token, problem, username }: Props) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    const p = passwordSchema.safeParse(password);
    if (!p.success) errs.password = p.error.issues[0].message;
    else if (again !== password) errs.again = "The two passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const body = (await r.json().catch(() => ({}))) as { error?: string; username?: string };
    if (!r.ok) {
      setBusy(false);
      setError(body.error ?? "That didn't take. Ask for a new link.");
      return;
    }
    const s = await signInWithPassword(body.username ?? username ?? "", password);
    fullLoad(s.ok ? "/board" : "/login");
  }

  return (
    <>
      <Head>
        <title>New password · Oddjobs</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      {problem ? (
        <DoorPage header="Notice" title="This key doesn't turn" lede={problem}>
          <p className={d.small}>
            Ask an admin for a fresh reset link, or <Link href="/login" className={d.link}>sign in</Link> if you remember your password.
          </p>
        </DoorPage>
      ) : (
        <DoorPage header="A new key" title="Set a new password" lede={<>For <b>{username}</b>. This link works once; every other place you&apos;re signed in will be signed out.</>}>
          <form className={d.form} onSubmit={submit} noValidate>
            {/* For password managers: which account this is. */}
            <input type="text" name="username" autoComplete="username" value={username ?? ""} readOnly hidden />
            <Field id="password" label="New password" type="password" hint={`At least ${PASSWORD_MIN} characters.`} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required autoFocus />
            <Field id="again" label="New password again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={errors.again} required />
            {error && <Alert>{error}</Alert>}
            <div className={d.actions}>
              <Seal busy={busy}>Set it</Seal>
            </div>
          </form>
        </DoorPage>
      )}
    </>
  );
}
