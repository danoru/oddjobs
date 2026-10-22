import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { getAt, moveItem, pathKey, renameCharacterId, isSafeId, setAt as setAtPath } from "@/lib/store/doc";
import { hintFor, humanize, maxLength, minItems, objectKeys, schemaAt, scopeOf, unionBranch, type SchemaNode } from "@/lib/editor/schemaAt";
import type { DocPath } from "@/lib/oneShotCheck";
import type { FieldHint } from "@/lib/editor/types";
import { PosterIcon, type IconKey } from "@/components/PosterIcon";
import { KeepsakeArt } from "@/components/keepsake/KeepsakeArt";
import type { KeepsakeArt as KeepsakeKey } from "@/lib/schema";
import { SoundEngine } from "@/lib/sound/synth";
import type { SoundBed, SoundStinger } from "@/lib/sound/synth";
import { useEditor } from "./EditorContext";
import s from "./Admin.module.css";

/**
 * One field of the builder, worked out from the schema: give it a path into
 * the draft and it finds the Zod type there, picks the input, labels it from
 * `.describe()`, counts characters against `.max()`, and shows the problems
 * the checks found at that path. Hints (src/lib/editor/types.ts) adjust it.
 */

type Kind = "string" | "number" | "boolean" | "enum" | "object" | "array" | "union" | "record" | "literal" | "other";

function kindOf(schema: z.ZodTypeAny): Kind {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodEnum) return "enum";
  if (schema instanceof z.ZodObject) return "object";
  if (schema instanceof z.ZodArray) return "array";
  if (schema instanceof z.ZodDiscriminatedUnion) return "union";
  if (schema instanceof z.ZodRecord) return "record";
  if (schema instanceof z.ZodLiteral) return "literal";
  return "other";
}

const lastKey = (path: DocPath) => path[path.length - 1];

function labelFor(hint: FieldHint, node: SchemaNode, path: DocPath): string {
  return hint.label ?? node.description ?? humanize(lastKey(path));
}

/** Short inputs share a row; long text and lists take the whole width. */
function isWide(kind: Kind, hint: FieldHint): boolean {
  if (hint.widget === "castRefs" || hint.widget === "icon" || hint.widget === "keepsake" || hint.widget === "tags") return true;
  if (kind === "string")
    return !["text", "castRef", "actRef", "readonly", "suggest", "sound", "spell"].includes(hint.widget ?? "");
  return kind === "object" || kind === "array" || kind === "union" || kind === "record" || kind === "other";
}

/** The problems at exactly this path. */
export function useIssuesAt(path: DocPath): string[] {
  const { issues } = useEditor();
  return (issues.get(pathKey(path)) ?? []).map((i) => i.message);
}

/** The wrapper every field sits in: a jump target for the issue list, and its problems underneath. */
export function FieldShell({
  path,
  wide,
  children,
  warning,
}: {
  path: DocPath;
  wide?: boolean;
  children: ReactNode;
  warning?: string | null;
}) {
  const problems = useIssuesAt(path);
  return (
    <div
      id={`f-${pathKey(path)}`}
      data-path={pathKey(path)}
      className={`${s.field} ${wide ? s.wide : ""} ${problems.length ? s.hasIssue : ""}`}
    >
      {children}
      {problems.map((p, i) => (
        <div key={i} className={s.issue} role="alert">
          {p}
        </div>
      ))}
      {warning && <div className={s.warning}>{warning}</div>}
    </div>
  );
}

