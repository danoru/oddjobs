import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import { PASSWORD_MIN, canMakeInvites, fieldErrors, passwordSchema, profileSchema, type Viewer } from "@/lib/accounts";
import { pageViewer } from "@/lib/auth";
import { fullLoad } from "@/lib/fullLoad";
import { signInWithPassword } from "@/lib/signInClient";
import { Alert, DoorPage, Field, doorStyles as d } from "@/components/door/Door";
import { Invites } from "@/components/door/Invites";

type Props = { viewer: Viewer };

/** Your account: what the table calls you, your password and, if an admin lets you, invite links. */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "member");
  if (gate.redirect) return { redirect: gate.redirect };
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { viewer: gate.viewer } };
};

export default function SettingsPage({ viewer }: Props) {
  const [profile, setProfile] = useState({ displayName: viewer.displayName, pronouns: viewer.pronouns ?? "" });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState({ current: "", password: "", again: "" });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const parsed = profileSchema.safeParse(profile);
    setProfileErrors(parsed.success ? {} : fieldErrors(parsed.error));
    if (!parsed.success) return;
    setBusy(true);
    const r = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const body = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
    setBusy(false);
    if (!r.ok) {
      if (body.field) setProfileErrors({ [body.field]: body.error ?? "Try again" });
      else setProfileMsg({ ok: false, text: body.error ?? "Couldn't save that" });
      return;
    }
    setProfileMsg({ ok: true, text: "Saved. The table will call you that." });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const errs: Record<string, string> = {};
    if (!pw.current) errs.current = "Your current password";
    const p = passwordSchema.safeParse(pw.password);
    if (!p.success) errs.password = p.error.issues[0].message;
    else if (pw.again !== pw.password) errs.again = "The two passwords don't match";
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: pw.current, password: pw.password }) });
    const body = (await r.json().catch(() => ({}))) as { error?: string; field?: string };
    if (!r.ok) {
      setBusy(false);
      if (body.field) setPwErrors({ [body.field]: body.error ?? "Try again" });
      else setPwMsg({ ok: false, text: body.error ?? "Couldn't change it" });
      return;
    }
    // Changing it signed every session out, this one too: sign back in with the new one.
    const s = await signInWithPassword(viewer.username, pw.password);
    setBusy(false);
    setPw({ current: "", password: "", again: "" });
    if (s.ok) setPwMsg({ ok: true, text: "Changed. You've been signed out everywhere else." });
    else fullLoad("/login?next=%2Fsettings");
  }

  return (
    <>
      <Head>
        <title>Settings · Oddjobs</title>
      </Head>
      <DoorPage
        header="Your name on the board"
        title={viewer.displayName}
        wide
        lede={
          <>
            Signed in as <b>{viewer.username}</b>
            {viewer.role === "admin" ? ", an admin" : ""}
            {viewer.author ? ", with the author's quill" : ""}. <Link href="/board" className={d.link}>Back to the board</Link>
          </>
        }
      >
        <section className={d.section} aria-labelledby="profile-title">
          <h2 id="profile-title" className={d.sectionTitle}>
            What the table calls you
          </h2>
          <form className={d.form} onSubmit={saveProfile} noValidate>
            <Field id="displayName" label="Name" autoComplete="nickname" value={profile.displayName} onChange={(e) => setProfile((v) => ({ ...v, displayName: e.target.value }))} error={profileErrors.displayName} required />
            <Field id="pronouns" label="Pronouns (optional)" hint="e.g. she/her, they/them" value={profile.pronouns} onChange={(e) => setProfile((v) => ({ ...v, pronouns: e.target.value }))} error={profileErrors.pronouns} />
            {profileMsg && <Alert ok={profileMsg.ok}>{profileMsg.text}</Alert>}
            <div className={d.actions}>
              <button type="submit" className={d.button} disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </section>

        <section className={d.section} aria-labelledby="password-title">
          <h2 id="password-title" className={d.sectionTitle}>
            Password
          </h2>
          <form className={d.form} onSubmit={changePassword} noValidate>
            <input type="text" name="username" autoComplete="username" value={viewer.username} readOnly hidden />
            <Field id="current" label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((v) => ({ ...v, current: e.target.value }))} error={pwErrors.current} required />
            <Field id="password" label="New password" type="password" hint={`At least ${PASSWORD_MIN} characters. You'll be signed out everywhere else.`} autoComplete="new-password" value={pw.password} onChange={(e) => setPw((v) => ({ ...v, password: e.target.value }))} error={pwErrors.password} required />
            <Field id="again" label="New password again" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw((v) => ({ ...v, again: e.target.value }))} error={pwErrors.again} required />
            {pwMsg && <Alert ok={pwMsg.ok}>{pwMsg.text}</Alert>}
            <div className={d.actions}>
              <button type="submit" className={d.button} disabled={busy}>
                Change password
              </button>
            </div>
          </form>
        </section>

        {canMakeInvites(viewer) && (
          <section className={d.section} aria-labelledby="invites-title">
            <h2 id="invites-title" className={d.sectionTitle}>
              Invite a friend
            </h2>
            {viewer.role === "admin" ? (
              <p className={d.hint}>
                Invites, members and reset links are on <Link href="/admin/people" className={d.link}>the people page</Link>.
              </p>
            ) : (
              <Invites admin={false} />
            )}
          </section>
        )}
      </DoorPage>
    </>
  );
}
