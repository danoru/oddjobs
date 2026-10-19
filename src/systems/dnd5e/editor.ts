import { coreFlashback, coreGm, coreHints, corePoster, corePosting, coreSkin, coreTablePlay, coreUnclaimed } from "@/lib/editor/core";
import type { SystemEditor } from "@/lib/editor/types";
import { getAt } from "@/lib/store/doc";
import { ABILITIES } from "./schema";
import { CLASSES, deriveLoose } from "./editorMath";

/**
 * The 5e builder: the shared sections plus ruleset and level, level
 * variants, the mechanics panel with live rules help
 * (src/components/admin/panels/Mech5e.tsx) and customization options.
 */
export const editor: SystemEditor = {
  oneshotSections: [
    { ...corePosting, fields: [...corePosting.fields!, "ruleset", "level"] },
    {
      ...coreSkin,
      title: "Skin & level variants",
      help: "The skin dresses the job page. Level variants play the same story at other levels: each character gets mechanics for every level.",
      panel: "levels5e",
    },
    coreTablePlay,
    coreGm,
  ],
  characterSections: [
    { ...corePoster, fields: [...corePoster.fields!, "roles"] },
    {
      id: "story",
      title: "Story & ties",
      scope: "character",
      help: "Everything on the back of the sheet. Only the claiming player sees the secret and the private tie texts.",
      fields: [
        "story.pronouns",
        "story.age",
        "story.concept",
        "story.stake",
        "story.goal",
        "story.secret",
        "story.appearance",
        "story.voice",
        "story.mannerisms",
        "story.trinket",
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
      help: "Abilities, class, HP, AC, spells and attacks. Derived numbers update as you type; publishing holds them to the rules checks.",
      panel: "mech5e",
    },
    {
      id: "options",
      title: "Customization",
      scope: "character",
      help: "Sanctioned swaps for the Customize panel. Each option tags exactly one entry (a spell, attack, item, feature or the trinket) with its id, and lists that entry among its choices.",
      fields: ["options"],
    },
  ],
  hints: {
    ...coreHints,
    "character:story.pronouns": { widget: "text" },
    "character:story.age": { widget: "text" },
    "character:story.trinket": { widget: "text" },
    "character:story.mannerisms": { itemLabel: "mannerism" },
    "character:options": { itemLabel: "option" },
    "character:options.*.id": { widget: "text" },
    "character:options.*.label": { widget: "text" },
    "character:options.*.choices": { itemLabel: "choice" },
    "character:options.*.choices.*.id": { widget: "text" },
    "character:options.*.choices.*.label": { widget: "text" },

    // Mechanics (src/components/admin/panels/Mech5e.tsx lays these out).
    "character:mech.species": { widget: "suggest", options: ["Human", "Elf", "Dwarf", "Halfling", "Gnome", "Dragonborn", "Tiefling", "Orc", "Goliath", "Aasimar", "Half-Elf", "Half-Orc"] },
    "character:mech.lineage": { widget: "text" },
    "character:mech.background": { widget: "suggest", options: ["Acolyte", "Artisan", "Charlatan", "Criminal", "Entertainer", "Farmer", "Guard", "Guide", "Hermit", "Merchant", "Noble", "Sage", "Sailor", "Scribe", "Soldier", "Wayfarer", "Folk Hero", "Urchin", "Outlander", "Guild Artisan"] },
    "character:mech.classes": { itemLabel: "class", fields: ["name", "subclass", "level", "hitDie"], newItem: () => ({ name: "", level: 1 }) },
    "character:mech.classes.*.name": { widget: "suggest", options: [...CLASSES] },
    "character:mech.classes.*.subclass": { widget: "text" },
    "character:mech.ac.note": { widget: "text", placeholder: "Chain mail 16 + shield 2" },
    "character:mech.languages": { widget: "tags", options: ["Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc", "Draconic", "Infernal", "Celestial", "Sylvan", "Thieves' Cant"] },
    "character:mech.tools": { widget: "tags" },
    "character:mech.armorTraining": { widget: "tags", options: ["Light", "Medium", "Heavy", "Shields"] },
    "character:mech.weaponTraining": { widget: "tags", options: ["Simple", "Martial"] },
    "character:mech.senses": { widget: "tags", options: ["Darkvision 60 ft", "Darkvision 120 ft"] },
    "character:mech.feats": { widget: "tags" },
    "character:mech.originFeat": { widget: "suggest", options: ["Alert", "Crafter", "Healer", "Lucky", "Magic Initiate (Cleric)", "Magic Initiate (Druid)", "Magic Initiate (Wizard)", "Musician", "Savage Attacker", "Skilled", "Tavern Brawler", "Tough"] },
    "character:mech.weaponMasteries": { widget: "tags" },
    "character:mech.attacks": {
      itemLabel: "attack",
      fields: ["name", "kind", "ability", "dice", "damageType", "proficient", "addMod", "magicBonus", "save", "range", "properties", "mastery", "note", "option"],
      newItem: () => ({ kind: "weapon", ability: "str", dice: "1d6" }),
      summary: (_item, doc, path) => {
        const line = deriveLoose(getAt(doc, path.slice(0, -2)))?.attacks[path[path.length - 1] as number];
        return line ? `${line.toHit} · ${line.damage} ${line.damageType}`.trim() : null;
      },
    },
    "character:mech.attacks.*.name": { widget: "text" },
    "character:mech.attacks.*.damageType": { widget: "suggest", options: ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "force", "psychic"] },
    "character:mech.attacks.*.dice": { widget: "text", placeholder: "1d8" },
    "character:mech.attacks.*.range": { widget: "text", placeholder: "80/320 ft" },
    "character:mech.attacks.*.properties": { widget: "tags", options: ["Finesse", "Light", "Heavy", "Two-Handed", "Versatile (1d10)", "Thrown (20/60)", "Ammunition", "Loading", "Reach"] },
    "character:mech.attacks.*.mastery": { widget: "suggest", options: ["Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex"] },
    "character:mech.attacks.*.note": { widget: "text" },
    "character:mech.attacks.*.option": { widget: "text" },
    "character:mech.features": {
      itemLabel: "feature",
      fields: ["name", "source", "uses", "text", "option"],
      newItem: () => ({ source: "class" }),
      summary: (item) => {
        const u = (item as { uses?: { max?: number; per?: string } })?.uses;
        return u?.max ? `${u.max} per ${u.per ?? "?"} rest` : null;
      },
    },
    "character:mech.features.*.name": { widget: "text" },
    "character:mech.features.*.option": { widget: "text" },
    "character:mech.equipment": { itemLabel: "item", fields: ["name", "qty", "equipped", "note", "option"] },
    "character:mech.equipment.*.name": { widget: "text" },
    "character:mech.equipment.*.note": { widget: "text" },
    "character:mech.equipment.*.option": { widget: "text" },
    "character:mech.spellcasting.spells": {
      itemLabel: "spell",
      fields: ["name", "level", "always", "note", "option"],
      newItem: () => ({ level: 0 }),
      summary: (item) => {
        const l = (item as { level?: number })?.level;
        return typeof l === "number" ? (l === 0 ? "cantrip" : `level ${l}`) : null;
      },
    },
    "character:mech.spellcasting.spells.*.name": { widget: "spell" },
    "character:mech.spellcasting.spells.*.note": { widget: "text" },
    "character:mech.spellcasting.spells.*.option": { widget: "text" },
    "character:mech.spellcasting.note": { widget: "text" },
  },
  newOneShot: (slug, title) => ({
    slug,
    title,
    system: "dnd5e",
    ruleset: "2024",
    level: 3,
    players: { min: 3, max: 5 },
    durationHrs: 4,
    tone: [],
    posting: {},
    coreRoles: [],
    letters: [],
    content: { sources: [], warnings: [] },
    skin: "noticeboard",
    variants: [],
  }),
  newCharacter: (doc, id, name) => {
    const level = typeof doc.oneshot.level === "number" ? doc.oneshot.level : 1;
    return {
      id,
      name,
      poster: { header: "WANTED", icon: "sword" },
      roles: [],
      story: { mannerisms: [], ties: [] },
      mech: {
        size: "Medium",
        classes: [{ name: "Fighter", level }],
        abilities: Object.fromEntries(ABILITIES.map((a) => [a, 10])),
        saves: [],
        skills: [],
        // A fighter's fixed-average HP with Con 10.
        hp: 10 + (level - 1) * 6,
        ac: { value: 10, note: "Unarmored" },
        speed: 30,
        languages: ["Common"],
        features: [],
        attacks: [],
        equipment: [],
        gold: 0,
      },
      options: [],
    };
  },
};