/** A field of the draft at `path`, with the right input for its type. */
export function Field({ path, label, wide }: { path: DocPath; label?: string; wide?: boolean }) {
  const ctx = useEditor();
  const node = schemaAt(ctx.system, path, ctx.doc);
  const hint = hintFor(ctx.editor, path);
  if (!node || hint.widget === "hidden") return null;
  const kind = kindOf(node.schema);
  if (kind === "literal") return null;
  const value = getAt(ctx.doc, path);
  const text = label ?? labelFor(hint, node, path);
  const warning = hint.warn?.(value, ctx.doc, path) ?? null;
  const w = wide ?? isWide(kind, hint);

  // Character ids rename everything that points at them, once you leave the field.
  const where = scopeOf(path);
  if (where?.kind === "character" && where.rel.length === 1 && where.rel[0] === "id")
    return (
      <FieldShell path={path} wide={w}>
        <IdInput path={path} label={text} help={hint.help} />
      </FieldShell>
    );

  let input: ReactNode;
  switch (hint.widget) {
    case "readonly":
      input = <TextField size="small" fullWidth label={text} value={String(value ?? "")} disabled helperText={hint.help} />;
      break;
    case "castRef":
      input = <CastRef path={path} label={text} />;
      break;
    case "castRefs":
      input = <CastRefs path={path} label={text} help={hint.help} />;
      break;
    case "actRef":
      input = <ActRef path={path} label={text} help={hint.help} />;
      break;
    case "icon":
      input = <IconPicker path={path} label={text} />;
      break;
    case "keepsake":
      input = <IconPicker path={path} label={text} keepsake />;
      break;
    case "sound":
      input = <SoundPicker path={path} label={text} node={node} />;
      break;
    case "tags":
      input = <Tags path={path} label={text} hint={hint} />;
      break;
    case "suggest":
      input = <Suggest path={path} label={text} hint={hint} node={node} />;
      break;
    case "spell":
      input = <SpellName path={path} label={text} />;
      break;
    default:
      input = <ByKind kind={kind} path={path} label={text} hint={hint} node={node} />;
  }
  return (
    <FieldShell path={path} wide={w} warning={warning}>
      {input}
    </FieldShell>
  );
}

function ByKind({ kind, path, label, hint, node }: { kind: Kind; path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const ctx = useEditor();
  switch (kind) {
    case "string":
      return <TextInput path={path} label={label} hint={hint} node={node} />;
    case "number":
      return <NumberInput path={path} label={label} hint={hint} node={node} />;
    case "boolean":
      return <BoolInput path={path} label={label} node={node} />;
    case "enum":
      return <EnumInput path={path} label={label} hint={hint} node={node} />;
    case "object":
      return <ObjectField path={path} label={label} hint={hint} node={node} />;
    case "union":
      return <UnionFields path={path} label={label} />;
    case "array": {
      const el = schemaAt(ctx.system, [...path, 0], ctx.doc);
      const ek = el ? kindOf(el.schema) : "other";
      if (ek === "string" || ek === "number") return <Lines path={path} label={label} hint={hint} node={node} />;
      if (ek === "enum") return <EnumChips path={path} label={label} options={(el!.schema as z.ZodEnum<[string, ...string[]]>).options} />;
      return <ObjectList path={path} label={label} hint={hint} node={node} />;
    }
    default:
      return <JsonInput path={path} label={label} />;
  }
}

// ---- Plain inputs ------------------------------------------------------------

function TextInput({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const str = typeof value === "string" ? value : "";
  const max = maxLength(node.schema);
  const problems = useIssuesAt(path);
  const multiline = hint.widget !== "text";
  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={str}
      placeholder={hint.placeholder}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      maxRows={multiline ? 14 : undefined}
      error={problems.length > 0 || (max !== undefined && str.length > max)}
      disabled={readOnly}
      // An emptied field leaves the JSON, so a required one is reported missing.
      onChange={(e) => set(path, e.target.value === "" ? undefined : e.target.value)}
      helperText={
        max !== undefined || hint.help ? (
          <span className={s.helper}>
            <span>{hint.help}</span>
            {max !== undefined && (
              <span className={str.length > max ? s.counterOver : s.counter} aria-label={`${str.length} of ${max} characters`}>
                {str.length}/{max}
              </span>
            )}
          </span>
        ) : undefined
      }
      slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
    />
  );
}

function NumberInput({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const problems = useIssuesAt(path);
  const isInt = node.schema instanceof z.ZodNumber && node.schema.isInt;
  return (
    <TextField
      size="small"
      fullWidth
      type="number"
      label={label}
      value={typeof value === "number" ? value : ""}
      placeholder={node.hasDefault && node.defaultValue !== undefined ? String(node.defaultValue) : hint.placeholder}
      error={problems.length > 0}
      disabled={readOnly}
      helperText={hint.help}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return set(path, undefined);
        const n = isInt ? parseInt(raw, 10) : Number(raw);
        if (Number.isFinite(n)) set(path, n);
      }}
      slotProps={{ htmlInput: { step: isInt ? 1 : "any", "data-field": pathKey(path) } }}
    />
  );
}

