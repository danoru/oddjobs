import { coreFlashback, coreGm, coreHints, corePoster, corePosting, coreSkin, coreTablePlay, coreUnclaimed, freshId } from "@/lib/editor/core";
import type { SystemEditor } from "@/lib/editor/types";
import { getAt } from "@/lib/store/doc";
import { ANCESTRIES, COMMUNITIES, DOMAIN_CARDS } from "./srd";

/**
 * The Daggerheart builder: the shared sections, the one-shot's level and its
 * GM-only adversaries, and the mechanics panel with live rules help
 * (src/components/admin/panels/MechDh.tsx): class and subclass, the trait
 * spread, Evasion, Hit Points, Stress, Armor and thresholds worked out from
 * the SRD tables, domain cards from the class's two domains, and weapons.
 */
export const editor: SystemEditor = {
  oneshotSections: [
    { ...corePosting, fields: [...corePosting.fields!, "level"] },
    coreSkin,
    coreTablePlay,
    {
      id: "adversaries",
      title: "Adversaries",
      scope: "oneshot",
      help: "GM-only stat blocks for tonight's foes, in your own words. The GM page rolls their attacks (a d20 plus the modifier) behind the screen.",
      fields: ["adversaries"],
    },
    coreGm,
  ],
  characterSections: [
    corePoster,
    {
      id: "story",
      title: "Story & ties",
      scope: "character",
      help: "Everything on the back of the sheet. Only the claiming player sees the secret and the private tie texts.",
      fields: [
        "story.pronouns",
        "story.concept",
        "story.stake",
        "story.goal",
        "story.secret",
        "story.appearance",
        "story.voice",
        "story.mannerisms",
        "story.background",
        "story.intro",
        "story.ties",
      ],
    },
    coreFlashback,
    coreUnclaimed,
    {
      id: "mech",
      title: "Mechanics",
      scope: "character",
      help: "Class, traits, Evasion, Hit Points, Stress, Armor, thresholds, Experiences, domain cards and weapons. The rules numbers are worked out as you type; publishing holds the sheet to them.",
      panel: "mechDh",
    },
  ],
  hints: {
    ...coreHints,
    "oneshot:level": { help: "Every character in the cast is built at this level. The checks are complete at level 1." },
    "oneshot:adversaries": {
      itemLabel: "adversary",
      fields: ["name", "type", "tier", "description", "motives", "difficulty", "thresholds", "hp", "stress", "attack", "features", "id"],
      newItem: (doc) => ({
        id: freshId("foe", ((doc.oneshot.adversaries as { id?: string }[] | undefined) ?? []).map((a) => a.id)),
        type: "Standard",
        tier: 1,
        difficulty: 11,
        thresholds: { major: 7, severe: 12 },
        hp: 4,
        stress: 2,
        attack: { name: "Claws", mod: 1, range: "Melee", damage: "1d8+2", damageType: "physical" },
        features: [],
      }),
      summary: (item) => {
        const a = item as { type?: string; difficulty?: number; hp?: number };
        return a.type ? `${a.type} · Difficulty ${a.difficulty ?? "?"} · ${a.hp ?? "?"} HP` : null;
      },
    },
    "oneshot:adversaries.*.id": { widget: "text" },
    "oneshot:adversaries.*.name": { widget: "text" },
    "oneshot:adversaries.*.attack": { fields: ["name", "mod", "range", "damage", "damageType"] },
    "oneshot:adversaries.*.attack.name": { widget: "text" },
    "oneshot:adversaries.*.attack.damage": { widget: "text", placeholder: "1d8+2" },
    "oneshot:adversaries.*.features": { itemLabel: "feature", fields: ["name", "text"] },
    "oneshot:adversaries.*.features.*.name": { widget: "text" },
    "character:story.pronouns": { widget: "text" },
    "character:story.mannerisms": { itemLabel: "mannerism" },
    "character:story.background": { itemLabel: "question", fields: ["question", "answer"] },

    // Mechanics (src/components/admin/panels/MechDh.tsx lays these out).
    "character:mech.subclass": { widget: "text" },
    "character:mech.ancestry": { widget: "suggest", options: [...ANCESTRIES] },
    "character:mech.community": { widget: "suggest", options: [...COMMUNITIES] },
    "character:mech.armor": { fields: ["name", "score", "major", "severe", "evasionMod", "feature"] },
    "character:mech.armor.name": { widget: "text" },
    "character:mech.armor.feature": { widget: "text" },
    "character:mech.bonuses": { fields: ["evasion", "hp", "stress", "armor", "thresholds", "cards", "note"] },
    "character:mech.bonuses.note": { widget: "text", placeholder: "Giant: +1 Hit Point" },
    "character:mech.experiences": { itemLabel: "Experience", fields: ["name", "bonus"], newItem: () => ({ bonus: 2 }) },
    "character:mech.experiences.*.name": { widget: "text", placeholder: "Smuggler's Nerve" },
    "character:mech.domainCards": {
      itemLabel: "card",
      fields: ["name", "where", "note"],
      newItem: () => ({ where: "loadout" }),
      summary: (item) => {
        const info = DOMAIN_CARDS.find((c) => c.name === (item as { name?: string }).name);
        return info ? `${info.domain} ${info.level} · ${info.type} · recall ${info.recall}` : null;
      },
    },
    "character:mech.domainCards.*.name": { widget: "suggest", options: DOMAIN_CARDS.map((c) => c.name) },
    "character:mech.domainCards.*.note": { widget: "text" },
    "character:mech.weapons": {
      itemLabel: "weapon",
      fields: ["name", "slot", "trait", "range", "die", "mod", "damageType", "burden", "feature"],
      newItem: () => ({ slot: "primary", trait: "agility", range: "Melee", die: "d8", mod: 0, damageType: "physical", burden: "one-handed" }),
      summary: (item, doc, path) => {
        const wpn = item as { trait?: string; die?: string; mod?: number };
        const prof = Number(getAt(doc, [...path.slice(0, -2), "proficiency"]) ?? 1) || 1;
        return wpn.die ? `${wpn.trait ?? "?"} · ${prof}${wpn.die}${wpn.mod ? `+${wpn.mod}` : ""}` : null;
      },
    },
    "character:mech.weapons.*.name": { widget: "text" },
    "character:mech.weapons.*.feature": { widget: "text" },
    "character:mech.features": {
      itemLabel: "feature",
      fields: ["name", "source", "hope", "uses", "text"],
      newItem: () => ({ source: "class" }),
      summary: (item) => ((item as { hope?: boolean }).hope ? "Hope feature (3 Hope)" : ((item as { source?: string }).source ?? null)),
    },
    "character:mech.features.*.name": { widget: "text" },
    "character:mech.equipment": { itemLabel: "item", fields: ["name", "qty", "note"] },
    "character:mech.equipment.*.name": { widget: "text" },
    "character:mech.equipment.*.note": { widget: "text" },
  },
  newOneShot: (slug, title) => ({
    slug,
    title,
    system: "daggerheart",
    level: 1,
    players: { min: 3, max: 5 },
    durationHrs: 4,
    tone: [],
    posting: {},
    coreRoles: [],
    letters: [],
    content: { sources: [], warnings: [] },
    skin: "noticeboard",
    adversaries: [],
  }),
  newCharacter: (doc, id, name) => {
    const level = typeof doc.oneshot.level === "number" ? doc.oneshot.level : 1;
    return {
      id,
      name,
      poster: { header: "WANTED", icon: "sword" },
      story: { mannerisms: [], background: [], ties: [] },
      // A level-1 Warrior in leather armor, so the numbers start out right.
      mech: {
        class: "Warrior",
        subclass: "Call of the Brave",
        level,
        traits: { agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
        evasion: 11,
        armor: { name: "Leather Armor", score: 3, major: 6, severe: 13, evasionMod: 0 },
        armorScore: 3,
        hp: 6,
        stress: 6,
        thresholds: { major: 6 + level, severe: 13 + level },
        proficiency: 1,
        bonuses: {},
        experiences: [],
        domainCards: [],
        weapons: [],
        features: [],
        equipment: [],
        gold: { handfuls: 1, bags: 0, chests: 0 },
      },
    };
  },
};
