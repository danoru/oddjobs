import Head from "next/head";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import {
  Alert,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import UnpublishedIcon from "@mui/icons-material/Unpublished";
import { requestRole } from "@/lib/auth";
import { getStore, type OneShotSummary, type WriteGate } from "@/lib/store";
import { slugify } from "@/lib/store/doc";
import { SYSTEM_IDS, type SystemId } from "@/lib/schema";
import { SYSTEMS } from "@/systems/registry";
import { SiteHeader } from "@/components/SiteHeader";
import { CommitNote } from "@/components/admin/CommitNote";
import { useChangedFiles } from "@/components/admin/changedFiles";
import { parchmentTheme } from "@/components/admin/parchmentTheme";
import s from "@/components/admin/Admin.module.css";

type Props = { oneshots: OneShotSummary[]; gate: WriteGate };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  const store = getStore();
  res.setHeader("Cache-Control", "private, no-store");
  return { props: JSON.parse(JSON.stringify({ oneshots: await store.list(), gate: store.gate() })) as Props };
};

const SYSTEM_BLURB: Record<SystemId, string> = {
  dnd5e: "A cast of ready-made characters with sheets, cards and tents. 2014 or 2024 rules.",
  tencandles: "A module for the night: intro, Them, areas, stages by candlelight, truths, optional pre-mades.",
  paranoia: "A mission for a team of Troubleshooters: clone names, the skill draft, naughty sides kept from player pages, Friend Computer's lines.",
  daggerheart: "A level-1 cast with classes, traits, domain cards and weapons checked against the SRD, plus GM-only adversaries.",
};

type Dialogs =
  | { kind: "new" }
  | { kind: "duplicate"; from: OneShotSummary }
  | { kind: "delete"; target: OneShotSummary }
  | { kind: "import"; doc: unknown; name: string }
  | null;