function BoolInput({ path, label, node }: { path: DocPath; label: string; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const fallback = node.hasDefault ? node.defaultValue === true : false;
  const on = typeof value === "boolean" ? value : fallback;
  return (
    <FormControlLabel
      control={
        <Switch
          checked={on}
          disabled={readOnly}
          // Back to the default leaves the key out, so files stay as they were written.
          onChange={(e) => set(path, (node.hasDefault || node.optional) && e.target.checked === fallback ? undefined : e.target.checked)}
          slotProps={{ input: { "data-field": pathKey(path) } as object }}
        />
      }
      label={label}
    />
  );
}

function EnumInput({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const problems = useIssuesAt(path);
  const options = (node.schema as z.ZodEnum<[string, ...string[]]>).options;
  const blank = node.optional || node.hasDefault;
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      value={typeof value === "string" ? value : ""}
      error={problems.length > 0}
      disabled={readOnly}
      helperText={hint.help ?? (node.hasDefault ? `Default: ${String(node.defaultValue)}` : undefined)}
      onChange={(e) => set(path, e.target.value === "" ? undefined : e.target.value)}
      slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
    >
      {(blank || typeof value !== "string") && (
        <MenuItem value="">
          <em>{node.hasDefault ? `(default: ${String(node.defaultValue)})` : "—"}</em>
        </MenuItem>
      )}
      {options.map((o) => (
        <MenuItem key={o} value={o}>
          {o}
        </MenuItem>
      ))}
    </TextField>
  );
}

function Suggest({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const problems = useIssuesAt(path);
  return (
    <Autocomplete
      freeSolo
      size="small"
      options={hint.options ?? []}
      value={typeof value === "string" ? value : ""}
      disabled={readOnly}
      onInputChange={(_e, v) => set(path, v === "" ? undefined : v)}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={problems.length > 0}
          helperText={hint.help}
          placeholder={hint.placeholder ?? (node.hasDefault ? String(node.defaultValue) : undefined)}
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "data-field": pathKey(path) } }}
        />
      )}
    />
  );
}

/** A spell from the spell book (every spell needs card text there); picking one sets its level too. */
function SpellName({ path, label }: { path: DocPath; label: string }) {
  const { doc, set, update, readOnly, spells } = useEditor();
  const value = getAt(doc, path);
  const problems = useIssuesAt(path);
  const names = Object.keys(spells).sort();
  const known = typeof value === "string" && value in spells;
  return (
    <Autocomplete
      freeSolo
      size="small"
      options={names}
      value={typeof value === "string" ? value : ""}
      disabled={readOnly}
      onInputChange={(_e, v, reason) => {
        if (reason === "input" || reason === "clear") set(path, v === "" ? undefined : v);
      }}
      onChange={(_e, v) => {
        if (typeof v !== "string") return;
        if (!(v in spells)) return set(path, v || undefined);
        const level = spells[v].level;
        const levelPath = [...path.slice(0, -1), "level"];
        update((d) =>
          getAt(d, path) === v && getAt(d, levelPath) === level ? d : setAtPath(setAtPath(d, path, v), levelPath, level),
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={problems.length > 0}
          helperText={
            typeof value === "string" && value && !known ? (
              <>
                Not in the spell book yet.{" "}
                <a href={`/admin/spells?new=${encodeURIComponent(value)}`} target="_blank" rel="noopener">
                  Add it
                </a>{" "}
                (opens a new tab; reload this page afterwards)
              </>
            ) : undefined
          }
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "data-field": pathKey(path) } }}
        />
      )}
    />
  );
}

function JsonInput({ path, label }: { path: DocPath; label: string }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <TextField
      size="small"
      fullWidth
      multiline
      minRows={3}
      label={`${label} (JSON)`}
      value={draft}
      error={bad}
      disabled={readOnly}
      helperText={bad ? "Not valid JSON yet" : undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        try {
          set(path, JSON.parse(e.target.value));
          setBad(false);
        } catch {
          setBad(true);
        }
      }}
      sx={{ fontFamily: "monospace" }}
    />
  );
}

