import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, fieldErrors, signUpSchema } from "@/lib/accounts";
import { accounts } from "@/lib/users.server";
import { siteOrigin } from "@/lib/siteOrigin";
import { fullLoad } from "@/lib/fullLoad";
import { signInWithPassword } from "@/lib/signInClient";
import { OgMeta } from "@/components/OgMeta";
import { Alert, DoorPage, Field, Seal, doorStyles as d } from "@/components/door/Door";

type Props = { code: string; problem: string | null; grantsAuthor: boolean; from: string | null; origin: string };

/**
 * Signing up with an invite link. Public (the invite is the key), rendered
 * per request so a used or expired invite says so. Looking at the page
 * doesn't use the invite up (Discord fetching it to draw the preview
 * doesn't either); only signing up does.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params }) => {
  const code = String(params?.code ?? "");
  const info = await accounts.inviteInfo(code);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  return { props: { code, problem: info.problem, grantsAuthor: info.grantsAuthor, from: info.from, origin: siteOrigin(req) } };
};

export default function JoinPage({ code, problem, grantsAuthor, from, origin }: Props) {
  const [form, setForm] = useState({ username: "", displayName: "", pronouns: "", password: "", again: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { username: form.username, displayName: form.displayName || form.username, pronouns: form.pronouns, password: form.password };
    const parsed = signUpSchema.safeParse(input);
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (form.password && form.again !== form.password) errs.again = "The two passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...input }) });
    const body = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
    if (!r.ok) {
      setBusy(false);
      if (body.field && body.field in form) setErrors({ [body.field]: body.error ?? "Try another" });
      else setError(body.error ?? "The board wouldn't take that. Try again.");
      return;
    }
    const s = await signInWithPassword(input.username, input.password);
    fullLoad(s.ok ? "/board" : "/login?next=%2Fboard");
  }

  const og = (
    <OgMeta
      title="Hands wanted at the Oddjobs board"
      description={from ? `${from} has pinned up an invite for you. Odd jobs for one night: tear a poster, play tonight.` : "An invite to the Oddjobs board. Odd jobs for one night: tear a poster, play tonight."}
      image={`${origin}/api/og?card=invite`}
      url={`${origin}/join/${encodeURIComponent(code)}`}
    />
  );

  if (problem)
    return (
      <>
        <Head>
          <title>Invite · Oddjobs</title>
        </Head>
        {og}
        <DoorPage header="Notice" title="Torn down" lede={problem}>
          <p className={d.small}>
            Ask whoever sent it for a fresh one. Already on the board? <Link href="/login" className={d.link}>Sign in</Link>.
          </p>
        </DoorPage>
      </>
    );

  return (
    <>
      <Head>
        <title>Join the board · Oddjobs</title>
      </Head>
      {og}
      <DoorPage
        header="Hands wanted"
        title="Put your name on the board"
        tilt={0.6}
        lede={
          <>
            {from ? `${from} pinned this up for you.` : "Someone pinned this up for you."} Odd jobs for one night: pick a job, tear a poster, play tonight.
            {grantsAuthor && (
              <>
                {" "}
                <span className={d.stamp}>Comes with the author&apos;s quill</span>
              </>
            )}
          </>
        }
      >
        <form className={d.form} onSubmit={submit} noValidate>
          <Field
            id="username"
            label="Username"
            hint={`How you sign in. ${USERNAME_MIN}–${USERNAME_MAX} letters, numbers, - or _.`}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.username}
            onChange={set("username")}
            error={errors.username}
            required
            autoFocus
          />
          <Field id="displayName" label="What the table calls you" hint="Leave it empty to use your username." autoComplete="nickname" value={form.displayName} onChange={set("displayName")} error={errors.displayName} />
          <Field id="pronouns" label="Pronouns (optional)" hint="e.g. she/her, they/them" value={form.pronouns} onChange={set("pronouns")} error={errors.pronouns} />
          <Field id="password" label="Password" type="password" hint={`At least ${PASSWORD_MIN} characters.`} autoComplete="new-password" value={form.password} onChange={set("password")} error={errors.password} required />
          <Field id="again" label="Password again" type="password" autoComplete="new-password" value={form.again} onChange={set("again")} error={errors.again} required />
          {error && <Alert>{error}</Alert>}
          <div className={d.actions}>
            <Seal busy={busy}>Sign the board</Seal>
          </div>
        </form>
        <p className={d.small}>
          Already have an account? <Link href="/login" className={d.link}>Sign in</Link>.
        </p>
      </DoorPage>
    </>
  );
}
