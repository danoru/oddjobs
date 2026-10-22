import type { OneShotDoc } from "@/lib/oneShotCheck";
import type { EditorSection, FieldHint } from "./types";
import { mysteryKeepsakeWarning, publicTieWarning } from "./warnings";

/**
 * The builder sections every system shares. A system's editor
 * (src/systems/<id>/editor.ts) slots its own fields and panels in around
 * these; see src/lib/editor/types.ts for how a section becomes a form.
 */

const castIds = (doc: OneShotDoc) => doc.cast.map((c) => c.id).filter((x): x is string => typeof x === "string");

/** A fresh id not yet used in a list. */
export function freshId(base: string, taken: unknown[]): string {
  const used = new Set(taken.map(String));
  for (let i = 1; ; i++) {
    const id = i === 1 ? base : `${base}-${i}`;
    if (!used.has(id)) return id;
  }
}

export const corePosting: EditorSection = {
  id: "posting",
  title: "Posting & premise",
  scope: "oneshot",
  help: "What goes up on the board, and why these people are together tonight.",
  fields: ["title", "slug", "posting.header", "pitch", "premise", "posting.reward", "setting", "tone", "players", "durationHrs"],
};

export const coreSkin: EditorSection = {
  id: "skin",
  title: "Skin",
  scope: "oneshot",
  help: "How the job page and its posters are dressed. The home board always stays the notice board.",
  fields: ["skin"],
};

export const coreTablePlay: EditorSection = {
  id: "table",
  title: "Table play",
  scope: "oneshot",
  help: "Sealed letters the GM delivers mid-session, act cards for the TV, rumors players draw, notices for the town board, the soundboard and the morning-after broadsheet. Acts, rumors and notices stay off player pages until the GM shows, deals or pins them.",
  fields: ["acts", "letters", "rumors", "notices", "sounds", "gazette"],
};

export const coreGm: EditorSection = {
  id: "gm",
  title: "GM notes & content",
  scope: "oneshot",
  help: "Only the GM page shows the notes.",
  fields: ["gmNotes", "coreRoles", "content.warnings", "content.sources"],
};

export const coreKeepsakes: EditorSection = {
  id: "keepsakes",
  title: "Keepsakes",
  scope: "oneshot",
  help: "What players and the GM take home: a small object on their profile once the game is finished. Anyone who reads a profile sees it, so keep it free of spoilers. Without keepsakes, everyone gets a ticket stub; a character can have their own on their Keepsake tab.",
  fields: ["keepsakes"],
};

export const coreCharacterKeepsake: EditorSection = {
  id: "keepsake",
  title: "Keepsake",
  scope: "character",
  help: "Optional: what this character's player takes home instead of the one-shot's shared player keepsake. If they fall, it comes home cracked or scorched.",
  fields: ["keepsake"],
};

export const corePoster: EditorSection = {
  id: "poster",
  title: "Poster",
  scope: "character",
  fields: ["name", "id", "poster.header", "poster.alias", "poster.epithet", "poster.hook", "poster.reward", "poster.icon", "portrait"],
};

export const coreFlashback: EditorSection = {
  id: "flashback",
  title: "Flashback",
  scope: "character",
  help: "Session zero: a question the player answers in a sentence after claiming. The GM page collects the answers.",
  fields: ["flashback"],
};

export const coreUnclaimed: EditorSection = {
  id: "unclaimed",
  title: "If unclaimed",
  scope: "character",
  help: "How the GM runs them when nobody takes the poster, and which beats move to whom.",
  fields: ["ifUnclaimed"],
};

