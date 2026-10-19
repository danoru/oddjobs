import { coreFlashback, coreGm, coreHints, corePoster, corePosting, coreSkin, coreTablePlay, coreUnclaimed, freshId } from "@/lib/editor/core";
import type { SystemEditor } from "@/lib/editor/types";

/**
 * The Ten Candles builder: the module (read-aloud intro, goal, Them, areas
 * of note, pacing stages by candlelight, the Last Stand), suggested truths,
 * and optional pre-made concepts. Labels come from the schema's describe().
 */
type Module = { areas?: { id?: string }[]; stages?: { candles?: number }[] };
const mod = (doc: { oneshot: Record<string, unknown> }) => (doc.oneshot.module as Module | undefined) ?? {};

export const editor: SystemEditor = {
  oneshotSections: [
    corePosting,
    coreSkin,
    {
      id: "module",
      title: "The module",
      scope: "oneshot",
      help: "GM-only: players never see the module. Write it in your own words.",
      fields: ["module.intro", "module.goal", "module.them", "module.areas", "module.stages", "module.lastStand"],
      panel: "tcStages",
    },
    {
      id: "truths",
      title: "Suggested truths",
      scope: "oneshot",
      help: "Truths the GM can offer when the table is stuck. GM-only, at most 160 characters each.",
      fields: ["suggestedTruths"],
    },
    coreTablePlay,
    { ...coreGm, help: "Ten Candles characters are made at the table, so leave core roles empty." },
  ],
  characterSections: [
    { ...corePoster, help: "Pre-made concepts are optional: players can take one instead of starting blank. Traits are still written at the table." },
    {
      id: "story",
      title: "Story & ties",
      scope: "character",
      fields: ["story.pronouns", "story.concept", "story.look", "story.stake", "story.namePrompts", "story.carrying", "story.ties"],
    },
    coreFlashback,
    coreUnclaimed,
  ],
  hints: {
    ...coreHints,
    "character:story.pronouns": { widget: "text" },
    "character:story.namePrompts": { widget: "tags", placeholder: "Add a name and press Enter" },
    "character:story.carrying": { itemLabel: "thing" },
    "oneshot:module": { fields: ["intro", "goal", "them", "areas", "stages", "lastStand"] },
    "oneshot:module.areas": {
      itemLabel: "area",
      fields: ["name", "text", "finds", "id"],
      newItem: (doc) => ({ id: freshId("area", (mod(doc).areas ?? []).map((a) => a.id)), finds: [] }),
    },
    "oneshot:module.areas.*.id": { widget: "text" },
    "oneshot:module.areas.*.name": { widget: "text" },
    "oneshot:module.areas.*.finds": { itemLabel: "find" },
    "oneshot:module.stages": {
      itemLabel: "stage",
      fields: ["candles", "title", "text", "beats"],
      newItem: (doc) => {
        const stages = mod(doc).stages ?? [];
        const last = stages.length ? Math.min(...stages.map((s) => s.candles ?? 10)) : 11;
        return { candles: Math.max(1, last - 3), beats: [] };
      },
    },
    "oneshot:module.stages.*.title": { widget: "text" },
    "oneshot:module.stages.*.beats": { itemLabel: "beat" },
    "oneshot:suggestedTruths": { itemLabel: "truth" },
  },
  newOneShot: (slug, title) => ({
    slug,
    title,
    system: "tencandles",
    players: { min: 3, max: 5 },
    durationHrs: 3,
    tone: [],
    posting: {},
    coreRoles: [],
    letters: [],
    content: { sources: [], warnings: [] },
    skin: "noticeboard",
    module: { areas: [], stages: [] },
    suggestedTruths: [],
  }),
  newCharacter: (_doc, id, name) => ({
    id,
    name,
    poster: { header: "MISSING", icon: "candle" },
    story: { namePrompts: [], carrying: [], ties: [] },
  }),
};
