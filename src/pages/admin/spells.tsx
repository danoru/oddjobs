import Head from "next/head";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import {
  Alert,
  Button,
  Checkbox,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { requestRole } from "@/lib/auth";
import { getSpellStore, type WriteGate } from "@/lib/store";
import { spellNameProblem } from "@/lib/store/spellName";
import type { SpellBook } from "@/lib/oneShotCheck";
import { spellInfoSchema, type SpellInfo } from "@/systems/dnd5e/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { CommitNote } from "@/components/admin/CommitNote";
import { useChangedFiles } from "@/components/admin/changedFiles";
import { parchmentTheme } from "@/components/admin/parchmentTheme";
import s from "@/components/admin/Admin.module.css";

/** `wanted` is ?new=<name>, from the builder's "not in the spell book yet" link. */
type Props = { spells: SpellBook; gate: WriteGate; wanted: string | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, resolvedUrl, query }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  const store = getSpellStore();
  res.setHeader("Cache-Control", "private, no-store");
  const wanted = typeof query.new === "string" && query.new.trim() ? query.new.trim().slice(0, 80) : null;
  return { props: JSON.parse(JSON.stringify({ spells: store.list(), gate: store.gate(), wanted })) as Props };
};

const SCHOOLS = spellInfoSchema.shape.school.options;
const EDITIONS = ["2014", "2024"] as const;
type Edition = (typeof EDITIONS)[number];
const TEXT_FIELDS = ["time", "range", "components", "duration"] as const;
const LIMITS = { time: 40, range: 40, components: 90, duration: 40, text: 300, higher: 130 } as const;
const LABELS = {
  time: "Casting time",
  range: "Range",
  components: "Components",
  duration: "Duration",
  text: "What it does (in our own words)",
  higher: "At higher levels",
} as const;
const HINTS = {
  time: "Action, Bonus Action, Reaction, 1 minute…",
  range: "Self, Touch, 60 ft, Self (15-ft cone)…",
  components: "V, S, M (a pinch of salt)",
  duration: "Instantaneous, 1 minute, 8 hours…",
} as const;

const ordinal = (n: number) => (n === 0 ? "Cantrip" : `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} level`);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

// ---- The form's own shape: strings everywhere, "" meaning "not set" ----

type Base = {
  level: string;
  school: string;
  time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  text: string;
  higher: string;
};
/** An edition block: "" is "same as the base"; booleans are "", "yes" or "no"; `noHigher` writes higher: "". */
type Override = Omit<Base, "concentration" | "ritual"> & { on: boolean; concentration: string; ritual: string; noHigher: boolean };
type Form = { name: string; base: Base; overrides: Record<Edition, Override> };

const emptyBase = (): Base => ({
  level: "1",
  school: "evocation",
  time: "Action",
  range: "",
  components: "V, S",
  duration: "Instantaneous",
  concentration: false,
  ritual: false,
  text: "",
  higher: "",
});
const emptyOverride = (): Override => ({
  on: false,
  level: "",
  school: "",
  time: "",
  range: "",
  components: "",
  duration: "",
  concentration: "",
  ritual: "",
  text: "",
  higher: "",
  noHigher: false,
});

function toForm(name: string, info: SpellInfo | null): Form {
  if (!info) return { name, base: emptyBase(), overrides: { "2014": emptyOverride(), "2024": emptyOverride() } };
  const tri = (b: boolean | undefined) => (b === undefined ? "" : b ? "yes" : "no");
  const block = (o: SpellInfo["2014"]): Override =>
    o
      ? {
          on: true,
          level: o.level === undefined ? "" : String(o.level),
          school: o.school ?? "",
          time: o.time ?? "",
          range: o.range ?? "",
          components: o.components ?? "",
          duration: o.duration ?? "",
          concentration: tri(o.concentration),
          ritual: tri(o.ritual),
          text: o.text ?? "",
          higher: o.higher ?? "",
          noHigher: o.higher === "",
        }
      : emptyOverride();
  return {
    name,
    base: {
      level: String(info.level),
      school: info.school,
      time: info.time,
      range: info.range,
      components: info.components,
      duration: info.duration,
      concentration: info.concentration,
      ritual: info.ritual,
      text: info.text,
      higher: info.higher ?? "",
    },
    overrides: { "2014": block(info["2014"]), "2024": block(info["2024"]) },
  };
}

