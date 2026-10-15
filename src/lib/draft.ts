import { z } from "zod/v4";
import {
  ABILITIES,
  POSTER_HEADERS,
  POSTER_ICONS,
  SKILLS,
  SOUND_BEDS,
  SOUND_STINGERS,
  characterSchema,
  oneShotSchema,
  type Character,
  type OneShot,
} from "./schema";
import { crossCheck } from "./content";

/**
 * "A cast from your pitch": the shape Claude fills in, and how it becomes
 * real content. The generation schema is deliberately flat and fully
 * required (structured outputs want closed objects; "none" is "" or [] or 0),
 * then converted and run through the same Zod schema and crossCheck as
 * hand-written content, so a draft can never post something the build
 * wouldn't accept.
 */

const skill = z.enum(Object.keys(SKILLS) as [keyof typeof SKILLS, ...(keyof typeof SKILLS)[]]);
const ability = z.enum(ABILITIES);
const kebab = z.string().describe("lowercase-kebab-case id");

const draftCharacter = z.object({
  id: kebab,
  name: z.string(),
  poster: z.object({
    header: z.enum(POSTER_HEADERS),
    alias: z.string().describe('Shown instead of the name, e.g. "????" for a mystery role; "" for none'),
    epithet: z.string().describe('e.g. "the Knife"'),
    hook: z.string().describe("One line in notice-board voice, at most 90 characters"),
    reward: z.string().describe('"" for none'),
    icon: z.enum(POSTER_ICONS),
  }),
  roles: z.array(z.enum(["face", "healer", "scout", "striker", "tank", "control", "support", "utility"])),
  story: z.object({
    pronouns: z.string(),
    age: z.string(),
    appearance: z.string(),
    concept: z.string(),
    stake: z.string().describe("Why THIS adventure matters to them"),
    goal: z.string(),
    secret: z.string().describe("Private; a great reveal that doesn't force PvP"),
    voice: z.string(),
    mannerisms: z.array(z.string()),
    trinket: z.string(),
    intro: z.string().describe("A line the player reads aloud to introduce themselves"),
    ties: z.array(
      z.object({
        to: kebab,
        text: z.string().describe("Full tie, private to this player; may touch secrets"),
        public: z.string().describe("Board-safe version, at most 80 characters, reveals no secret"),
      }),
    ),
  }),
  flashback: z.string().describe("Session-zero question answerable in one sentence"),
  ifUnclaimed: z.object({
    npc: z.string(),
    reassign: z.array(z.object({ beat: z.string(), to: z.array(kebab), text: z.string() })),
    cuts: z.array(z.string()),
  }),
  mech: z.object({
    species: z.string(),
    lineage: z.string().describe('"" for none'),
    size: z.enum(["Small", "Medium"]),
    background: z.string(),
    classes: z.array(z.object({ name: z.string(), subclass: z.string(), level: z.number().int() })),
    abilities: z.object({ str: z.number().int(), dex: z.number().int(), con: z.number().int(), int: z.number().int(), wis: z.number().int(), cha: z.number().int() }),
    saves: z.array(ability),
    skills: z.array(skill),
    expertise: z.array(skill),
    jackOfAllTrades: z.boolean(),
    hp: z.number().int(),
    ac: z.number().int(),
    acNote: z.string(),
    speed: z.number().int(),
    initiativeBonus: z.number().int().describe("Extra beyond Dex (Alert, Jack of All Trades…); 0 if none"),
    senses: z.array(z.string()),
    languages: z.array(z.string()),
    tools: z.array(z.string()),
    armorTraining: z.array(z.string()),
    weaponTraining: z.array(z.string()),
    originFeat: z.string().describe('2024 only; "" for 2014'),
    feats: z.array(z.string()),
    weaponMasteries: z.array(z.string()).describe("2024 only; [] for 2014"),
    features: z.array(
      z.object({
        name: z.string(),
        source: z.enum(["class", "subclass", "species", "background", "feat", "item", "other"]),
        text: z.string().describe("Short paraphrase in your own words, never book text"),
        usesMax: z.number().int().describe("0 if unlimited"),
        usesPer: z.enum(["short", "long", "day", "turn", "none"]),
      }),
    ),
    attacks: z.array(
      z.object({
        name: z.string(),
        kind: z.enum(["weapon", "spell"]),
        ability,
        save: z.enum([...ABILITIES, "none"]),
        proficient: z.boolean(),
        dice: z.string().describe('e.g. "1d8" or "2d6"'),
        damageType: z.string(),
        addMod: z.boolean(),
        magicBonus: z.number().int(),
        range: z.string(),
        properties: z.array(z.string()),
        mastery: z.string(),
        note: z.string(),
      }),
    ),
    spellcastingAbility: z.enum([...ABILITIES, "none"]),
    slots: z.array(z.number().int()).describe("Index 0 = 1st level; [] for none or warlocks"),
    pactSlots: z.number().int().describe("Warlock pact slot count, 0 otherwise"),
    pactLevel: z.number().int(),
    spells: z.array(z.object({ name: z.string(), level: z.number().int(), always: z.boolean(), note: z.string() })),
    spellNote: z.string(),
    equipment: z.array(z.object({ name: z.string(), qty: z.number().int(), equipped: z.boolean(), note: z.string() })),
    gold: z.number().int(),
  }),
});

