import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Alert, Button, IconButton, TextField, Tooltip } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { ThemeProvider } from "@mui/material/styles";
import { checkDoc, type DocIssue, type DocPath, type OneShotDoc, type SpellBook } from "@/lib/oneShotCheck";
import { getAt, moveItem, pathKey, removeCharacter, setAt, slugify } from "@/lib/store/doc";
import { freshId } from "@/lib/editor/core";
import { unlistedKeys } from "@/lib/editor/schemaAt";
import type { EditorSection } from "@/lib/editor/types";
import type { SystemId } from "@/lib/schema";
import type { OneShotStatus, RevisionSummary, WriteGate } from "@/lib/store/types";
import { SYSTEMS } from "@/systems/registry";
import { EditorContext, type EditorCtx } from "./EditorContext";
import { Field } from "./Fields";
import { Preview } from "./Preview";
import { CommitNote } from "./CommitNote";
import { HistoryPanel } from "./HistoryPanel";
import { useChangedFiles } from "./changedFiles";
import { parchmentTheme } from "./parchmentTheme";
import { Mech5e } from "./panels/Mech5e";
import { Levels5e } from "./panels/Levels5e";
import { TcStages } from "./panels/TcStages";
import { MechDh } from "./panels/MechDh";
import { MechParanoia } from "./panels/MechParanoia";
import s from "./Admin.module.css";

type View = { kind: "oneshot" } | { kind: "character"; index: number };

const SAVE_DELAY_MS = 1200;
const CHECK_DELAY_MS = 250;
/** Keys the builder handles itself, never shown under "Other fields". */
const SKIP = ["system", "order", "mech", "variants"];

/** Board order follows the cast list. */
function withOrder(doc: OneShotDoc): OneShotDoc {
  return doc.cast.every((c, i) => c.order === i + 1) ? doc : { ...doc, cast: doc.cast.map((c, i) => ({ ...c, order: i + 1 })) };
}

const nameOf = (c: Record<string, unknown> | undefined, i: number) =>
  typeof c?.name === "string" && c.name ? c.name : typeof c?.id === "string" ? c.id : `Character ${i + 1}`;

/** Which section of a scope a path belongs to (for counts and jumping). */
function sectionOf(sections: EditorSection[], rel: DocPath): EditorSection | undefined {
  const key = rel.join(".");
  if (rel[0] === "mech") return sections.find((x) => x.panel === "mech5e" || x.panel === "mechDh" || x.panel === "mechParanoia");
  if (rel[0] === "variants") return sections.find((x) => x.panel === "levels5e");
  return (
    sections.find((x) => x.fields?.some((f) => key === f || key.startsWith(`${f}.`) || f.startsWith(`${key}.`))) ??
    sections.find((x) => x.id === "other")
  );
}

export interface BuilderProps {
  slug: string;
  initial: OneShotDoc;
  status: OneShotStatus;
  hasPublished: boolean;
  spells: SpellBook;
  gate: WriteGate;
  /** The store keeps a history of saves and publishes (the database does; with files, git is the history). */
  hasHistory?: boolean;
}

/**
 * The one-shot builder: navigation on the left (the one-shot's sections and
 * the cast), the form in the middle, problems and a live preview on the
 * right. Every change is checked (debounced) with the same checks the build
 * runs, and saved as a draft a moment after you stop typing.
 */