/** The entry as it goes into spells.json (before the schema has its say). */
function fromForm(f: Form): Record<string, unknown> {
  const b = f.base;
  const out: Record<string, unknown> = {
    level: Number(b.level),
    school: b.school,
    time: b.time.trim(),
    range: b.range.trim(),
    components: b.components.trim(),
    duration: b.duration.trim(),
    concentration: b.concentration,
    ritual: b.ritual,
    text: b.text.trim(),
  };
  if (b.higher.trim()) out.higher = b.higher.trim();
  for (const ed of EDITIONS) {
    const o = f.overrides[ed];
    if (!o.on) continue;
    const block: Record<string, unknown> = {};
    if (o.level !== "") block.level = Number(o.level);
    if (o.school) block.school = o.school;
    for (const k of TEXT_FIELDS) if (o[k].trim()) block[k] = o[k].trim();
    if (o.concentration) block.concentration = o.concentration === "yes";
    if (o.ritual) block.ritual = o.ritual === "yes";
    if (o.text.trim()) block.text = o.text.trim();
    if (o.noHigher) block.higher = "";
    else if (o.higher.trim()) block.higher = o.higher.trim();
    if (Object.keys(block).length) out[ed] = block;
  }
  return out;
}

/** Schema problems keyed by field ("text", "2014.text"), plus the name's. */
function problemsOf(f: Form, taken: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const nameProblem = spellNameProblem(f.name);
  if (nameProblem) out.name = nameProblem;
  else if (taken) out.name = "already in the spell book";
  const res = spellInfoSchema.safeParse(fromForm(f));
  if (!res.success) for (const i of res.error.issues) out[i.path.join(".")] ??= i.message;
  return out;
}

