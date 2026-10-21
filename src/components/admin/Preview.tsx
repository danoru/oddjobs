import { Component, useMemo, useState, type ReactNode } from "react";
import { Button, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import * as dnd5e from "@/systems/dnd5e/schema";
import * as tencandles from "@/systems/tencandles/schema";
import * as daggerheart from "@/systems/daggerheart/schema";
import * as paranoia from "@/systems/paranoia/schema";
import { NaughtySide, PublicSide } from "@/systems/paranoia/components/Sheet";
import { treasonNames } from "@/systems/paranoia/rules";
import { SheetBack as DhSheetBack, SheetFront as DhSheetFront } from "@/systems/daggerheart/components/Sheet";
import { SKINS, type Skin } from "@/lib/schema";
import { SYSTEMS } from "@/systems/registry";
import { SKIN_WORDS } from "@/lib/skins";
import { Poster } from "@/components/board/Poster";
import { YarnBoard } from "@/components/board/YarnBoard";
import { SheetBack, SheetFront } from "@/systems/dnd5e/components/sheet/Sheet";
import type { PublicCharacter, PublicTcCharacter } from "@/lib/public";
import { useEditor } from "./EditorContext";
import b from "@/components/board/Board.module.css";
import k from "@/components/board/Skins.module.css";
import s from "./Admin.module.css";

/** Keeps a half-typed draft from taking the editor down with the preview. */
class PreviewBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: string | null; key: string }> {
  state = { failed: null as string | null, key: this.props.resetKey };
  static getDerivedStateFromError(e: Error) {
    return { failed: e.message };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { key: string }) {
    return props.resetKey !== state.key ? { failed: null, key: props.resetKey } : null;
  }
  render() {
    return this.state.failed ? <p className={s.paused}>Preview paused: {this.state.failed}</p> : this.props.children;
  }
}

type Parsed = { index: number; c: PublicCharacter | PublicTcCharacter | daggerheart.Character | paranoia.Character };

/**
 * What players will get, drawn with the real components as you type: the
 * posting and posters, the red-yarn board and (5e) the character sheet.
 * Characters that don't parse yet are left out until they do. The full
 * pages, printable, open from the saved draft at /admin/preview.
 */
export function Preview({ slug, selected, level }: { slug: string; selected: number | null; level: number | null }) {
  const { doc, system } = useEditor();
  const [tab, setTab] = useState<"board" | "yarn" | "sheet">("board");
  const [pick, setPick] = useState<number | null>(null);
  const skin: Skin = (SKINS as readonly unknown[]).includes(doc.oneshot.skin) ? (doc.oneshot.skin as Skin) : "noticeboard";
  const words = SKIN_WORDS[skin];
  const charSchema = system === "dnd5e" ? dnd5e.characterSchema : system === "daggerheart" ? daggerheart.characterSchema : system === "paranoia" ? paranoia.characterSchema : tencandles.characterSchema;

  const parsed: Parsed[] = useMemo(
    () =>
      doc.cast.flatMap((raw, index) => {
        const r = charSchema.safeParse(raw);
        return r.success ? [{ index, c: r.data as Parsed["c"] }] : [];
      }),
    [doc.cast, charSchema],
  );
  const missing = doc.cast.length - parsed.length;
  const ids = new Set(parsed.map((p) => p.c.id));
  // Strings only between characters the board can draw.
  const yarnCast = parsed.map(({ c }) => ({ ...c, story: { ...c.story, ties: c.story.ties.filter((t) => ids.has(t.to)) } }));
  const core = (doc.oneshot.coreRoles as string[] | undefined) ?? [];
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  const posting = (doc.oneshot.posting as Record<string, unknown> | undefined) ?? {};
  const sheetIndex = pick ?? selected ?? parsed[0]?.index ?? null;

  return (
    <section className={s.preview} aria-label="Live preview">
      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          "& .MuiTab-root": { color: "var(--parchment-dark)" },
          "& .MuiTab-root.Mui-selected": { color: "var(--brass)" },
          "& .MuiTabs-indicator": { backgroundColor: "var(--brass)" },
        }}
      >
        <Tab value="board" label="Board" />
        <Tab value="yarn" label="Who knows whom" />
        <Tab value="sheet" label={system === "tencandles" ? "Pre-made" : "Sheet"} />
      </Tabs>
      <div className={s.previewBody}>
        {missing > 0 && (
          <p className={s.paused} style={{ padding: "4px 6px" }}>
            {missing} character{missing === 1 ? "" : "s"} not shown until {missing === 1 ? "it parses" : "they parse"} (see the problems list).
          </p>
        )}
        {tab === "board" && (
          <PreviewBoundary resetKey={JSON.stringify(doc.oneshot).length + ":" + parsed.length}>
            <div className={`${b.frame} ${k.skinned} ${s.previewBoard}`} data-skin={skin} data-part="frame">
              <div className={b.note} data-part="posting" style={{ ["--tilt" as string]: "-0.6deg", marginBottom: 20 }}>
                <span className={b.brassPin} data-part="pin" aria-hidden="true" />
                <span className={b.systemBadge} data-system={system} data-part="systemBadge">
                  {SYSTEMS[system].label}
                </span>
                <div className={b.postingHeader} data-part="postingHeader">
                  {str(posting.header) || "POSTING HEADLINE"}
                </div>
                <div className={b.postingTitle} data-part="postingTitle" style={{ fontSize: 28 }}>
                  {str(doc.oneshot.title) || "Untitled"}
                </div>
                <p className={b.postingPitch} data-part="postingPitch">
                  {str(doc.oneshot.pitch) || "The pitch goes here."}
                </p>
                <div className={b.reward} data-part="reward">
                  Reward: {str(posting.reward) || "…"}
                </div>
              </div>
              <div className={s.previewPosters} data-part="castGrid" aria-label={words.cast}>
                {parsed.map(({ c }) => (
                  <Poster key={c.id} slug={slug} character={c} core={core.includes(c.id)} skin={skin} linked={false} />
                ))}
              </div>
            </div>
          </PreviewBoundary>
        )}
        {tab === "yarn" && (
          <PreviewBoundary resetKey={JSON.stringify(yarnCast).length + ""}>
            <div className={`${b.frame} ${k.skinned} ${s.previewBoard}`} data-skin={skin}>
              <div className={b.note} data-part="note">
                {yarnCast.length ? <YarnBoard cast={yarnCast} /> : <p>Add characters with ties to see the yarn.</p>}
              </div>
            </div>
          </PreviewBoundary>
        )}
        {tab === "sheet" && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <TextField
                select
                size="small"
                label="Character"
                value={sheetIndex ?? ""}
                onChange={(e) => setPick(Number(e.target.value))}
                sx={{ minWidth: 180 }}
              >
                {parsed.map(({ index, c }) => (
                  <MenuItem key={c.id} value={index}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              {sheetIndex !== null && typeof doc.cast[sheetIndex]?.id === "string" && (
                <Button
                  size="small"
                  endIcon={<OpenInNewIcon />}
                  href={`/admin/preview/${slug}/${String(doc.cast[sheetIndex].id)}`}
                  target="_blank"
                >
                  Full page
                </Button>
              )}
              {system !== "tencandles" && (
                <Button size="small" endIcon={<OpenInNewIcon />} href={`/admin/preview/${slug}/print`} target="_blank">
                  Print view
                </Button>
              )}
            </div>
            <SheetPreview index={sheetIndex} parsed={parsed} level={level} />
          </>
        )}
      </div>
    </section>
  );
}