export const draftSchema = z.object({
  oneshot: z.object({
    slug: kebab,
    title: z.string(),
    pitch: z.string().describe("One or two sentences for the job posting"),
    premise: z.string().describe("Why exactly these people are together tonight"),
    setting: z.string(),
    tone: z.array(z.string()),
    durationHrs: z.number(),
    posting: z.object({ header: z.string(), reward: z.string() }),
    coreRoles: z.array(kebab),
    gmNotes: z.string().describe("3–4 act outline"),
    warnings: z.array(z.string()),
    gazette: z.object({ name: z.string(), town: z.string(), price: z.string() }),
    sounds: z.object({
      beds: z.array(z.object({ id: kebab, label: z.string(), preset: z.enum(SOUND_BEDS) })),
      stingers: z.array(z.object({ id: kebab, label: z.string(), preset: z.enum(SOUND_STINGERS) })),
    }),
    letters: z.array(z.object({ id: kebab, to: kebab, title: z.string(), when: z.string(), text: z.string() })),
  }),
  cast: z.array(draftCharacter),
});
export type Draft = z.infer<typeof draftSchema>;

export interface DraftRequest {
  pitch: string;
  ruleset: "2014" | "2024";
  level: number;
  players: { min: number; max: number };
  castSize: number;
  tone: string;
  setting: string;
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

/** Turn a draft into real content and check it the way the build does. */
export function draftToContent(d: Draft, req: DraftRequest): { oneshot: OneShot; cast: Character[]; errors: string[] } {
  const errors: string[] = [];
  const os = oneShotSchema.safeParse({
    slug: d.oneshot.slug,
    title: d.oneshot.title,
    pitch: d.oneshot.pitch,
    premise: d.oneshot.premise,
    ruleset: req.ruleset,
    system: "dnd5e",
    level: req.level,
    players: req.players,
    durationHrs: d.oneshot.durationHrs,
    tone: d.oneshot.tone,
    setting: d.oneshot.setting,
    posting: d.oneshot.posting,
    coreRoles: d.oneshot.coreRoles,
    gmNotes: opt(d.oneshot.gmNotes),
    gazette: d.oneshot.gazette,
    sounds: d.oneshot.sounds,
    letters: d.oneshot.letters,
    content: { sources: ["Drafted with Claude from a pitch; review before play"], warnings: d.oneshot.warnings },
  });
  if (!os.success) errors.push(...os.error.issues.map((i) => `oneshot.${i.path.join(".")}: ${i.message}`));

  const cast: Character[] = [];
  d.cast.forEach((c, n) => {
    const m = c.mech;
    const parsed = characterSchema.safeParse({
      id: c.id,
      name: c.name,
      order: n + 1,
      poster: { ...c.poster, alias: opt(c.poster.alias), reward: opt(c.poster.reward) },
      roles: c.roles,
      story: { ...c.story, age: opt(c.story.age), trinket: opt(c.story.trinket), intro: opt(c.story.intro), ties: c.story.ties.map((t) => ({ ...t, public: opt(t.public) })) },
      flashback: opt(c.flashback),
      ifUnclaimed: c.ifUnclaimed,
      options: [],
      mech: {
        species: m.species,
        lineage: opt(m.lineage),
        size: m.size,
        background: m.background,
        classes: m.classes.map((k) => ({ name: k.name, subclass: opt(k.subclass), level: k.level })),
        abilities: m.abilities,
        saves: m.saves,
        skills: m.skills,
        expertise: m.expertise,
        jackOfAllTrades: m.jackOfAllTrades,
        hp: m.hp,
        ac: { value: m.ac, note: m.acNote },
        speed: m.speed,
        initiativeBonus: m.initiativeBonus,
        senses: m.senses,
        languages: m.languages,
        tools: m.tools,
        armorTraining: m.armorTraining,
        weaponTraining: m.weaponTraining,
        originFeat: req.ruleset === "2024" ? opt(m.originFeat) : undefined,
        feats: m.feats,
        weaponMasteries: req.ruleset === "2024" ? m.weaponMasteries : [],
        features: m.features.map((f) => ({
          name: f.name,
          source: f.source,
          text: f.text,
          uses: f.usesMax > 0 && f.usesPer !== "none" ? { max: f.usesMax, per: f.usesPer } : undefined,
        })),
        attacks: m.attacks.map((a) => ({
          ...a,
          save: a.save === "none" ? undefined : a.save,
          range: opt(a.range),
          mastery: req.ruleset === "2024" ? opt(a.mastery) : undefined,
          note: opt(a.note),
        })),
        spellcasting:
          m.spellcastingAbility === "none"
            ? undefined
            : {
                ability: m.spellcastingAbility,
                slots: m.slots,
                pact: m.pactSlots > 0 ? { count: m.pactSlots, level: m.pactLevel } : undefined,
                spells: m.spells.map((sp) => ({ name: sp.name, level: sp.level, always: sp.always || undefined, note: opt(sp.note) })),
                note: opt(m.spellNote),
              },
        equipment: m.equipment.map((e) => ({ name: e.name, qty: Math.max(1, e.qty), equipped: e.equipped || undefined, note: opt(e.note) })),
        gold: m.gold,
      },
    });
    if (parsed.success) cast.push(parsed.data);
    else errors.push(...parsed.error.issues.map((i) => `${c.id || `cast[${n}]`}.${i.path.join(".")}: ${i.message}`));
  });

  if (os.success && cast.length === d.cast.length) errors.push(...crossCheck(os.data, cast));
  if (cast.length !== req.castSize) errors.push(`asked for ${req.castSize} characters, got ${d.cast.length}`);
  return { oneshot: os.success ? os.data : (d.oneshot as unknown as OneShot), cast, errors };
}
