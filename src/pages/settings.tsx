import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import { ThemeProvider } from "@mui/material/styles";
import { PASSWORD_MIN, canMakeInvites, fieldErrors, passwordSchema, profileSchema, type Viewer } from "@/lib/accounts";
import { pageViewer } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { usePrefs } from "@/lib/storage";
import { READING_LABELS, READING_MODES } from "@/lib/reading";
import type { Prefs } from "@/lib/prefs";
import { fullLoad } from "@/lib/fullLoad";
import { signInWithPassword } from "@/lib/signInClient";
import { Alert, DoorPage, Field, doorStyles as d } from "@/components/door/Door";
import { Invites } from "@/components/door/Invites";
import { parchmentTheme } from "@/components/admin/parchmentTheme";
import { WoodcutPicker } from "@/systems/dnd5e/components/sheet/WoodcutPicker";

type Props = { viewer: Viewer; portrait: string | null };

/**
 * Your account: what the table calls you, your woodcut, your password, your
 * defaults for reading, dice and sound, and, if an admin lets you, invite
 * links. Safety tools come in phase 14.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "member");
  if (gate.redirect) return { redirect: gate.redirect };
  res.setHeader("Cache-Control", "private, no-store");
  const row = await db().user.findUnique({ where: { id: gate.viewer.id }, select: { portrait: true } });
  return { props: { viewer: gate.viewer, portrait: row?.portrait ?? null } };
};

export default function SettingsPage({ viewer, portrait: initialPortrait }: Props) {
  const [profile, setProfile] = useState({ displayName: viewer.displayName, pronouns: viewer.pronouns ?? "" });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState({ current: "", password: "", again: "" });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [portrait, setPortrait] = useState(initialPortrait);
  const [portraitMsg, setPortraitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { prefs, setPrefs } = usePrefs();
  const [prefsMsg, setPrefsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function savePortrait(next: string | undefined) {
    setPortraitMsg(null);
    const r = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portrait: next ?? null }) }).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!r?.ok) return setPortraitMsg({ ok: false, text: body?.error ?? "Couldn't keep that portrait" });
    setPortrait(next ?? null);
    setPortraitMsg({ ok: true, text: next ? "On your poster now." : "Taken down. Your poster shows the plain engraving." });
  }

  async function changePrefs(next: Prefs) {
    setPrefsMsg(null);
    const ok = await setPrefs(next);
    setPrefsMsg(ok ? { ok: true, text: "Saved to your account, for every device you sign in on." } : { ok: false, text: "Couldn't save that to your account; it's kept on this device for now." });
  }

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
            {viewer.author ? ", with the author's quill" : ""}.{" "}
            <Link href={`/u/${encodeURIComponent(viewer.username)}`} prefetch={false} className={d.link}>
              Your WANTED poster
            </Link>{" "}
            · <Link href="/board" className={d.link}>Back to the board</Link>
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

        <section className={d.section} aria-labelledby="portrait-title">
          <h2 id="portrait-title" className={d.sectionTitle}>
            Your portrait
          </h2>
          <p className={d.hint}>A photo or a sketch, carved into a woodcut in this browser for your poster. Only the woodcut is kept; the photo never leaves this device.</p>
          <ThemeProvider theme={parchmentTheme}>
            <WoodcutPicker value={portrait ?? undefined} onChange={(url) => void savePortrait(url)} />
          </ThemeProvider>
          {portraitMsg && <Alert ok={portraitMsg.ok}>{portraitMsg.text}</Alert>}
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

        <section className={d.section} aria-labelledby="prefs-title">
          <h2 id="prefs-title" className={d.sectionTitle}>
            How the table reads and sounds for you
          </h2>
          <p className={d.hint}>Your defaults on any device you sign in on. You can still change them on a page as you play.</p>
          <fieldset className={d.fieldset}>
            <legend className={d.label}>Reading</legend>
            {READING_MODES.map((m) => (
              <label key={m} className={d.check}>
                <input type="checkbox" checked={prefs.reading[m]} onChange={(e) => void changePrefs({ ...prefs, reading: { ...prefs.reading, [m]: e.target.checked } })} />
                <span>
                  {READING_LABELS[m].label}
                  <span className={d.hint}>{READING_LABELS[m].hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className={d.fieldset}>
            <legend className={d.label}>Dice</legend>
            <label className={d.check}>
              <input type="checkbox" checked={prefs.dice.shake} onChange={(e) => void changePrefs({ ...prefs, dice: { ...prefs.dice, shake: e.target.checked } })} />
              <span>
                Shake to roll, from the start
                <span className={d.hint}>On phones that allow it without asking. An iPhone still asks once, from the tray.</span>
              </span>
            </label>
          </fieldset>
          <fieldset className={d.fieldset}>
            <legend className={d.label}>Sound</legend>
            <label className={d.field} htmlFor="volume">
              <span>Volume: {Math.round(prefs.sound.volume * 100)}%</span>
              <input
                id="volume"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(prefs.sound.volume * 100)}
                onChange={(e) => void changePrefs({ ...prefs, sound: { ...prefs.sound, volume: Number(e.target.value) / 100 } })}
              />
              <span className={d.hint}>The soundboard, the GM&apos;s bell on your phone and the candles.</span>
            </label>
            <label className={d.check}>
              <input type="checkbox" checked={prefs.sound.buzz} onChange={(e) => void changePrefs({ ...prefs, sound: { ...prefs.sound, buzz: e.target.checked } })} />
              <span>Buzz the phone with the bell and the candles</span>
            </label>
          </fieldset>
          {prefsMsg && <Alert ok={prefsMsg.ok}>{prefsMsg.text}</Alert>}
        </section>

        <section className={d.section} aria-labelledby="safety-title">
          <h2 id="safety-title" className={d.sectionTitle}>
            Safety tools
          </h2>
          <p className={d.hint}>Coming soon: your lines and veils, shown to a game&apos;s GM without your name before play, and an X-card on your phone at the table.</p>
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
