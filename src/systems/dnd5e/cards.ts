import type { Character, Feature, Ruleset, SpellInfo } from "@/systems/dnd5e/schema";
import { derive, ordinal, signed, type AttackLine } from "./derive";

/**
 * Card printables: one card per spell, per item worth holding and per
 * feature, laid out nine to a page (src/components/cards). Spell text comes
 * from content/rules/spells.json; everything else is already on the sheet.
 */

/** A spell's card text under one ruleset (the edition blocks folded in). */
export type ResolvedSpell = Omit<SpellInfo, "2014" | "2024">;

export function resolveSpell(info: SpellInfo, ruleset: Ruleset): ResolvedSpell {
  const { "2014": y2014, "2024": y2024, ...base } = info;
  return { ...base, ...(ruleset === "2014" ? y2014 : y2024) };
}

export type CardKind = "spell" | "item" | "feature";

export interface Card {
  key: string;
  kind: CardKind;
  title: string;
  /** "2nd-level evocation", "Weapon · Finesse, Light", "Class feature". */
  kicker: string;
  /** Little labelled boxes under the title. */
  stats: { label: string; value: string }[];
  text: string;
  /** Upcasting, mastery, notes: a second, smaller paragraph. */
  more?: string;
  /** Tick-boxes for uses or ammunition. */
  boxes?: { n: number; label: string };
  /** For the footer: whose card it is. */
  owner: string;
  /** Size step so long text still fits a 2.5 × 3.4 in card. */
  fit: "roomy" | "snug" | "tight";
}

/** Paraphrased weapon properties (2014 and 2024 agree closely enough for a card). */
const PROPERTIES: Record<string, string> = {
  ammunition: "Needs ammunition; recover half of it after the fight.",
  finesse: "Use Strength or Dexterity for attack and damage.",
  heavy: "Small creatures have a harder time with it.",
  light: "Pairs with another Light weapon for an extra off-hand attack.",
  loading: "Only one shot per action, however many attacks you have.",
  reach: "Reaches 5 ft further than usual.",
  thrown: "Throw it for a ranged attack with the same ability.",
  "two-handed": "Needs both hands to attack.",
  versatile: "More damage when swung in two hands.",
};

/** 2024 weapon masteries, paraphrased. */
const MASTERIES: Record<string, string> = {
  cleave: "Hit a second creature next to the first (once a turn), for weapon damage without your modifier.",
  graze: "On a miss, still deal damage equal to your ability modifier.",
  nick: "The extra Light-weapon attack is part of the Attack action, not a Bonus Action.",
  push: "On a hit, push a Large or smaller target up to 10 ft away.",
  sap: "On a hit, the target has Disadvantage on its next attack roll.",
  slow: "On a hit that deals damage, the target's Speed drops by 10 ft until your next turn.",
  topple: "On a hit, the target makes a Con save or falls Prone.",
  vex: "On a hit that deals damage, you have Advantage on your next attack against it.",
};

const SOURCE: Record<Feature["source"], string> = {
  class: "Class feature",
  subclass: "Subclass feature",
  species: "Species trait",
  background: "Background",
  feat: "Feat",
  item: "Item",
  other: "Feature",
};

const PER: Record<string, string> = { short: "short rest", long: "long rest", day: "day", turn: "turn" };

/** Text length that still fits each size step. Checked against the printed cards by scripts/print-check.mts. */
export function fitFor(chars: number): Card["fit"] {
  return chars <= 300 ? "roomy" : chars <= 430 ? "snug" : "tight";
}

const textLength = (c: Pick<Card, "text" | "more" | "stats">) =>
  c.text.length + (c.more?.length ?? 0) + c.stats.reduce((n, s) => n + s.value.length + 10, 0);

const withFit = (c: Omit<Card, "fit">): Card => ({ ...c, fit: fitFor(textLength(c)) });

export function spellKicker(sp: Pick<ResolvedSpell, "level" | "school" | "ritual" | "concentration">): string {
  const school = sp.school[0].toUpperCase() + sp.school.slice(1);
  const base = sp.level === 0 ? `${school} cantrip` : `${ordinal(sp.level)}-level ${sp.school}`;
  return [base, sp.ritual && "ritual", sp.concentration && "concentration"].filter(Boolean).join(" · ");
}

function attackStats(a: AttackLine): { label: string; value: string }[] {
  return [
    { label: a.toHit.startsWith("DC") ? "Save" : "To hit", value: a.toHit },
    { label: "Damage", value: `${a.damage} ${a.damageType}` },
    ...(a.range ? [{ label: "Range", value: a.range }] : []),
  ];
}

/** Explain each property and the mastery in a sentence. */
export function weaponNotes(a: Pick<AttackLine, "properties" | "mastery">): string[] {
  const notes: string[] = [];
  for (const p of a.properties) {
    const key = p.toLowerCase().split(/[\s(]/)[0];
    const extra = p.match(/\(([^)]+)\)/)?.[1];
    if (PROPERTIES[key]) notes.push(`${p.replace(/\s*\(.*\)/, "")}: ${PROPERTIES[key]}${extra && key === "versatile" ? ` (${extra})` : ""}`);
  }
  const m = a.mastery?.toLowerCase();
  if (m && MASTERIES[m]) notes.push(`Mastery, ${a.mastery}: ${MASTERIES[m]}`);
  return notes;
}

/** Notes are written as fragments; on a card they run on, so each ends like a sentence. */
const sentence = (x: string) => (/[.!?)]$/.test(x.trim()) ? x.trim() : `${x.trim()}.`);

