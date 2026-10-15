import { ABILITIES, type Character, type OneShot, type Skill } from "../schema";
import { classLine, derive, hitDieFor } from "../derive";

/**
 * Foundry VTT dnd5e actor export — BETA.
 *
 * Builds an Actor document for the sheet's right-click → "Import Data". This
 * "lite" version sets everything the sheet shows directly (abilities, save and
 * skill proficiencies, HP/AC overrides, slots) and embeds features, weapons
 * and spells as plain items with descriptions. It doesn't yet carry compendium
 * items with advancement data — that comes from tools/foundry/harvest-items.js
 * plus a reference export from the table's own Foundry install.
 *
 * Field names follow dnd5e 4.x/5.x. Where 4.x and 5.x differ (spell
 * preparation) both shapes are written; Foundry drops fields it doesn't know.
 */

export const FOUNDRY_EXPORT_VERSION = "lite-0.1";

const SKILL_KEYS: Record<Skill, string> = {
  acrobatics: "acr",
  animalHandling: "ani",
  arcana: "arc",
  athletics: "ath",
  deception: "dec",
  history: "his",
  insight: "ins",
  intimidation: "itm",
  investigation: "inv",
  medicine: "med",
  nature: "nat",
  perception: "prc",
  performance: "prf",
  persuasion: "per",
  religion: "rel",
  sleightOfHand: "slt",
  stealth: "ste",
  survival: "sur",
};