export const coreHints: Record<string, FieldHint> = {
  "oneshot:slug": { widget: "readonly", help: "Fixed once created. To rename, duplicate it and delete the old one." },
  "oneshot:title": { widget: "text" },
  "oneshot:posting.header": { widget: "text", placeholder: "WANTED: HANDS FOR A NIGHT AT THE AUCTION" },
  "oneshot:posting.reward": { widget: "text" },
  "oneshot:setting": { widget: "text" },
  "oneshot:tone": { widget: "tags", placeholder: "Add a word and press Enter" },
  "oneshot:content.warnings": { widget: "tags", placeholder: "Add a warning and press Enter" },
  "oneshot:coreRoles": { widget: "castRefs" },
  "oneshot:letters": {
    itemLabel: "letter",
    fields: ["to", "when", "act", "title", "text", "id"],
    newItem: (doc) => ({
      id: freshId("letter", ((doc.oneshot.letters as { id?: string }[] | undefined) ?? []).map((l) => l.id)),
      to: castIds(doc)[0],
    }),
  },
  "oneshot:letters.*.to": { widget: "castRef" },
  "oneshot:letters.*.id": { widget: "text", help: "Any short kebab-case name; it's how deliveries are remembered." },
  "oneshot:letters.*.when": { widget: "text", placeholder: "Act 2: after the auction" },
  "oneshot:letters.*.title": { widget: "text" },
  "oneshot:letters.*.act": { widget: "actRef", help: "Printed on the envelope in the box, and lights the letter on the GM's spotlight when that act is up." },
  "oneshot:acts": {
    itemLabel: "act",
    help: "Title cards the GM puts on the TV between scenes, in order.",
    fields: ["title", "subtitle", "image", "id"],
    newItem: (doc) => ({ id: freshId("act", ((doc.oneshot.acts as { id?: string }[] | undefined) ?? []).map((a) => a.id)) }),
    summary: (item) => (item as { subtitle?: string }).subtitle ?? null,
  },
  "oneshot:acts.*.id": { widget: "text" },
  "oneshot:acts.*.title": { widget: "text", placeholder: "The Beach at Midnight" },
  "oneshot:acts.*.subtitle": { widget: "text" },
  "oneshot:acts.*.image": { widget: "text", placeholder: "https://… (leave empty for an engraved panel)" },
  "oneshot:rumors": {
    itemLabel: "rumor",
    help: "Each player draws two after claiming; six to eight is plenty. Only the GM sees which are true.",
    fields: ["text", "truth", "id"],
    newItem: (doc) => ({ id: freshId("rumor", ((doc.oneshot.rumors as { id?: string }[] | undefined) ?? []).map((r) => r.id)), truth: "true" }),
    summary: (item) => {
      const t = (item as { truth?: string }).truth;
      return t === "half" ? "half true" : (t ?? null);
    },
  },
  "oneshot:rumors.*.id": { widget: "text" },
  "oneshot:notices": {
    itemLabel: "notice",
    help: "Presets the GM pins to the shared board mid-session (the GM can also write one on the night).",
    fields: ["kind", "title", "text", "id"],
    newItem: (doc) => ({ id: freshId("notice", ((doc.oneshot.notices as { id?: string }[] | undefined) ?? []).map((n) => n.id)), kind: "poster" }),
    summary: (item) => (item as { kind?: string }).kind ?? null,
  },
  "oneshot:notices.*.id": { widget: "text" },
  "oneshot:notices.*.title": { widget: "text", placeholder: "REWARD DOUBLED" },
  "oneshot:sounds": { fields: ["beds", "stingers"] },
  "oneshot:sounds.beds": {
    itemLabel: "bed",
    fields: ["label", "preset", "id"],
    newItem: (doc) => ({
      id: freshId("bed", (((doc.oneshot.sounds as { beds?: { id?: string }[] }) ?? {}).beds ?? []).map((b) => b.id)),
      preset: "tavern",
    }),
  },
  "oneshot:sounds.stingers": {
    itemLabel: "stinger",
    fields: ["label", "preset", "id"],
    newItem: (doc) => ({
      id: freshId("cue", (((doc.oneshot.sounds as { stingers?: { id?: string }[] }) ?? {}).stingers ?? []).map((b) => b.id)),
      preset: "bell",
    }),
  },
  "oneshot:sounds.beds.*.preset": { widget: "sound" },
  "oneshot:sounds.stingers.*.preset": { widget: "sound" },
  "oneshot:sounds.beds.*.id": { widget: "text" },
  "oneshot:sounds.stingers.*.id": { widget: "text" },
  "oneshot:sounds.beds.*.label": { widget: "text" },
  "oneshot:sounds.stingers.*.label": { widget: "text" },
  "oneshot:gazette.name": { widget: "text", placeholder: "The Saltmere Gazette" },
  "oneshot:gazette.town": { widget: "text" },
  "oneshot:gazette.price": { widget: "text" },
  "oneshot:content.sources": { itemLabel: "source" },

  "oneshot:keepsakes": { fields: ["player", "gm"], newItem: () => ({ player: { art: "ticket" }, gm: { art: "gavel" } }) },
  "oneshot:keepsakes.player": { fields: ["name", "note", "art"] },
  "oneshot:keepsakes.gm": { fields: ["name", "note", "art"] },
  "oneshot:keepsakes.player.name": { widget: "text", placeholder: "Paddle No. 13" },
  "oneshot:keepsakes.gm.name": { widget: "text", placeholder: "The auctioneer's gavel" },
  "oneshot:keepsakes.player.note": { widget: "text" },
  "oneshot:keepsakes.gm.note": { widget: "text" },
  "oneshot:keepsakes.player.art": { widget: "keepsake" },
  "oneshot:keepsakes.gm.art": { widget: "keepsake" },
  "character:keepsake": { fields: ["name", "note", "art"], newItem: () => ({ art: "coin" }), warn: mysteryKeepsakeWarning },
  "character:keepsake.name": { widget: "text", placeholder: "The drowned woman's coin" },
  "character:keepsake.note": { widget: "text" },
  "character:keepsake.art": { widget: "keepsake" },

  "character:name": { widget: "text" },
  "character:id": { widget: "text", help: "Lowercase-kebab; it's the sheet's address. Renaming updates ties, letters and heirs." },
  "character:poster.epithet": { widget: "text" },
  "character:poster.alias": { widget: "text" },
  "character:poster.reward": { widget: "text" },
  "character:poster.icon": { widget: "icon" },
  "character:poster.hook": { widget: "text" },
  "character:portrait": { widget: "text", placeholder: "https://…" },
  "character:ifUnclaimed": { fields: ["npc", "reassign", "cuts"] },
  "character:ifUnclaimed.reassign": { itemLabel: "beat", fields: ["beat", "to", "text"] },
  "character:ifUnclaimed.reassign.*.to": { widget: "castRefs" },
  "character:ifUnclaimed.reassign.*.beat": { widget: "text" },
  "character:ifUnclaimed.cuts": { itemLabel: "cut" },
  "character:story.ties": { itemLabel: "tie", fields: ["to", "text", "public"] },
  "character:story.ties.*.to": { widget: "castRef" },
  "character:story.ties.*.public": { widget: "text", warn: publicTieWarning },
};
