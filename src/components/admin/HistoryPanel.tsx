import { useEffect, useState } from "react";
import { Button } from "@mui/material";
import RestoreIcon from "@mui/icons-material/Restore";
import type { RevisionSummary } from "@/lib/store/types";
import s from "./Admin.module.css";

const LABEL: Record<string, string> = {
  save: "Saved",
  publish: "Published",
  unpublish: "Unpublished",
  import: "Created",
  discard: "Draft discarded",
  restore: "Restored",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The one-shot's history (database store only): every save, publish and
 * unpublish, newest first, with a Restore button that makes that version the
 * draft again. Restoring never publishes; the seal does that. `reloadKey`
 * changes after a save or publish, so the list keeps up.
 */
export function HistoryPanel({
  slug,
  readOnly,
  reloadKey,
  onRestore,
}: {
  slug: string;
  readOnly: boolean;
  reloadKey: number;
  onRestore: (revision: RevisionSummary) => Promise<void>;
}) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/oneshots/${slug}/history`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { revisions?: RevisionSummary[]; error?: string };
        if (!r.ok) throw new Error(body.error ?? `Couldn't load the history (${r.status})`);
        if (live) {
          setRevisions(body.revisions ?? []);
          setError(null);
        }
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [slug, reloadKey]);

  return (
    <section className={s.history} aria-label="History" data-testid="history">
      <h2 className={s.sectionTitle} style={{ fontSize: 20 }}>
        History {revisions && <span className={s.muted}>({revisions.length})</span>}
      </h2>
      <p className={s.muted} style={{ margin: 0 }}>
        Every save and publish, newest first. Restoring makes that version the draft; publish it to put it on the board.
      </p>
      {error && <p className={s.issue}>{error}</p>}
      {revisions && revisions.length === 0 && <p className={s.muted}>Nothing yet.</p>}
      {revisions && revisions.length > 0 && (
        <ol className={s.historyList}>
          {revisions.map((r, i) => (
            <li key={r.id} className={s.historyRow} data-revision={r.id} data-action={r.action}>
              <span className={s.historyWhat}>
                <span className={s.historyAction} data-action={r.action}>
                  {LABEL[r.action] ?? r.action}
                </span>
                {r.title}
              </span>
              {!readOnly && i > 0 && (
                <Button
                  size="small"
                  startIcon={<RestoreIcon />}
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      await onRestore(r);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  aria-label={`Restore the version ${(LABEL[r.action] ?? r.action).toLowerCase()} ${when(r.updatedAt)}`}
                >
                  {busy === r.id ? "Restoring…" : "Restore"}
                </Button>
              )}
              <span className={s.historyMeta}>
                {when(r.updatedAt)} · {r.castCount} in the cast{i === 0 ? " · the newest" : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