export function Builder({ slug, initial, status: initialStatus, hasPublished, spells, gate, hasHistory = false }: BuilderProps) {
  const router = useRouter();
  const readOnly = !gate.writable;
  const [doc, setDoc] = useState<OneShotDoc>(() => withOrder(initial));
  const [status, setStatus] = useState<OneShotStatus>(initialStatus);
  const [view, setView] = useState<View>({ kind: "oneshot" });
  const [mechLevel, setMechLevel] = useState<number | null>(null);
  const [issues, setIssues] = useState<DocIssue[]>(() => checkDoc(withOrder(initial), spells).issues);
  const [serverIssues, setServerIssues] = useState<DocIssue[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: ReactNode } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [newName, setNewName] = useState("");
  const pendingJump = useRef<DocPath | null>(null);
  const { add: addChanged } = useChangedFiles();

  const system = doc.oneshot.system as SystemId;
  const meta = SYSTEMS[system];
  const editor = meta?.editor;

  // ---- Editing ----
  const update = useCallback((fn: (d: OneShotDoc) => OneShotDoc) => {
    setDoc((d) => {
      const next = fn(d);
      return next === d ? d : withOrder(next);
    });
  }, []);
  const set = useCallback(
    (path: DocPath, value: unknown) => update((d) => (getAt(d, path) === value ? d : setAt(d, path, value))),
    [update],
  );

  // ---- Checking (debounced) ----
  useEffect(() => {
    const t = setTimeout(() => setIssues(checkDoc(doc, spells).issues), CHECK_DELAY_MS);
    return () => clearTimeout(t);
  }, [doc, spells]);
  const issueMap = useMemo(() => {
    const m = new Map<string, DocIssue[]>();
    for (const i of issues) m.set(pathKey(i.path), [...(m.get(pathKey(i.path)) ?? []), i]);
    return m;
  }, [issues]);

  // ---- Saving (debounced autosave of the draft) ----
  const docJson = useMemo(() => JSON.stringify(doc), [doc]);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(withOrder(initial)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Counts writes, so the history panel knows to look again. */
  const [writes, setWrites] = useState(0);
  const dirty = !readOnly && docJson !== savedJson;
  const latest = useRef(docJson);
  useEffect(() => {
    latest.current = docJson;
  }, [docJson]);

  const save = useCallback(async (): Promise<boolean> => {
    if (readOnly) return false;
    const json = latest.current;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/oneshots/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: `{"doc":${json}}`,
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaveError(body.error ?? `Saving failed (${r.status})`);
        return false;
      }
      setSaveError(null);
      setSavedJson(json);
      setWrites((n) => n + 1);
      setStatus((st) => (st === "published" ? "changed" : st));
      addChanged(body.changed);
      return true;
    } catch (e) {
      setSaveError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [readOnly, slug, addChanged]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [dirty, docJson, save]);

  // ---- Leaving with unsaved changes ----
  const unsaved = dirty || saving;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!unsaved) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onRoute = (url: string) => {
      if (!unsaved || url === router.asPath) return;
      if (window.confirm("You have unsaved changes. Leave anyway?")) return;
      router.events.emit("routeChangeError");
      throw "Route change aborted (unsaved changes)";
    };
    window.addEventListener("beforeunload", onUnload);
    router.events.on("routeChangeStart", onRoute);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      router.events.off("routeChangeStart", onRoute);
    };
  }, [unsaved, router]);

  // ---- Jumping to a problem ----
  const jump = useCallback(
    (path: DocPath) => {
      if (path[0] === "cast" && typeof path[1] === "number") {
        setView({ kind: "character", index: path[1] });
        setMechLevel(null);
      } else if (path[0] === "variants" && typeof path[1] === "number") {
        const v = doc.variants[path[1]];
        const id = typeof path[3] === "number" ? v?.cast[path[3]]?.id : undefined;
        const index = doc.cast.findIndex((c) => c.id === id);
        if (index >= 0) setView({ kind: "character", index });
        else setView({ kind: "oneshot" });
        setMechLevel(v?.level ?? null);
      } else setView({ kind: "oneshot" });
      pendingJump.current = path;
      // Let the view render, then find the field (or its nearest parent that's on screen).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const target = pendingJump.current;
          pendingJump.current = null;
          if (!target) return;
          let el: HTMLElement | null = null;
          for (let n = target.length; n > 0 && !el; n--) el = document.getElementById(`f-${pathKey(target.slice(0, n))}`);
          el ??= document.getElementById(target[0] === "oneshot" ? "view-oneshot" : "view-character");
          if (!el) return;
          for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          el.classList.remove(s.flash);
          void el.offsetWidth;
          el.classList.add(s.flash);
          el.querySelector<HTMLElement>("input, textarea, [role=combobox], button")?.focus({ preventScroll: true });
        }),
      );
    },
    [doc.variants, doc.cast],
  );

  // ---- Cast ----
  function addCharacter() {
    const name = newName.trim();
    if (!name || !editor) return;
    update((d) => {
      const id = freshId(slugify(name) || "character", d.cast.map((c) => c.id));
      const c = editor.newCharacter(d, id, name);
      const base = typeof d.oneshot.level === "number" ? d.oneshot.level : undefined;
      return {
        ...d,
        cast: [...d.cast, c],
        // Every level variant needs this character too.
        variants: d.variants.map((v) => ({
          ...v,
          cast: [...v.cast, { id, mech: levelShift(c.mech, base !== undefined ? v.level - base : 0) }],
        })),
      };
    });
    setNewName("");
    setView({ kind: "character", index: doc.cast.length });
  }

  function duplicateCharacter(index: number) {
    update((d) => {
      const c = d.cast[index];
      const id = freshId(`${String(c.id ?? "character")}-copy`, d.cast.map((x) => x.id));
      const copy = { ...JSON.parse(JSON.stringify(c)), id, name: `${nameOf(c, index)} (copy)` };
      const cast = [...d.cast.slice(0, index + 1), copy, ...d.cast.slice(index + 1)];
      const variants = d.variants.map((v) => {
        const vc = v.cast.find((x) => x.id === c.id);
        return vc ? { ...v, cast: [...v.cast, { ...JSON.parse(JSON.stringify(vc)), id }] } : v;
      });
      return { ...d, cast, variants };
    });
    setView({ kind: "character", index: index + 1 });
  }

  function deleteCharacter(index: number) {
    const c = doc.cast[index];
    if (!window.confirm(`Remove ${nameOf(c, index)}? Ties, letters and heirs pointing at them go too.`)) return;
    update((d) => removeCharacter(d, String(c.id)));
    setView(doc.cast.length > 1 ? { kind: "character", index: Math.max(0, index - 1) } : { kind: "oneshot" });
  }

  // ---- Publishing ----
  async function publish() {
    setPublishing(true);
    setNotice(null);
    setServerIssues(null);
    try {
      if (dirty && !(await save())) {
        setNotice({ kind: "error", text: "Couldn't save the draft, so nothing was published." });
        return;
      }
      const r = await fetch(`/api/admin/oneshots/${slug}/publish`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (r.status === 422 && Array.isArray(body.issues)) {
        setServerIssues(body.issues);
        setNotice({ kind: "error", text: body.error });
        return;
      }
      if (!r.ok) {
        setNotice({ kind: "error", text: body.error ?? `Publishing failed (${r.status})` });
        return;
      }
      addChanged(body.changed);
      // A dev server keeps each page's list of paths for a moment and refreshes
      // it in the background, so the first visit to a new page can 404. Knock
      // once (or a few times) so the link below works first time.
      for (let i = 0; i < 6; i++) {
        const page = await fetch(`/${slug}`, { cache: "no-store" }).catch(() => null);
        if (page?.ok) break;
        await new Promise((done) => setTimeout(done, 700));
      }
      setStatus("published");
      setWrites((n) => n + 1);
      setNotice({
        kind: "success",
        text:
          gate.kind === "db" ? (
            <>
              Published. It&apos;s on the board now:{" "}
              <Link href={`/${slug}`} target="_blank">
                /{slug}
              </Link>
              .
            </>
          ) : (
            <>
              Published. It&apos;s on the board of this dev server now:{" "}
              <Link href={`/${slug}`} target="_blank">
                /{slug}
              </Link>
              . Commit the files for the deployed site.
            </>
          ),
      });
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraft() {
    if (!window.confirm("Throw away the draft and go back to the published version?")) return;
    const r = await fetch(`/api/admin/oneshots/${slug}/discard`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setNotice({ kind: "error", text: body.error ?? "Couldn't discard the draft" });
    addChanged(body.changed);
    setSavedJson(docJson); // nothing left to save; the reload brings the published version
    window.location.reload();
  }

  async function restore(rev: RevisionSummary) {
    const when = new Date(rev.updatedAt).toLocaleString();
    if (!window.confirm(`Make the version from ${when} the draft? What's in the builder now stays in the history.`)) return;
    if (dirty && !(await save())) return setNotice({ kind: "error", text: "Couldn't save the current draft first, so nothing was restored." });
    const r = await fetch(`/api/admin/oneshots/${slug}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: rev.id }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setNotice({ kind: "error", text: body.error ?? "Couldn't restore that version" });
    setSavedJson(docJson); // the reload brings the restored draft
    window.location.reload();
  }

  if (!meta || !editor)
    return <Alert severity="error">This draft says its system is &quot;{String(doc.oneshot.system)}&quot;, which the builder doesn&apos;t know.</Alert>;

  const ctx: EditorCtx = { doc, system, editor, readOnly, set, update, issues: issueMap, spells };
  const shownIssues = serverIssues && serverIssues.length ? serverIssues : issues;
  const charIssues = (i: number) =>
    issues.filter(
      (x) =>
        (x.path[0] === "cast" && x.path[1] === i) ||
        (x.path[0] === "variants" && typeof x.path[3] === "number" && doc.variants[x.path[1] as number]?.cast[x.path[3]]?.id === doc.cast[i]?.id),
    ).length;

  const oneshotListed = editor.oneshotSections.flatMap((x) => x.fields ?? []);
  const characterListed = editor.characterSections.flatMap((x) => x.fields ?? []);
  const otherOneshot = unlistedKeys(system, "oneshot", oneshotListed, SKIP);
  const otherCharacter = unlistedKeys(system, "character", characterListed, SKIP);
  const oneshotSections: EditorSection[] = [
    ...editor.oneshotSections,
    ...(otherOneshot.length ? [{ id: "other", title: "Other fields", scope: "oneshot" as const, fields: otherOneshot }] : []),
  ];
  const characterSections: EditorSection[] = [
    ...editor.characterSections,
    ...(otherCharacter.length ? [{ id: "other", title: "Other fields", scope: "character" as const, fields: otherCharacter }] : []),
  ];

  const where = (path: DocPath): string => {
    if (path[0] === "oneshot") return `One-shot · ${sectionOf(oneshotSections, path.slice(1))?.title ?? "general"}`;
    if (path[0] === "cast" && typeof path[1] === "number")
      return `${nameOf(doc.cast[path[1]], path[1])} · ${sectionOf(characterSections, path.slice(2))?.title ?? "general"}`;
    if (path[0] === "variants" && typeof path[1] === "number") {
      const v = doc.variants[path[1]];
      const c = typeof path[3] === "number" ? v?.cast[path[3]] : undefined;
      return `${c ? nameOf(doc.cast.find((x) => x.id === c.id), 0) : "Level variants"} · level ${v?.level ?? "?"} mechanics`;
    }
    if (path[0] === "cast") return "Cast";
    return "One-shot";
  };

  const title = typeof doc.oneshot.title === "string" && doc.oneshot.title ? doc.oneshot.title : slug;
  const saveLabel = readOnly
    ? "Read-only"
    : saveError
      ? `Not saved: ${saveError}`
      : saving
        ? "Saving…"
        : dirty
          ? "Unsaved changes"
          : "All changes saved";
  const char = view.kind === "character" ? doc.cast[view.index] : undefined;

  return (
    <EditorContext.Provider value={ctx}>
      <header className={s.toolbar}>
        <h1 className={s.toolbarTitle}>{title}</h1>
        <span className={s.systemChip} data-system={system}>
          {meta.label}
        </span>
        <span className={status === "published" ? s.stampPublished : status === "changed" ? s.stampChanged : s.stampDraft}>
          {status === "published" ? "Published" : status === "changed" ? "Unpublished changes" : "Draft"}
        </span>
        <span className={s.saveState} role="status" aria-live="polite" data-save-state={readOnly ? "readonly" : saving ? "saving" : dirty ? "dirty" : saveError ? "error" : "saved"}>
          {saveLabel}
        </span>
        <Button size="small" variant="outlined" color="inherit" endIcon={<OpenInNewIcon />} href={`/admin/preview/${slug}`} target="_blank">
          Job page preview
        </Button>
        <Button size="small" color="inherit" startIcon={<FileDownloadIcon />} href={`/api/admin/oneshots/${slug}/export`}>
          Export
        </Button>
        {!readOnly && status === "changed" && hasPublished && (
          <Button size="small" color="inherit" onClick={() => void discardDraft()}>
            Discard draft
          </Button>
        )}
        {!readOnly && (
          <Tooltip title={issues.length ? `Fix ${issues.length} problem${issues.length === 1 ? "" : "s"} first` : "Publish to the board"}>
            <span>
              <button type="button" className={s.seal} disabled={issues.length > 0 || publishing || status === "published"} onClick={() => void publish()}>
                {publishing ? "Sealing…" : status === "published" ? "Published" : "Publish"}
              </button>
            </span>
          </Tooltip>
        )}
      </header>

      {readOnly && (
        <section className={s.banner} aria-label="Read-only here">
          <p className={s.bannerTitle}>Read-only here</p>
          {gate.reason}
        </section>
      )}
      {notice && (
        <section aria-label="Publishing">
          <Alert severity={notice.kind} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
            {notice.text}
          </Alert>
        </section>
      )}
      <CommitNote />

      <div className={s.shell}>
        <nav className={s.navCol} aria-label="Builder sections">
          <div className={s.nav}>
            <div className={s.navHeading}>The one-shot</div>
            <ul className={s.navList}>
              {oneshotSections.map((sec) => {
                const n = issues.filter((x) => x.path[0] === "oneshot" && sectionOf(oneshotSections, x.path.slice(1))?.id === sec.id).length;
                return (
                  <li key={sec.id} className={s.navItem}>
                    <button
                      type="button"
                      className={s.navButton}
                      onClick={() => {
                        setView({ kind: "oneshot" });
                        requestAnimationFrame(() => document.getElementById(`sec-oneshot-${sec.id}`)?.scrollIntoView({ behavior: "smooth" }));
                      }}
                    >
                      <span className={s.navName}>{sec.title}</span>
                      {n > 0 && <span className={s.navCount}>{n}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className={s.navHeading}>Cast ({doc.cast.length})</div>
            <ul className={s.navList}>
              {doc.cast.map((c, i) => {
                const n = charIssues(i);
                return (
                  <li key={`${String(c.id)}-${i}`} className={s.navItem}>
                    <button
                      type="button"
                      className={view.kind === "character" && view.index === i ? s.navOn : s.navButton}
                      onClick={() => setView({ kind: "character", index: i })}
                      data-cast={String(c.id)}
                    >
                      <span className={s.navName}>{nameOf(c, i)}</span>
                      {n > 0 && <span className={s.navCount}>{n}</span>}
                    </button>
                    {!readOnly && (
                      <span className={s.navMove}>
                        <IconButton
                          size="small"
                          aria-label={`Move ${nameOf(c, i)} up the board`}
                          disabled={i === 0}
                          onClick={() => {
                            update((d) => ({ ...d, cast: moveItem(d.cast, i, i - 1) }));
                            if (view.kind === "character" && view.index === i) setView({ kind: "character", index: i - 1 });
                          }}
                        >
                          <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`Move ${nameOf(c, i)} down the board`}
                          disabled={i === doc.cast.length - 1}
                          onClick={() => {
                            update((d) => ({ ...d, cast: moveItem(d.cast, i, i + 1) }));
                            if (view.kind === "character" && view.index === i) setView({ kind: "character", index: i + 1 });
                          }}
                        >
                          <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!readOnly && (
              <ThemeProvider theme={parchmentTheme}>
                <div style={{ background: "var(--parchment)", borderRadius: 4, padding: 8, marginTop: 10 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="New character's name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCharacter()}
                    slotProps={{ htmlInput: { "data-field": "new-character" } }}
                  />
                  <Button size="small" startIcon={<AddIcon />} onClick={addCharacter} disabled={!newName.trim()} sx={{ mt: 1 }}>
                    Add to the cast
                  </Button>
                </div>
              </ThemeProvider>
            )}
            <div className={s.navHeading}>Back</div>
            <ul className={s.navList}>
              <li>
                <Link href="/admin" className={s.navButton}>
                  All one-shots
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        <ThemeProvider theme={parchmentTheme}>
          <main id="main" className={s.mainCol}>
            {view.kind === "oneshot" ? (
              <div id="view-oneshot">
                {oneshotSections.map((sec) => (
                  <SectionView key={sec.id} section={sec} base={["oneshot"]} idPrefix="oneshot" count={issues.filter((x) => x.path[0] === "oneshot" && sectionOf(oneshotSections, x.path.slice(1))?.id === sec.id).length} />
                ))}
              </div>
            ) : char ? (
              <div id="view-character">
                <div className={s.sheet}>
                  <h2 className={s.sectionTitle}>
                    {nameOf(char, view.index)}
                    <span className={s.muted}>
                      {view.index + 1} of {doc.cast.length} on the board
                    </span>
                  </h2>
                  {!readOnly && (
                    <div className={s.helperRow}>
                      <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => duplicateCharacter(view.index)}>
                        Duplicate
                      </Button>
                      <Button size="small" color="secondary" startIcon={<DeleteOutlinedIcon />} onClick={() => deleteCharacter(view.index)}>
                        Remove from the cast
                      </Button>
                    </div>
                  )}
                </div>
                {characterSections.map((sec) => (
                  <SectionView
                    key={`${view.index}-${sec.id}`}
                    section={sec}
                    base={["cast", view.index]}
                    idPrefix={`cast-${view.index}`}
                    count={issues.filter((x) => {
                      if (x.path[0] === "cast" && x.path[1] === view.index) return sectionOf(characterSections, x.path.slice(2))?.id === sec.id;
                      return sec.panel === "mech5e" && x.path[0] === "variants" && typeof x.path[3] === "number" && doc.variants[x.path[1] as number]?.cast[x.path[3]]?.id === char.id;
                    }).length}
                    panel={
                      sec.panel === "mech5e" ? (
                        <Mech5e index={view.index} level={mechLevel} onLevel={setMechLevel} />
                      ) : sec.panel === "mechDh" ? (
                        <MechDh index={view.index} />
                      ) : sec.panel === "mechParanoia" ? (
                        <MechParanoia index={view.index} />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <p className={s.paused}>Pick something on the left.</p>
            )}
          </main>
        </ThemeProvider>

        <ThemeProvider theme={parchmentTheme}>
          <aside className={s.previewCol} aria-label="Problems and preview">
            <IssueSummary issues={shownIssues} fromServer={Boolean(serverIssues?.length)} where={where} onJump={jump} readOnly={readOnly} />
            {hasHistory && <HistoryPanel slug={slug} readOnly={readOnly} reloadKey={writes} onRestore={restore} />}
            <Preview slug={slug} selected={view.kind === "character" ? view.index : null} level={mechLevel} />
          </aside>
        </ThemeProvider>
      </div>
    </EditorContext.Provider>
  );
}

/** The base mechanics at another level: the first class moved by the difference. */
function levelShift(mech: unknown, delta: number): unknown {
  const m = JSON.parse(JSON.stringify(mech ?? {})) as { classes?: { level?: number }[] };
  if (m.classes?.[0] && typeof m.classes[0].level === "number") m.classes[0].level = Math.max(1, Math.min(20, m.classes[0].level + delta));
  return m;
}

const PANELS: Record<string, () => ReactNode> = {
  levels5e: () => <Levels5e />,
  tcStages: () => <TcStages />,
};

function SectionView({
  section,
  base,
  idPrefix,
  count,
  panel,
}: {
  section: EditorSection;
  base: DocPath;
  idPrefix: string;
  count: number;
  panel?: ReactNode;
}) {
  const Panel = section.panel ? PANELS[section.panel] : undefined;
  return (
    <section id={`sec-${idPrefix}-${section.id}`} className={s.sheet} aria-labelledby={`h-${idPrefix}-${section.id}`}>
      <h2 className={s.sectionTitle} id={`h-${idPrefix}-${section.id}`}>
        {section.title}
        {count > 0 ? (
          <span className={s.badge}>
            {count} problem{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </h2>
      {section.help && <p className={s.sectionHelp}>{section.help}</p>}
      {section.fields && section.fields.length > 0 && (
        <div className={s.grid}>
          {section.fields.map((f) => (
            <Field key={f} path={[...base, ...f.split(".")]} />
          ))}
        </div>
      )}
      {panel ?? (Panel ? <Panel /> : null)}
    </section>
  );
}

function IssueSummary({
  issues,
  fromServer,
  where,
  onJump,
  readOnly,
}: {
  issues: DocIssue[];
  fromServer: boolean;
  readOnly: boolean;
  where: (p: DocPath) => string;
  onJump: (p: DocPath) => void;
}) {
  return (
    <section className={s.summary} aria-label="Problems" data-issue-count={issues.length}>
      <h2 className={s.sectionTitle} style={{ fontSize: 20 }}>
        {issues.length === 0 ? (
          <>
            {readOnly ? "Passes every check" : "Ready to publish"} <span className={s.badgeOk}>0 problems</span>
          </>
        ) : (
          <>
            {readOnly ? "Problems" : "Before publishing"} <span className={s.badge}>{issues.length}</span>
          </>
        )}
      </h2>
      {fromServer && <p className={s.muted}>The publish check found these:</p>}
      {issues.length === 0 ? (
        <p className={s.muted}>Every check the build runs passes.</p>
      ) : (
        <ol className={s.summaryList}>
          {issues.map((i, n) => (
            <li key={n}>
              <span className={s.where}>{where(i.path)}</span>
              <button type="button" className={s.jump} onClick={() => onJump(i.path)} data-jump={pathKey(i.path)}>
                {humanPath(i.path)}
                {i.message}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The last named key of a path, as a prefix for a schema message ("hook: Required"). */
function humanPath(path: DocPath): string {
  const keys = path.filter((k) => typeof k === "string" && !["oneshot", "cast", "variants", "mech", "story", "poster"].includes(k));
  const last = keys[keys.length - 1];
  return last ? `${String(last)}: ` : "";
}