/** The spell book editor: content/rules/spells.json, one entry at a time. */
export default function SpellsPage({ spells, gate, wanted }: Props) {
  const router = useRouter();
  const readOnly = !gate.writable;
  const { add: addChanged } = useChangedFiles();
  const [filter, setFilter] = useState("");
  // Opens straight onto the spell ?new= names: prefilled if it's missing, the entry itself if not.
  const [editing, setEditing] = useState<{ form: Form; isNew: boolean } | null>(() => {
    if (wanted === null) return null;
    const existing = Object.hasOwn(spells, wanted);
    return existing || !readOnly ? { form: toForm(wanted, existing ? spells[wanted] : null), isNew: !existing } : null;
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const missingHere = readOnly && wanted !== null && !Object.hasOwn(spells, wanted);
  const [busy, setBusy] = useState(false);

  const names = useMemo(() => Object.keys(spells).sort((a, b) => a.localeCompare(b, "en")), [spells]);
  const shown = names.filter((n) => n.toLowerCase().includes(filter.trim().toLowerCase()));

  // Drop ?new= from the address once it has done its job, so a reload doesn't reopen it.
  const hasQuery = wanted !== null;
  useEffect(() => {
    if (hasQuery) void router.replace("/admin/spells", undefined, { shallow: true, scroll: false });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/spells", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        setError(String(out.error ?? `Failed (${r.status})`));
        if (method === "DELETE") window.scrollTo({ top: 0, behavior: "smooth" });
        return false;
      }
      addChanged(out.changed as string[] | undefined);
      await router.replace(router.asPath, undefined, { scroll: false });
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Spell book · Tear-Off</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/admin", label: "the builder" }} />
        <main id="main">
          <header className={s.toolbar}>
            <h1 className={s.toolbarTitle}>The spell book</h1>
            {!readOnly && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<AddIcon />}
                onClick={() => setEditing({ form: toForm("", null), isNew: true })}
              >
                New spell
              </Button>
            )}
          </header>

          {readOnly && (
            <section className={s.banner} aria-label="Read-only here">
              <p className={s.bannerTitle}>Read-only here</p>
              {gate.reason}
            </section>
          )}
          {missingHere && (
            <Alert severity="info" sx={{ mb: 2 }}>
              “{wanted}” isn&apos;t in the spell book, and it can&apos;t be added here (see above).
            </Alert>
          )}
          {error && !editing && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {saved && (
            <Alert severity="success" onClose={() => setSaved(null)} sx={{ mb: 2 }}>
              {saved}
            </Alert>
          )}
          <CommitNote />

          <ThemeProvider theme={parchmentTheme}>
            <section className={s.ledger} aria-label="Spells">
              <p className={s.muted} style={{ marginTop: 0 }}>
                Card text for every 5e spell a character can have, in <code>content/rules/spells.json</code>. Base fields follow the 2024
                rules; a 2014 block lists only what differs. Write the effect in your own words, never the book&apos;s.
              </p>
              <TextField
                size="small"
                label="Find a spell"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                sx={{ mb: 1, maxWidth: 320 }}
                fullWidth
                slotProps={{ htmlInput: { "data-field": "spell-filter" } }}
              />
              {shown.length === 0 && <p className={s.muted}>No spell matches.</p>}
              {shown.map((name) => {
                const sp = spells[name];
                const eds = EDITIONS.filter((e) => sp[e]);
                return (
                  <article key={name} className={s.ledgerRow} data-spell={name}>
                    <div>
                      <h2 className={s.ledgerTitle}>{name}</h2>
                      <div className={s.ledgerMeta}>
                        {ordinal(sp.level)} {sp.school} · {sp.time} · {sp.range} · {sp.duration}
                        {sp.concentration && " · concentration"}
                        {sp.ritual && " · ritual"}
                        {eds.length > 0 && ` · differs under ${eds.join(" and ")}`}
                      </div>
                    </div>
                    <div className={s.ledgerActions}>
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing({ form: toForm(name, sp), isNew: false })}>
                        {readOnly ? "View" : "Edit"}
                      </Button>
                      {!readOnly && (
                        <Button size="small" color="secondary" startIcon={<DeleteOutlinedIcon />} onClick={() => setDeleting(name)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>

            {editing && (
              <SpellDialog
                key={editing.form.name || "new"}
                initial={editing.form}
                isNew={editing.isNew}
                readOnly={readOnly}
                taken={(n) => Object.hasOwn(spells, n)}
                busy={busy}
                error={error}
                onClose={() => {
                  setEditing(null);
                  setError(null);
                }}
                onSave={async (f) => {
                  const ok = await call(editing.isNew ? "POST" : "PUT", { name: f.name, info: fromForm(f) });
                  if (ok) {
                    setEditing(null);
                    setSaved(
                      `Saved “${f.name}”. A one-shot open in the builder sees it once you reload its page (your draft is autosaved).`,
                    );
                  }
                }}
              />
            )}
            {deleting && (
              <Dialog open onClose={() => setDeleting(null)} fullWidth maxWidth="xs" aria-labelledby="delete-spell-title">
                <DialogTitle id="delete-spell-title">Delete “{deleting}”?</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    It comes out of the spell book. A one-shot that still uses it keeps it from being deleted. Git still has whatever you
                    committed.
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setDeleting(null)}>Keep it</Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    disabled={busy}
                    onClick={async () => {
                      const name = deleting;
                      setDeleting(null);
                      if (await call("DELETE", { name })) setSaved(`Deleted “${name}”.`);
                    }}
                  >
                    Delete
                  </Button>
                </DialogActions>
              </Dialog>
            )}
          </ThemeProvider>
        </main>
      </Container>
    </>
  );
}

function SpellDialog({
  initial,
  isNew,
  readOnly,
  taken,
  busy,
  error,
  onClose,
  onSave,
}: {
  initial: Form;
  isNew: boolean;
  readOnly: boolean;
  taken: (name: string) => boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (f: Form) => void;
}) {
  const [f, setF] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = problemsOf(f, isNew && taken(f.name));
  const ok = Object.keys(problems).length === 0;
  // Show problems once a field has been touched away from its start, or after a save attempt.
  const show = (key: string) => (tried || JSON.stringify(f) !== JSON.stringify(initial) ? problems[key] : undefined);

  const setBase = <K extends keyof Base>(k: K, v: Base[K]) => setF((x) => ({ ...x, base: { ...x.base, [k]: v } }));
  const setOver = <K extends keyof Override>(ed: Edition, k: K, v: Override[K]) =>
    setF((x) => ({ ...x, overrides: { ...x.overrides, [ed]: { ...x.overrides[ed], [k]: v } } }));

  const counted = (value: string, max: number, problem?: string) => (
    <span className={s.helper}>
      <span>{problem}</span>
      <span className={value.trim().length > max ? s.counterOver : s.counter}>
        {value.trim().length}/{max}
      </span>
    </span>
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="spell-title">
      <DialogTitle id="spell-title">{isNew ? "A new spell" : readOnly ? f.name : `Edit “${f.name}”`}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className={s.grid}>
            <TextField
              className={s.wide}
              label="Name"
              value={f.name}
              autoFocus={isNew && !f.name}
              disabled={readOnly || !isNew}
              onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))}
              error={Boolean(show("name"))}
              helperText={show("name") ?? (isNew ? "As it's written on the character's sheet; can't be changed later" : "The name can't be changed")}
              slotProps={{ htmlInput: { "data-field": "name", maxLength: 80 } }}
            />
            <TextField select label="Level" value={f.base.level} onChange={(e) => setBase("level", e.target.value)} slotProps={{ htmlInput: { "data-field": "level" } }}>
              {Array.from({ length: 10 }, (_, i) => (
                <MenuItem key={i} value={String(i)}>
                  {ordinal(i)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="School" value={f.base.school} onChange={(e) => setBase("school", e.target.value)} slotProps={{ htmlInput: { "data-field": "school" } }}>
              {SCHOOLS.map((x) => (
                <MenuItem key={x} value={x}>
                  {cap(x)}
                </MenuItem>
              ))}
            </TextField>
            {TEXT_FIELDS.map((k) => (
              <TextField
                key={k}
                label={LABELS[k]}
                value={f.base[k]}
                onChange={(e) => setBase(k, e.target.value)}
                error={Boolean(show(k))}
                helperText={show(k) ?? HINTS[k]}
                slotProps={{ htmlInput: { "data-field": k, maxLength: LIMITS[k] + 20 } }}
              />
            ))}
            <div>
              <FormControlLabel
                control={<Checkbox checked={f.base.concentration} onChange={(e) => setBase("concentration", e.target.checked)} />}
                label="Concentration"
              />
              <FormControlLabel control={<Checkbox checked={f.base.ritual} onChange={(e) => setBase("ritual", e.target.checked)} />} label="Ritual" />
            </div>
            <TextField
              className={s.wide}
              multiline
              minRows={3}
              label={LABELS.text}
              value={f.base.text}
              onChange={(e) => setBase("text", e.target.value)}
              error={Boolean(show("text"))}
              helperText={counted(f.base.text, LIMITS.text, show("text") ?? "20 to 300 characters, paraphrased for the card")}
              slotProps={{ htmlInput: { "data-field": "text" } }}
            />
            <TextField
              className={s.wide}
              multiline
              label={LABELS.higher}
              value={f.base.higher}
              onChange={(e) => setBase("higher", e.target.value)}
              error={Boolean(show("higher"))}
              helperText={counted(f.base.higher, LIMITS.higher, show("higher") ?? "Casting it with a higher slot, or how a cantrip grows. Optional.")}
              slotProps={{ htmlInput: { "data-field": "higher" } }}
            />
          </div>

          {EDITIONS.map((ed) => (
            <OverrideBlock key={ed} ed={ed} o={f.overrides[ed]} set={(k, v) => setOver(ed, k, v)} show={show} counted={counted} />
          ))}
        </fieldset>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
        {!readOnly && (
          <Button
            variant="contained"
            color="secondary"
            disabled={busy || (tried && !ok)}
            onClick={() => {
              setTried(true);
              if (ok) onSave({ ...f, name: f.name.trim() });
            }}
          >
            {isNew ? "Add to the spell book" : "Save"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function OverrideBlock({
  ed,
  o,
  set,
  show,
  counted,
}: {
  ed: Edition;
  o: Override;
  set: <K extends keyof Override>(k: K, v: Override[K]) => void;
  show: (key: string) => string | undefined;
  counted: (value: string, max: number, problem?: string) => ReactNode;
}) {
  const other = ed === "2014" ? "2024" : "2014";
  const tri = (k: "concentration" | "ritual") => (
    <TextField select label={cap(k)} value={o[k]} onChange={(e) => set(k, e.target.value)} slotProps={{ htmlInput: { "data-field": `${ed}.${k}` } }}>
      <MenuItem value="">Same</MenuItem>
      <MenuItem value="yes">Yes</MenuItem>
      <MenuItem value="no">No</MenuItem>
    </TextField>
  );
  return (
    <section className={s.fieldset} aria-label={`Under the ${ed} rules`} style={{ marginTop: 16 }}>
      <FormControlLabel
        control={<Checkbox checked={o.on} onChange={(e) => set("on", e.target.checked)} />}
        label={`Differs under the ${ed} rules`}
      />
      {o.on && (
        <>
          <p className={s.muted} style={{ margin: "0 0 8px" }}>
            Fill in only what&apos;s different under {ed}; anything left blank stays as above.
            {ed === "2024" && ` (Only for a spell whose base fields follow ${other}.)`}
          </p>
          <div className={s.grid}>
            <TextField select label="Level" value={o.level} onChange={(e) => set("level", e.target.value)}>
              <MenuItem value="">Same</MenuItem>
              {Array.from({ length: 10 }, (_, i) => (
                <MenuItem key={i} value={String(i)}>
                  {ordinal(i)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="School" value={o.school} onChange={(e) => set("school", e.target.value)}>
              <MenuItem value="">Same</MenuItem>
              {SCHOOLS.map((x) => (
                <MenuItem key={x} value={x}>
                  {cap(x)}
                </MenuItem>
              ))}
            </TextField>
            {TEXT_FIELDS.map((k) => (
              <TextField
                key={k}
                label={LABELS[k]}
                value={o[k]}
                onChange={(e) => set(k, e.target.value)}
                error={Boolean(show(`${ed}.${k}`))}
                helperText={show(`${ed}.${k}`)}
                slotProps={{ htmlInput: { "data-field": `${ed}.${k}` } }}
              />
            ))}
            {tri("concentration")}
            {tri("ritual")}
            <TextField
              className={s.wide}
              multiline
              label={LABELS.text}
              value={o.text}
              onChange={(e) => set("text", e.target.value)}
              error={Boolean(show(`${ed}.text`))}
              helperText={o.text ? counted(o.text, LIMITS.text, show(`${ed}.text`)) : undefined}
              slotProps={{ htmlInput: { "data-field": `${ed}.text` } }}
            />
            <TextField
              className={s.wide}
              multiline
              label={LABELS.higher}
              value={o.noHigher ? "" : o.higher}
              disabled={o.noHigher}
              onChange={(e) => set("higher", e.target.value)}
              error={Boolean(show(`${ed}.higher`))}
              helperText={o.higher && !o.noHigher ? counted(o.higher, LIMITS.higher, show(`${ed}.higher`)) : undefined}
              slotProps={{ htmlInput: { "data-field": `${ed}.higher` } }}
            />
            <FormControlLabel
              control={<Checkbox checked={o.noHigher} onChange={(e) => set("noHigher", e.target.checked)} />}
              label={`No upcasting under ${ed}`}
            />
          </div>
        </>
      )}
    </section>
  );
}