/** The builder's front page: every one-shot, published and draft, and what you can do with each. */
export default function AdminPage({ oneshots, gate }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { add: addChanged } = useChangedFiles();
  const readOnly = !gate.writable;

  async function call(url: string, init: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) setError(String(body.error ?? `Failed (${r.status})`));
      else addChanged(body.changed as string[] | undefined);
      return { ok: r.ok, body };
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => router.replace(router.asPath, undefined, { scroll: false });

  async function unpublish(o: OneShotSummary) {
    if (!window.confirm(`Take "${o.title}" off the board? It stays here as a draft.`)) return;
    if ((await call(`/api/admin/oneshots/${o.slug}/unpublish`, { method: "POST" })).ok) await refresh();
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file
      .text()
      .then((t) => setDialog({ kind: "import", doc: JSON.parse(t), name: file.name }))
      .catch(() => setError(`${file.name} isn't readable JSON`));
  }

  return (
    <>
      <Head>
        <title>Builder · Oddjobs</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/", label: "the board" }} />
        <main id="main">
          <header className={s.toolbar}>
            <h1 className={s.toolbarTitle}>The one-shot builder</h1>
            {!readOnly && (
              <>
                <Button variant="contained" color="secondary" startIcon={<AddIcon />} onClick={() => setDialog({ kind: "new" })}>
                  New one-shot
                </Button>
                <Button color="inherit" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
                  Import JSON
                </Button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pickFile} aria-label="Import a one-shot file" />
              </>
            )}
          </header>

          {readOnly && (
            <section className={s.banner} aria-label="Read-only here">
              <p className={s.bannerTitle}>Read-only here</p>
              {gate.reason}
            </section>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <CommitNote />

          <ThemeProvider theme={parchmentTheme}>
            <section className={s.ledger} aria-label="One-shots">
              {oneshots.length === 0 && <p className={s.muted}>No one-shots yet. Start one with “New one-shot”.</p>}
              {oneshots.map((o) => {
                const sys = SYSTEMS[o.system as SystemId];
                return (
                  <article key={o.slug} className={s.ledgerRow} data-slug={o.slug}>
                    <div>
                      <h2 className={s.ledgerTitle}>
                        <Link href={`/admin/${o.slug}`}>{o.title}</Link>
                        <span className={s.systemChip} data-system={o.system}>
                          {sys?.label ?? o.system}
                        </span>
                        <span className={s.ledgerStamp} data-status={o.status}>
                          {o.status === "published" ? "On the board" : o.status === "changed" ? "Unpublished changes" : "Draft"}
                        </span>
                      </h2>
                      <div className={s.ledgerMeta}>
                        /{o.slug} · {o.castCount} character{o.castCount === 1 ? "" : "s"} · updated{" "}
                        {new Date(o.updatedAt).toLocaleString()}
                        {o.issueCount > 0 && ` · ${o.issueCount} problem${o.issueCount === 1 ? "" : "s"} to fix before publishing`}
                      </div>
                    </div>
                    <div className={s.ledgerActions}>
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} component={Link} href={`/admin/${o.slug}`}>
                        {readOnly ? "View" : "Edit"}
                      </Button>
                      {!readOnly && (
                        <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => setDialog({ kind: "duplicate", from: o })}>
                          Duplicate as template
                        </Button>
                      )}
                      <Button size="small" startIcon={<FileDownloadIcon />} href={`/api/admin/oneshots/${o.slug}/export`}>
                        Export
                      </Button>
                      {!readOnly && o.status !== "draft" && (
                        <Button size="small" startIcon={<UnpublishedIcon />} onClick={() => void unpublish(o)} disabled={busy}>
                          Unpublish
                        </Button>
                      )}
                      {!readOnly && (
                        <Button size="small" color="secondary" startIcon={<DeleteOutlinedIcon />} onClick={() => setDialog({ kind: "delete", target: o })}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>

            <NewDialog
              open={dialog?.kind === "new"}
              busy={busy}
              onClose={() => setDialog(null)}
              onCreate={async (system, title, slug) => {
                const r = await call("/api/admin/oneshots", { method: "POST", body: JSON.stringify({ action: "create", system, title, slug }) });
                if (r.ok) await router.push(`/admin/${String(r.body.slug)}`);
              }}
            />
            {dialog?.kind === "duplicate" && (
              <SlugDialog
                title={`Duplicate “${dialog.from.title}”`}
                text="A copy to use as a template: same cast, story and mechanics, saved as a new draft."
                initial={`${dialog.from.slug}-copy`}
                action="Duplicate"
                busy={busy}
                onClose={() => setDialog(null)}
                onDone={async (to) => {
                  const r = await call(`/api/admin/oneshots/${dialog.from.slug}/duplicate`, { method: "POST", body: JSON.stringify({ to }) });
                  if (r.ok) await router.push(`/admin/${to}`);
                }}
              />
            )}
            {dialog?.kind === "import" && (
              <SlugDialog
                title={`Import ${dialog.name}`}
                text="It's saved as a new draft; nothing goes on the board until you publish it."
                initial={String(
                  ((dialog.doc as { oneshot?: { slug?: unknown } })?.oneshot?.slug as string | undefined) ?? slugify(dialog.name.replace(/\..*$/, "")),
                )}
                action="Import"
                busy={busy}
                onClose={() => setDialog(null)}
                onDone={async (slug) => {
                  const r = await call("/api/admin/oneshots", { method: "POST", body: JSON.stringify({ action: "import", doc: dialog.doc, slug }) });
                  if (r.ok) await router.push(`/admin/${slug}`);
                }}
              />
            )}
            {dialog?.kind === "delete" && (
              <DeleteDialog
                target={dialog.target}
                busy={busy}
                onClose={() => setDialog(null)}
                onDelete={async () => {
                  const r = await call(`/api/admin/oneshots/${dialog.target.slug}`, {
                    method: "DELETE",
                    body: JSON.stringify({ confirm: dialog.target.slug }),
                  });
                  if (r.ok) {
                    setDialog(null);
                    await refresh();
                  }
                }}
              />
            )}
          </ThemeProvider>
        </main>
      </Container>
    </>
  );
}

function NewDialog({
  open,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (system: SystemId, title: string, slug: string) => void;
}) {
  const [system, setSystem] = useState<SystemId>("dnd5e");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const shownSlug = slug ?? slugify(title);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="new-title">
      <DialogTitle id="new-title">A new one-shot</DialogTitle>
      <DialogContent>
        <div role="radiogroup" aria-label="Game system" className={s.systemPick}>
          {SYSTEM_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={system === id}
              className={s.systemCard}
              onClick={() => setSystem(id)}
              data-system={id}
            >
              <div className={s.systemCardTitle}>{SYSTEMS[id].label}</div>
              <div className={s.systemCardText}>{SYSTEM_BLURB[id]}</div>
            </button>
          ))}
        </div>
        <TextField
          autoFocus
          fullWidth
          margin="normal"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          slotProps={{ htmlInput: { "data-field": "new-title" } }}
        />
        <TextField
          fullWidth
          label="Slug (the page address)"
          value={shownSlug}
          onChange={(e) => setSlug(e.target.value)}
          helperText={`/${shownSlug || "…"} · can't be changed later`}
          slotProps={{ htmlInput: { "data-field": "new-slug" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="secondary" disabled={busy || !title.trim() || !shownSlug} onClick={() => onCreate(system, title.trim(), shownSlug)}>
          Start writing
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SlugDialog({
  title,
  text,
  initial,
  action,
  busy,
  onClose,
  onDone,
}: {
  title: string;
  text: string;
  initial: string;
  action: string;
  busy: boolean;
  onClose: () => void;
  onDone: (slug: string) => void;
}) {
  const [slug, setSlug] = useState(initial);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="slug-title">
      <DialogTitle id="slug-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{text}</DialogContentText>
        <TextField
          autoFocus
          fullWidth
          margin="normal"
          label="New slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          slotProps={{ htmlInput: { "data-field": "slug" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !slug} onClick={() => onDone(slug)}>
          {action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ target, busy, onClose, onDelete }: { target: OneShotSummary; busy: boolean; onClose: () => void; onDelete: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="delete-title">
      <DialogTitle id="delete-title">Delete “{target.title}”?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This removes the draft{target.status !== "draft" ? " and the published files" : ""}. Git still has whatever you committed. Type{" "}
          <strong>{target.slug}</strong> to confirm.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          margin="normal"
          label="Slug"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          slotProps={{ htmlInput: { "data-field": "confirm-delete" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Keep it</Button>
        <Button variant="contained" color="secondary" disabled={busy || typed !== target.slug} onClick={onDelete}>
          Delete for good
        </Button>
      </DialogActions>
    </Dialog>
  );
}