const SPELL_PROGRESSION: Record<string, string> = {
  bard: "full",
  cleric: "full",
  druid: "full",
  sorcerer: "full",
  wizard: "full",
  paladin: "half",
  ranger: "half",
  artificer: "artificer",
  warlock: "pact",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const p = (s: string) => `<p>${esc(s)}</p>`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Foundry document ids are 16 alphanumerics; derive them stably from content. */
function docId(seed: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  let out = "";
  for (let round = 0; out.length < 16; round++) {
    for (const ch of `${seed}#${round}`) {
      h1 = Math.imul(h1 ^ ch.charCodeAt(0), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ ch.charCodeAt(0), 0x5bd1e995) >>> 0;
    }
    out += chars[h1 % 62] + chars[h2 % 62] + chars[(h1 >>> 8) % 62] + chars[(h2 >>> 8) % 62];
  }
  return out.slice(0, 16);
}

const PROPERTY_CODES: Record<string, string> = {
  finesse: "fin",
  light: "lgt",
  heavy: "hvy",
  thrown: "thr",
  "two-handed": "two",
  versatile: "ver",
  reach: "rch",
  loading: "lod",
  ammunition: "amm",
};

export function foundryActor(c: Character, os: Pick<OneShot, "slug" | "title" | "ruleset">) {
  const d = derive(c);
  const m = c.mech;
  const items: Record<string, unknown>[] = [];
  const item = (type: string, name: string, system: Record<string, unknown>, img?: string) =>
    items.push({ _id: docId(`${c.id}/${type}/${name}/${items.length}`), name, type, img, system, flags: { tearoff: { generated: true } } });

  for (const k of m.classes) {
    const die = `d${hitDieFor(k)}`;
    const identifier = slug(k.name);
    item("class", k.name, {
      identifier,
      levels: k.level,
      hitDice: die,
      hd: { denomination: die, spent: 0 },
      spellcasting: SPELL_PROGRESSION[identifier]
        ? { progression: SPELL_PROGRESSION[identifier], ability: m.spellcasting?.ability ?? "" }
        : { progression: "none" },
      description: { value: p(`${k.name} ${k.level}${k.subclass ? ` (${k.subclass})` : ""}`) },
    });
    if (k.subclass) item("subclass", k.subclass, { identifier: slug(k.subclass), classIdentifier: identifier });
  }

  item("background", m.background, { description: { value: p(`${m.background} background.`) } });
  item("race", m.species, {
    description: { value: p(`${m.species}${m.lineage ? ` (${m.lineage})` : ""}`) },
  });

  const featNames = [...(m.originFeat ? [`${m.originFeat} (origin feat)`] : []), ...m.feats];
  for (const f of featNames) item("feat", f, { type: { value: "feat" }, description: { value: p(f) } });

  for (const f of m.features) {
    item("feat", f.name, {
      type: { value: f.source === "species" ? "race" : f.source === "background" ? "background" : f.source === "feat" ? "feat" : "class" },
      description: { value: p(f.text) },
      uses: f.uses
        ? { max: String(f.uses.max), spent: 0, value: f.uses.max, per: f.uses.per === "short" ? "sr" : f.uses.per === "long" ? "lr" : "day", recovery: [{ period: f.uses.per === "short" ? "sr" : f.uses.per === "long" ? "lr" : "day", type: "recoverAll" }] }
        : undefined,
    });
  }

  for (const a of m.attacks.filter((x) => x.kind === "weapon")) {
    const [num, den] = a.dice.split("d").map(Number);
    const line = d.attacks.find((x) => x.name === a.name);
    item("weapon", a.name, {
      description: { value: p(`${line?.toHit} to hit, ${line?.damage} ${a.damageType}. ${[a.range, ...a.properties, a.note].filter(Boolean).join(" · ")}`) },
      equipped: true,
      proficient: a.proficient ? 1 : 0,
      ability: a.ability,
      mastery: a.mastery ? slug(a.mastery) : undefined,
      magicalBonus: a.magicBonus || undefined,
      properties: a.properties.map((x) => PROPERTY_CODES[x.split(" ")[0].toLowerCase()]).filter(Boolean),
      damage: { base: { number: num, denomination: den, types: [a.damageType.toLowerCase()] } },
      range: a.range ? { value: parseInt(a.range) || undefined, units: "ft" } : undefined,
    });
  }

  for (const sp of m.spellcasting?.spells ?? []) {
    const atk = m.attacks.find((a) => a.kind === "spell" && a.name === sp.name);
    const line = atk && d.attacks.find((x) => x.name === sp.name);
    const pact = m.spellcasting?.pact && sp.level > 0 && !m.spellcasting.slots.length;
    item("spell", sp.name, {
      level: sp.level,
      description: { value: [line ? p(`${line.toHit}, ${line.damage} ${line.damageType}.`) : "", sp.note ? p(sp.note) : ""].join("") },
      // dnd5e 4.x
      preparation: { mode: pact ? "pact" : sp.always ? "always" : "prepared", prepared: true },
      // dnd5e 5.x
      method: pact ? "pact" : "spell",
      prepared: sp.always ? 2 : 1,
    });
  }

  for (const e of m.equipment) {
    if (m.attacks.some((a) => a.kind === "weapon" && a.name === e.name)) continue;
    item("loot", e.name, { quantity: e.qty, description: { value: e.note ? p(e.note) : "" } });
  }

  const spells: Record<string, unknown> = {};
  m.spellcasting?.slots.forEach((n, i) => (spells[`spell${i + 1}`] = { value: n, override: n }));
  if (m.spellcasting?.pact) spells.pact = { value: m.spellcasting.pact.count, override: m.spellcasting.pact.count };

  const darkvision = Number(m.senses.join(" ").match(/darkvision (\d+)/i)?.[1] ?? 0);
  const skillProf = (s: Skill) => (m.expertise.includes(s) ? 2 : m.skills.includes(s) ? 1 : m.jackOfAllTrades ? 0.5 : 0);

  const bio = [
    c.story.intro && `<blockquote>${esc(c.story.intro)}</blockquote>`,
    p(c.story.concept),
    `<p><strong>Tonight:</strong> ${esc(c.story.stake)}</p>`,
    `<p><strong>Wants:</strong> ${esc(c.story.goal)}</p>`,
    "<h3>Ties</h3>",
    ...c.story.ties.map((t) => `<p><strong>${esc(t.to)}:</strong> ${esc(t.text)}</p>`),
    `<h3>Secret</h3>${p(c.story.secret)}`,
    `<p><em>From the one-shot “${esc(os.title)}” on Tear-Off.</em></p>`,
  ]
    .filter(Boolean)
    .join("");

  return {
    name: c.name,
    type: "character",
    img: c.portrait ?? "icons/svg/mystery-man.svg",
    system: {
      abilities: Object.fromEntries(
        ABILITIES.map((a) => [a, { value: m.abilities[a], proficient: m.saves.includes(a) ? 1 : 0 }]),
      ),
      attributes: {
        hp: { value: m.hp, max: m.hp, temp: 0 },
        ac: { calc: "flat", flat: m.ac.value },
        init: { bonus: m.initiativeBonus ? String(m.initiativeBonus) : "" },
        movement: { walk: m.speed, units: "ft" },
        senses: { darkvision, units: "ft" },
        spellcasting: m.spellcasting?.ability ?? "",
      },
      details: {
        biography: { value: bio },
        appearance: c.story.appearance,
        trait: `${c.story.voice} ${c.story.mannerisms.join(". ")}.`,
        ideal: c.story.goal,
        bond: c.story.ties.map((t) => t.text).join(" "),
        flaw: "",
      },
      skills: Object.fromEntries(
        (Object.keys(SKILL_KEYS) as Skill[]).map((s) => [SKILL_KEYS[s], { value: skillProf(s) }]),
      ),
      traits: {
        size: m.size === "Small" ? "sm" : "med",
        languages: { value: [], custom: m.languages.join("; ") },
        weaponProf: { value: [], custom: m.weaponTraining.join("; ") },
        armorProf: { value: [], custom: m.armorTraining.join("; ") },
        toolProf: { value: [], custom: m.tools.join("; ") },
      },
      currency: { pp: 0, gp: m.gold, ep: 0, sp: 0, cp: 0 },
      spells,
    },
    items,
    prototypeToken: { name: c.name, actorLink: true, disposition: 1, sight: { enabled: true, range: darkvision } },
    flags: {
      tearoff: {
        oneshot: os.slug,
        character: c.id,
        ruleset: os.ruleset,
        classLine: classLine(c),
        exporter: FOUNDRY_EXPORT_VERSION,
      },
    },
    _stats: { systemId: "dnd5e" },
  };
}

export const foundryFilename = (c: Character) => `fvtt-Actor-${c.id}.json`;