/** Things that don't need a card: they're on the sheet already and nobody hands them round. */
const BORING = /\b(pack|clothes|pouch|backpack|bedroll|rations|waterskin|tinderbox|torch(es)?)\b/i;

/**
 * Every card for one character, in hand order: spells by level, then items,
 * then features. Spells missing from the book get a plain card that says so
 * (the validator stops that reaching a build).
 */
export function cardsFor(
  c: Character,
  ruleset: Ruleset,
  book: Record<string, SpellInfo>,
  kinds: readonly CardKind[] = ["spell", "item", "feature"],
): Card[] {
  const d = derive(c);
  const m = c.mech;
  const owner = c.name;
  const cards: Card[] = [];
  const attacks = new Map(d.attacks.map((a) => [a.name, a]));
  // "Warhammer (Matins)" on the sheet is the "Warhammer" in the pack.
  const plain = (n: string) => n.replace(/\s*\(.*\)\s*$/, "").toLowerCase();
  const armed = new Set(d.attacks.map((a) => plain(a.name)));

  if (kinds.includes("spell") && m.spellcasting && d.spell) {
    const spells = [...m.spellcasting.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    for (const sp of spells) {
      const info = book[sp.name] ? resolveSpell(book[sp.name], ruleset) : null;
      const atk = attacks.get(sp.name);
      const stats = info
        ? [
            { label: "Cast", value: info.time },
            { label: "Range", value: info.range },
            { label: "Lasts", value: info.duration },
            { label: "Needs", value: info.components },
          ]
        : [];
      const line = atk
        ? `${atk.toHit.startsWith("DC") ? atk.toHit : `${atk.toHit} to hit`} · ${atk.damage} ${atk.damageType}`
        : null;
      cards.push(
        withFit({
          key: `spell:${sp.name}`,
          kind: "spell",
          title: sp.name,
          kicker: info ? spellKicker(info) : sp.level === 0 ? "Cantrip" : `${ordinal(sp.level)}-level spell`,
          stats,
          text: info?.text ?? "See the rules for this spell.",
          more:
            [
              line && `Yours: ${line}.`,
              sp.always && "Always prepared.",
              sp.note,
              info?.higher,
            ]
              .filter((x): x is string => Boolean(x))
              .map(sentence)
              .join(" ") || undefined,
          owner: `${owner} · DC ${d.spell.dc} · ${signed(d.spell.attack)}`,
        }),
      );
    }
  }

  if (kinds.includes("item")) {
    const spellNames = new Set(m.spellcasting?.spells.map((s) => s.name) ?? []);
    const weapons = d.attacks.filter((a) => a.kind === "weapon" || !spellNames.has(a.name));
    for (const a of weapons) {
      const kit = m.equipment.find((e) => plain(e.name) === plain(a.name));
      cards.push(
        withFit({
          key: `item:${a.name}`,
          kind: "item",
          title: a.name,
          kicker: a.kind === "weapon" ? "Weapon" : "Attack",
          stats: attackStats(a),
          text: weaponNotes(a).join(" ") || a.note || "A trusty weapon.",
          more: [weaponNotes(a).length ? a.note : undefined, kit?.note].filter(Boolean).join(" ") || undefined,
          boxes: kit && kit.qty > 1 && kit.qty <= 20 ? { n: kit.qty, label: "carried" } : undefined,
          owner,
        }),
      );
    }
    for (const e of m.equipment) {
      if (armed.has(plain(e.name)) || (BORING.test(e.name) && !e.note)) continue;
      const shield = /shield/i.test(e.name);
      const armor = e.equipped && !shield && /armou?r|mail|leather|plate|hide/i.test(e.name);
      const ammo = e.qty > 1 && e.qty <= 20;
      cards.push(
        withFit({
          key: `item:${e.name}:${e.note ?? ""}`,
          kind: "item",
          title: e.qty > 1 && !ammo ? `${e.qty} × ${e.name}` : e.name,
          kicker: armor ? "Armour, worn" : shield ? "Shield · +2 AC" : e.equipped ? "Equipment · in hand" : "Equipment",
          stats: armor ? [{ label: "Your AC", value: `${m.ac.value} (${m.ac.note})` }] : [],
          text: e.note ?? (armor ? m.ac.note : "Part of your kit."),
          boxes: ammo ? { n: e.qty, label: "left" } : undefined,
          owner,
        }),
      );
    }
    if (c.story.trinket)
      cards.push(
        withFit({ key: "item:trinket", kind: "item", title: "Trinket", kicker: "Keepsake", stats: [], text: c.story.trinket, owner }),
      );
  }

  if (kinds.includes("feature")) {
    for (const f of m.features)
      cards.push(
        withFit({
          key: `feature:${f.name}`,
          kind: "feature",
          title: f.name,
          kicker: SOURCE[f.source],
          stats: [],
          text: f.text,
          boxes: f.uses ? { n: f.uses.max, label: `per ${PER[f.uses.per]}` } : undefined,
          owner,
        }),
      );
  }
  return cards;
}

/** Split into pages of `per` (nine cards, three by three). */
export function paginate<T>(items: T[], per = 9): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  return pages;
}

/** The spells a cast uses at any of its levels — what a cards page needs from the book. */
export function spellNames(casts: Pick<Character, "mech" | "options">[][]): string[] {
  const names = new Set<string>();
  for (const cast of casts)
    for (const c of cast) {
      for (const s of c.mech.spellcasting?.spells ?? []) names.add(s.name);
      for (const o of c.options) if (o.kind === "spell") for (const ch of o.choices) names.add(ch.value.name);
    }
  return [...names].sort();
}
