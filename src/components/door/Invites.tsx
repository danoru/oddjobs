import { useEffect, useState } from "react";
import { INVITE_MAX_DAYS, INVITE_MAX_USES, MEMBER_INVITE_DAYS } from "@/lib/accounts";
import { Alert, doorStyles as d } from "./Door";
import p from "./People.module.css";

type Invite = {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string;
  grantsAuthor: boolean;
  problem: string | null;
  createdBy: string | null;
  joined: string[];
};

const linkOf = (code: string) => `${window.location.origin}/join/${code}`;

/**
 * Making and taking down invite links: on /admin/people for admins (any
 * number of uses, up to a month, optionally the author badge) and on
 * /settings for members an admin lets invite (single-use, a week at most).
 */
export function Invites({ admin }: { admin: boolean }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [note, setNote] = useState("");
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(7);
  const [author, setAuthor] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const maxDays = admin ? INVITE_MAX_DAYS : MEMBER_INVITE_DAYS;

  // Bumped to read the list again after a change.
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let alive = true;
    fetch("/api/invites", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: (await r.json().catch(() => ({}))) as { invites?: Invite[]; error?: string } }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (ok) setInvites(body.invites ?? []);
        else setError(body.error ?? "Couldn't read the invites");
      })
      .catch(() => alive && setError("Couldn't read the invites"));
    return () => {
      alive = false;
    };
  }, [version]);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, maxUses: admin ? uses : 1, days: Math.min(days, maxDays), grantsAuthor: admin && author }),
    });
    const body = (await r.json().catch(() => ({}))) as { code?: string; error?: string };
    setBusy(false);
    if (!r.ok || !body.code) return setError(body.error ?? "Couldn't make it");
    setMade(linkOf(body.code));
    setNote("");
    load();
  }

  async function revoke(id: string) {
    setError(null);
    const r = await fetch("/api/invites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't take it down");
    load();
  }

  return (
    <div>
      <form className={p.inline} onSubmit={make} aria-label="Make an invite link">
        <label className={p.control}>
          <span className={d.label}>For whom (a note)</span>
          <input className={d.input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Sam, Thursday's table" />
        </label>
        {admin && (
          <label className={p.control}>
            <span className={d.label}>Uses</span>
            <input className={d.input} type="number" min={1} max={INVITE_MAX_USES} value={uses} onChange={(e) => setUses(Number(e.target.value) || 1)} />
          </label>
        )}
        <label className={p.control}>
          <span className={d.label}>Days</span>
          <input className={d.input} type="number" min={1} max={maxDays} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} />
        </label>
        {admin && (
          <label className={p.check}>
            <input type="checkbox" checked={author} onChange={(e) => setAuthor(e.target.checked)} /> Author badge
          </label>
        )}
        <button type="submit" className={d.button} disabled={busy}>
          Make a link
        </button>
      </form>
      {!admin && <p className={d.hint}>Your links work once and last a week at most.</p>}
      {made && (
        <Alert ok>
          New link (copy it and send it):{" "}
          <input className={p.copy} readOnly value={made} onFocus={(e) => e.currentTarget.select()} aria-label="The new invite link" data-testid="new-invite" />{" "}
          <button type="button" className={d.button} onClick={() => void navigator.clipboard?.writeText(made)}>
            Copy
          </button>
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {invites && invites.length > 0 && (
        <table className={p.table}>
          <caption className={d.srOnly}>Invite links</caption>
          <thead>
            <tr>
              <th scope="col">Link</th>
              <th scope="col">Uses</th>
              <th scope="col">Until</th>
              <th scope="col">Joined</th>
              <th scope="col">
                <span className={d.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} data-code={i.code} className={i.problem ? p.dead : undefined}>
                <td>
                  <code className={p.code}>/join/{i.code}</code>
                  {i.note && <div className={d.hint}>{i.note}</div>}
                  {i.grantsAuthor && <span className={d.stamp}>author</span>}
                  {admin && i.createdBy && <div className={d.hint}>by {i.createdBy}</div>}
                </td>
                <td>
                  {i.uses}/{i.maxUses}
                </td>
                <td>{i.problem ? <span className={d.hint}>{i.problem.replace(/^This invite (has |was )?/, "").replace(/\.$/, "")}</span> : new Date(i.expiresAt).toLocaleDateString()}</td>
                <td>{i.joined.join(", ") || "—"}</td>
                <td>
                  {!i.problem && (
                    <button type="button" className={d.button} onClick={() => void revoke(i.id)} aria-label={`Take down the invite ${i.note ?? i.code}`}>
                      Take down
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {invites && invites.length === 0 && <p className={d.hint}>No invites yet.</p>}
    </div>
  );
}