/** A character's id: renames every reference when you leave the field, never mid-word. */
function IdInput({ path, label, help }: { path: DocPath; label: string; help?: string }) {
  const { doc, update, readOnly } = useEditor();
  const value = String(getAt(doc, path) ?? "");
  // What's being typed; null when not editing, so the field shows the saved id.
  const [editing, setEditing] = useState<string | null>(null);
  const text = editing ?? value;
  const problems = useIssuesAt(path);
  const taken = doc.cast.some((c, i) => c.id === text && i !== path[1]);
  const invalid = text !== "" && !isSafeId(text);
  const commit = () => {
    setEditing(null);
    if (text !== value && text && !invalid && !taken) update((d) => renameCharacterId(d, value, text));
  };
  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={text}
      disabled={readOnly}
      error={problems.length > 0 || invalid || taken}
      helperText={taken ? "Another character has this id" : invalid ? "Lowercase letters, digits and hyphens" : help}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
    />
  );
}

// ---- Lists ----------------------------------------------------------------------

function ListControls({ path, index, count, label }: { path: DocPath; index: number; count: number; label: string }) {
  const { doc, set, readOnly } = useEditor();
  const list = (getAt(doc, path) as unknown[]) ?? [];
  if (readOnly) return null;
  return (
    <span className={s.listControls}>
      <Tooltip title="Move up">
        <span>
          <IconButton size="small" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => set(path, moveItem(list, index, index - 1))}>
            <ArrowUpwardIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Move down">
        <span>
          <IconButton
            size="small"
            aria-label={`Move ${label} down`}
            disabled={index === count - 1}
            onClick={() => set(path, moveItem(list, index, index + 1))}
          >
            <ArrowDownwardIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Remove">
        <IconButton size="small" aria-label={`Remove ${label}`} onClick={() => set([...path, index], undefined)}>
          <DeleteOutlineIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
    </span>
  );
}

function ListHead({ label, path, node, count }: { label: string; path: DocPath; node: SchemaNode; count: number }) {
  const min = minItems(node.schema);
  const problems = useIssuesAt(path);
  return (
    <div className={s.listHead}>
      <span className={s.legend}>{label}</span>
      {min !== undefined && count < min && problems.length === 0 && <span className={s.need}>at least {min}</span>}
    </div>
  );
}

/** A list of plain values (sentences, numbers), one input each. */
function Lines({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const { doc, set, readOnly, system } = useEditor();
  const list = (getAt(doc, path) as unknown[] | undefined) ?? [];
  const item = hint.itemLabel ?? "line";
  const el = schemaAt(system, [...path, 0], doc);
  const numeric = el ? el.schema instanceof z.ZodNumber : false;
  const max = el ? maxLength(el.schema) : undefined;
  return (
    <div className={s.group}>
      <ListHead label={label} path={path} node={node} count={list.length} />
      {list.map((v, i) => (
        <FieldShell key={i} path={[...path, i]} wide>
          <div className={s.lineRow}>
            <TextField
              size="small"
              fullWidth
              multiline={!numeric}
              type={numeric ? "number" : undefined}
              value={v ?? ""}
              disabled={readOnly}
              placeholder={hint.placeholder}
              helperText={max !== undefined ? `${String(v ?? "").length}/${max}` : undefined}
              onChange={(e) => set([...path, i], numeric ? Number(e.target.value) : e.target.value)}
              slotProps={{ htmlInput: { "data-field": pathKey([...path, i]), "aria-label": `${label} ${i + 1}` } }}
            />
            <ListControls path={path} index={i} count={list.length} label={`${item} ${i + 1}`} />
          </div>
        </FieldShell>
      ))}
      {!readOnly && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => set(path, [...list, numeric ? 0 : ""])} className={s.addButton}>
          Add {item}
        </Button>
      )}
    </div>
  );
}

/** Words as chips: type and press Enter. */
function Tags({ path, label, hint }: { path: DocPath; label: string; hint: FieldHint }) {
  const { doc, set, readOnly } = useEditor();
  const list = ((getAt(doc, path) as unknown[] | undefined) ?? []).map(String);
  const problems = useIssuesAt(path);
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={hint.options ?? []}
      value={list}
      disabled={readOnly}
      onChange={(_e, v) => set(path, v.map((x) => String(x).trim()).filter(Boolean))}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={hint.placeholder ?? "Type and press Enter"}
          error={problems.length > 0}
          helperText={hint.help}
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "data-field": pathKey(path) } }}
        />
      )}
    />
  );
}

