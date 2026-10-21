import Head from "next/head";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import { RESET_HOURS, type SiteRole } from "@/lib/accounts";
import { pageViewer } from "@/lib/auth";
import { accounts } from "@/lib/users.server";
import { Alert, DoorPage, doorStyles as d } from "@/components/door/Door";
import { Invites } from "@/components/door/Invites";
import p from "@/components/door/People.module.css";

type Person = {
  id: string;
  username: string;
  displayName: string;
  pronouns: string | null;
  role: SiteRole;
  author: boolean;
  canInvite: boolean;
  disabled: boolean;
  invitedBy: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};
type Props = { people: Person[]; me: string };

/** Admins only: invite links, everyone with an account, who may do what, reset links and closing accounts. */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl }) => {
  const gate = await pageViewer({ req, resolvedUrl }, "admin");
  if (gate.redirect) return { redirect: gate.redirect };
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { people: await accounts.listPeople(), me: gate.viewer.id } };
};

export default function PeoplePage({ people: initial, me }: Props) {
  const [people, setPeople] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState<{ username: string; link: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(userId: string, body: Record<string, unknown>) {
    setBusy(userId);
    setError(null);
    const r = await fetch("/api/admin/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...body }) });
    const out = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) setError(String(out.error ?? "That didn't take"));
    const list = await fetch("/api/admin/people", { cache: "no-store" }).then((x) => (x.ok ? (x.json() as Promise<{ people: Person[] }>) : null));
    if (list) setPeople(list.people);
    setBusy(null);
    return r.ok ? out : null;
  }

  async function makeReset(u: Person) {
    setReset(null);
    const out = await post(u.id, { action: "reset" });
    if (out?.token) setReset({ username: u.username, link: `${window.location.origin}/reset/${String(out.token)}`, expiresAt: String(out.expiresAt) });
  }

  return (
    <>
      <Head>
        <title>People · Oddjobs</title>
        <meta name="robots" content="noindex" />
      </Head>
      <DoorPage header="The tavern's ledger" title="People" wide lede="Who's on the board, who may write one-shots, and the links that let new hands in.">
        <section className={d.section} aria-labelledby="invites-title">
          <h2 id="invites-title" className={d.sectionTitle}>
            Invite links
          </h2>
          <Invites admin />
        </section>

        <section className={d.section} aria-labelledby="people-title">
          <h2 id="people-title" className={d.sectionTitle}>
            Members
          </h2>
          {error && <Alert>{error}</Alert>}
          {reset && (
            <Alert ok>
              Reset link for <b>{reset.username}</b>, shown once, good until {new Date(reset.expiresAt).toLocaleString()}. Hand it over yourself:{" "}
              <input className={p.copy} readOnly value={reset.link} onFocus={(e) => e.currentTarget.select()} aria-label={`Reset link for ${reset.username}`} data-testid="reset-link" />{" "}
              <button type="button" className={d.button} onClick={() => void navigator.clipboard?.writeText(reset.link)}>
                Copy
              </button>
            </Alert>
          )}
          <table className={p.table}>
            <caption className={d.srOnly}>Everyone with an account</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">May</th>
                <th scope="col">Last in</th>
                <th scope="col">
                  <span className={d.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((u) => {
                const self = u.id === me;
                const lock = busy === u.id;
                return (
                  <tr key={u.id} data-user={u.username} className={u.disabled ? p.disabled : undefined}>
                    <td>
                      <div className={p.who}>{u.displayName}</div>
                      <div className={d.hint}>
                        {u.username}
                        {u.pronouns ? ` · ${u.pronouns}` : ""}
                        {u.invitedBy ? ` · invited by ${u.invitedBy}` : ""}
                      </div>
                      {u.disabled && <span className={d.stamp}>closed</span>}
                    </td>
                    <td>
                      <div className={p.toggles}>
                        <label className={p.check}>
                          <input
                            type="checkbox"
                            checked={u.role === "admin"}
                            disabled={lock || self}
                            onChange={(e) => void post(u.id, { action: "access", role: e.target.checked ? "admin" : "member" })}
                          />{" "}
                          admin
                        </label>
                        <label className={p.check}>
                          <input type="checkbox" checked={u.author} disabled={lock} onChange={(e) => void post(u.id, { action: "access", author: e.target.checked })} /> author
                        </label>
                        <label className={p.check}>
                          <input
                            type="checkbox"
                            checked={u.canInvite || u.role === "admin"}
                            disabled={lock || u.role === "admin"}
                            onChange={(e) => void post(u.id, { action: "access", canInvite: e.target.checked })}
                          />{" "}
                          invite
                        </label>
                      </div>
                    </td>
                    <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}</td>
                    <td>
                      <div className={p.rowActions}>
                        <button type="button" className={d.button} disabled={lock || u.disabled} onClick={() => void makeReset(u)} aria-label={`Reset link for ${u.username}`}>
                          Reset link
                        </button>
                        {!self && (
                          <button
                            type="button"
                            className={d.button}
                            disabled={lock}
                            onClick={() => void post(u.id, { action: "access", disabled: !u.disabled })}
                            aria-label={`${u.disabled ? "Reopen" : "Close account"} (${u.username})`}
                          >
                            {u.disabled ? "Reopen" : "Close account"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={d.hint}>
            Closing an account or taking away admin signs that person out at once. A reset link works once, for {RESET_HOURS} hours, and signs them out everywhere when used.
          </p>
        </section>
      </DoorPage>
    </>
  );
}