function SheetPreview({ index, parsed, level }: { index: number | null; parsed: Parsed[]; level: number | null }) {
  const { doc, system } = useEditor();
  const found = parsed.find((p) => p.index === index);
  if (!found) return <p className={s.paused}>Pick a character that parses to see their sheet.</p>;
  if (system === "paranoia") {
    const c = found.c as paranoia.Character;
    const title = typeof doc.oneshot.title === "string" ? doc.oneshot.title : "";
    const objectives = Array.isArray(doc.oneshot.objectives) ? (doc.oneshot.objectives as string[]).filter((o) => typeof o === "string") : [];
    const levels = (doc.oneshot.houseRules as { treasonLevels?: number } | undefined)?.treasonLevels === 6 ? 6 : 5;
    return (
      <PreviewBoundary resetKey={JSON.stringify(c).length + ""}>
        <div className={s.sheetScale}>
          <PublicSide c={c} team={typeof doc.oneshot.team === "string" ? doc.oneshot.team : ""} objectives={objectives} oneshotTitle={title} wanted={treasonNames({ treasonLevels: levels })} />
          <NaughtySide c={c} naughty={c.naughty} oneshotTitle={title} />
        </div>
      </PreviewBoundary>
    );
  }
  if (system === "daggerheart") {
    const c = found.c as daggerheart.Character;
    const names = Object.fromEntries(parsed.map((p) => [p.c.id, p.c.name]));
    const title = typeof doc.oneshot.title === "string" ? doc.oneshot.title : "";
    return (
      <PreviewBoundary resetKey={JSON.stringify(c).length + ""}>
        <div className={s.sheetScale}>
          <DhSheetFront c={c} oneshotTitle={title} />
          <DhSheetBack c={c} oneshotTitle={title} names={names} />
        </div>
      </PreviewBoundary>
    );
  }
  if (system !== "dnd5e") {
    const c = found.c as PublicTcCharacter;
    return (
      <div className={k.skinned} data-skin={doc.oneshot.skin as string}>
        <div style={{ maxWidth: 240, margin: "0 auto" }}>
          <Poster slug="preview" character={c} skin={(doc.oneshot.skin as Skin) ?? "noticeboard"} linked={false} revealName />
        </div>
        <div className={b.note} style={{ marginTop: 18 }}>
          <p className={b.postingPitch}>{c.story.concept}</p>
          <p className={b.postingPitch}>
            <em>{c.story.look}</em>
          </p>
          {c.story.carrying.length > 0 && <div className={b.meta}>Carrying: {c.story.carrying.join(", ")}</div>}
        </div>
      </div>
    );
  }
  let c = found.c as dnd5e.Character;
  // At another level the sheet uses that level's mechanics, when they parse.
  const v = level !== null ? doc.variants.find((x) => x.level === level)?.cast.find((x) => x.id === c.id) : undefined;
  if (v) {
    const r = dnd5e.variantCharacterSchema.safeParse(v);
    if (r.success) c = { ...c, mech: r.data.mech, options: r.data.options ?? c.options };
  }
  const ruleset = doc.oneshot.ruleset === "2014" ? "2014" : "2024";
  const names = Object.fromEntries(parsed.map((p) => [p.c.id, p.c.name]));
  const title = typeof doc.oneshot.title === "string" ? doc.oneshot.title : "";
  return (
    <PreviewBoundary resetKey={JSON.stringify(c).length + ":" + level}>
      <div className={s.sheetScale}>
        <SheetFront c={c} ruleset={ruleset} oneshotTitle={title} />
        <SheetBack c={c} oneshotTitle={title} names={names} />
      </div>
    </PreviewBoundary>
  );
}