/** A list of fixed choices as toggle chips (party roles, saves). */
export function EnumChips({ path, label, options }: { path: DocPath; label: string; options: readonly string[] }) {
  const { doc, set, readOnly } = useEditor();
  const list = ((getAt(doc, path) as unknown[] | undefined) ?? []).map(String);
  return (
    <div className={s.group} role="group" aria-label={label}>
      <span className={s.legend}>{label}</span>
      <div className={s.chips}>
        {options.map((o) => {
          const on = list.includes(o);
          return (
            <Chip
              key={o}
              label={o}
              size="small"
              color={on ? "secondary" : "default"}
              variant={on ? "filled" : "outlined"}
              aria-pressed={on}
              disabled={readOnly}
              data-field={`${pathKey(path)}:${o}`}
              onClick={() => set(path, on ? list.filter((x) => x !== o) : [...list, o])}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A list of objects: each item a card with its own fields. */
function ObjectList({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const ctx = useEditor();
  const list = (getAt(ctx.doc, path) as unknown[] | undefined) ?? [];
  const item = hint.itemLabel ?? "item";
  const el = (node.schema as z.ZodArray<z.ZodTypeAny>).element;
  const elNode = schemaAt(ctx.system, [...path, 0], ctx.doc);
  const fresh = () => {
    if (hint.newItem) return hint.newItem(ctx.doc);
    const inner = elNode?.schema ?? el;
    if (inner instanceof z.ZodDiscriminatedUnion) return { [inner.discriminator]: inner.options[0].shape[inner.discriminator].value };
    return {};
  };
  return (
    <div className={s.group}>
      <ListHead label={label} path={path} node={node} count={list.length} />
      {list.map((v, i) => {
        const itemPath = [...path, i];
        const title = itemTitle(v);
        const summary = hint.summary?.(v, ctx.doc, itemPath);
        return (
          <FieldShell key={i} path={itemPath} wide>
            <div className={s.cardWrap}>
              <ItemCard initiallyOpen={list.length <= 3 || !title}>
                <summary className={s.cardHead}>
                  <span className={s.cardTitle}>
                    {humanize(item)} {i + 1}
                    {title && <span className={s.cardName}> · {title}</span>}
                    {summary && <span className={s.cardSummary}>{summary}</span>}
                  </span>
                </summary>
                <ItemFields path={itemPath} hint={hint} />
              </ItemCard>
              {/* Beside the summary, not in it: buttons can't nest inside another control. */}
              <span className={s.cardControls}>
                <ListControls path={path} index={i} count={list.length} label={`${item} ${i + 1}`} />
              </span>
            </div>
          </FieldShell>
        );
      })}
      {!ctx.readOnly && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => ctx.set(path, [...list, fresh()])} className={s.addButton}>
          Add {item}
        </Button>
      )}
    </div>
  );
}

/** A list item's card. Open or closed is the reader's choice; typing a title doesn't fold it away. */
function ItemCard({ initiallyOpen, children }: { initiallyOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details className={s.card} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      {children}
    </details>
  );
}

function itemTitle(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  for (const k of ["name", "title", "label", "beat", "id"]) if (typeof o[k] === "string" && o[k]) return String(o[k]);
  return "";
}

/** The fields of one list item, or of a union item after its kind. */
function ItemFields({ path, hint }: { path: DocPath; hint: FieldHint }) {
  const ctx = useEditor();
  const node = schemaAt(ctx.system, path, ctx.doc);
  if (!node) return null;
  if (node.schema instanceof z.ZodDiscriminatedUnion) return <UnionFields path={path} />;
  const keys = hint.fields ?? objectKeys(node.schema);
  return (
    <div className={s.grid}>
      {keys.map((k) => (
        <Field key={k} path={[...path, k]} />
      ))}
    </div>
  );
}

/** One nested object (players, posting, gazette…). Optional ones can be added and removed. */
function ObjectField({ path, label, hint, node }: { path: DocPath; label: string; hint: FieldHint; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  if (value === undefined && (node.optional || node.hasDefault)) {
    return (
      <div className={s.group}>
        <span className={s.legend}>{label}</span>
        {!readOnly && (
          <Button size="small" startIcon={<AddIcon />} className={s.addButton} onClick={() => set(path, hint.newItem?.(doc) ?? {})}>
            Add {label.toLowerCase()}
          </Button>
        )}
        {readOnly && <span className={s.muted}>None</span>}
      </div>
    );
  }
  const keys = hint.fields ?? objectKeys(node.schema);
  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>
        {label}
        {node.optional && !readOnly && (
          <Button size="small" onClick={() => set(path, undefined)} className={s.removeLink}>
            Remove
          </Button>
        )}
      </legend>
      <div className={s.grid}>
        {keys.map((k) => (
          <Field key={k} path={[...path, k]} />
        ))}
      </div>
    </fieldset>
  );
}

/** A discriminated union (5e customization options): pick the kind, then its fields. */
function UnionFields({ path, label }: { path: DocPath; label?: string }) {
  const ctx = useEditor();
  const where = scopeOf(path);
  const node = schemaAt(ctx.system, path, ctx.doc);
  if (!node || !(node.schema instanceof z.ZodDiscriminatedUnion) || !where) return null;
  const u = node.schema;
  const value = (getAt(ctx.doc, path) as Record<string, unknown> | undefined) ?? {};
  const branch = unionBranch(u, value);
  const tags = u.options.map((o: z.AnyZodObject) => String(o.shape[u.discriminator].value));
  const current = String(value[u.discriminator] ?? tags[0]);
  const keys = Object.keys(branch.shape).filter((k) => k !== u.discriminator);
  return (
    <div className={s.grid}>
      {label && <span className={`${s.legend} ${s.wide}`}>{label}</span>}
      <FieldShell path={[...path, u.discriminator]}>
        <TextField
          select
          size="small"
          fullWidth
          label={humanize(u.discriminator)}
          value={current}
          disabled={ctx.readOnly}
          // A new kind keeps the id and label; its choices start over.
          onChange={(e) => ctx.set(path, { [u.discriminator]: e.target.value, id: value.id, label: value.label })}
          slotProps={{ htmlInput: { "data-field": pathKey([...path, u.discriminator]) } }}
        >
          {tags.map((t: string) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
      </FieldShell>
      {keys.map((k) => (
        <Field key={k} path={[...path, k]} />
      ))}
    </div>
  );
}

// ---- Pickers ------------------------------------------------------------------------

/** Other cast members, in board order (not the character being edited). */
function useOthers(path: DocPath) {
  const { doc } = useEditor();
  const self = path[0] === "cast" ? doc.cast[path[1] as number]?.id : undefined;
  return doc.cast
    .filter((c) => typeof c.id === "string" && c.id !== self)
    .map((c) => ({ id: String(c.id), name: typeof c.name === "string" && c.name ? c.name : String(c.id) }));
}

/** One of the one-shot's act cards, by id (or none). */
function ActRef({ path, label, help }: { path: DocPath; label: string; help?: string }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const problems = useIssuesAt(path);
  const acts = ((doc.oneshot.acts as { id?: unknown; title?: unknown }[] | undefined) ?? []).filter(
    (a): a is { id: string; title?: unknown } => typeof a?.id === "string",
  );
  const known = acts.some((a) => a.id === value);
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      value={typeof value === "string" ? value : ""}
      disabled={readOnly}
      error={problems.length > 0}
      helperText={problems[0] ?? help}
      onChange={(e) => set(path, e.target.value || undefined)}
      slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
    >
      <MenuItem value="">
        <em>No act</em>
      </MenuItem>
      {typeof value === "string" && value && !known && (
        <MenuItem value={value}>
          <em>{value} (no such act card)</em>
        </MenuItem>
      )}
      {acts.map((a, i) => (
        <MenuItem key={a.id} value={a.id}>
          {`Act ${i + 1}: ${typeof a.title === "string" && a.title ? a.title : a.id}`}
        </MenuItem>
      ))}
    </TextField>
  );
}

function CastRef({ path, label }: { path: DocPath; label: string }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const others = useOthers(path);
  const problems = useIssuesAt(path);
  const known = others.some((o) => o.id === value);
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      value={typeof value === "string" ? value : ""}
      disabled={readOnly}
      error={problems.length > 0}
      onChange={(e) => set(path, e.target.value || undefined)}
      slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
    >
      {typeof value === "string" && value && !known && (
        <MenuItem value={value}>
          <em>{value} (not in the cast)</em>
        </MenuItem>
      )}
      {others.length === 0 && (
        <MenuItem value="" disabled>
          Add another character first
        </MenuItem>
      )}
      {others.map((o) => (
        <MenuItem key={o.id} value={o.id}>
          {o.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Several cast members, in an order that matters (heirs: the first at the table wins). */
function CastRefs({ path, label, help }: { path: DocPath; label: string; help?: string }) {
  const { doc, set, readOnly } = useEditor();
  const list = ((getAt(doc, path) as unknown[] | undefined) ?? []).map(String);
  const others = useOthers(path);
  const nameOf = (id: string) => others.find((o) => o.id === id)?.name ?? `${id} (not in the cast)`;
  const left = others.filter((o) => !list.includes(o.id));
  return (
    <div className={s.group}>
      <span className={s.legend}>{label}</span>
      {help && <span className={s.muted}>{help}</span>}
      <ol className={s.refList}>
        {list.map((id, i) => (
          <li key={id} className={s.refItem}>
            <span>{nameOf(id)}</span>
            <ListControls path={path} index={i} count={list.length} label={nameOf(id)} />
          </li>
        ))}
      </ol>
      {!readOnly && left.length > 0 && (
        <TextField
          select
          size="small"
          label="Add"
          value=""
          sx={{ minWidth: 200 }}
          onChange={(e) => set(path, [...list, e.target.value])}
          slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
        >
          {left.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {o.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </div>
  );
}

/** The poster icons, or (`keepsake`) the keepsake drawings. */
function IconPicker({ path, label, keepsake = false }: { path: DocPath; label: string; keepsake?: boolean }) {
  const ctx = useEditor();
  const value = getAt(ctx.doc, path);
  const node = schemaAt(ctx.system, path, ctx.doc);
  const icons = node && node.schema instanceof z.ZodEnum ? (node.schema.options as string[]) : [];
  return (
    <div className={s.group}>
      <span className={s.legend} id={`lbl-${pathKey(path)}`}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`lbl-${pathKey(path)}`} className={s.iconGrid}>
        {icons.map((icon) => (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={value === icon}
            aria-label={icon}
            title={icon}
            disabled={ctx.readOnly}
            data-field={`${pathKey(path)}:${icon}`}
            className={value === icon ? s.iconOn : s.iconButton}
            onClick={() => ctx.set(path, icon)}
          >
            {keepsake ? <KeepsakeArt art={icon as KeepsakeKey} size={34} /> : <PosterIcon icon={icon as IconKey} size={28} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Sound preview ----------------------------------------------------------------

let engine: SoundEngine | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function SoundPicker({ path, label, node }: { path: DocPath; label: string; node: SchemaNode }) {
  const { doc, set, readOnly } = useEditor();
  const value = getAt(doc, path);
  const bed = path.includes("beds");
  const options = (node.schema as z.ZodEnum<[string, ...string[]]>).options;
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const problems = useIssuesAt(path);

  function play() {
    if (!SoundEngine.isSupported() || typeof value !== "string") return;
    engine ??= new SoundEngine({ volume: 0.7 });
    if (!bed) return engine.playStinger(value as SoundStinger);
    if (playing) {
      engine.stopBed();
      setPlaying(false);
      return;
    }
    engine.playBed(value as SoundBed);
    setPlaying(true);
    // A preview, not a session: beds stop on their own after a few seconds.
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      engine?.stopBed();
      if (mounted.current) setPlaying(false);
    }, 8000);
  }

  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
      <TextField
        select
        size="small"
        fullWidth
        label={label}
        value={typeof value === "string" ? value : ""}
        disabled={readOnly}
        error={problems.length > 0}
        onChange={(e) => set(path, e.target.value)}
        slotProps={{ htmlInput: { "data-field": pathKey(path) } }}
      >
        {options.map((o) => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </TextField>
      <Tooltip title={bed ? (playing ? "Stop" : "Preview (8 s)") : "Preview"}>
        <span>
          <IconButton aria-label={`Preview ${String(value ?? "sound")}`} onClick={play} disabled={typeof value !== "string"}>
            {playing ? <StopIcon /> : <PlayArrowIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
