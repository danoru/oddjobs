import { describe, expect, it } from "vitest";
import { loadOneShot } from "./content";
import { draftSchema, draftToContent, type Draft, type DraftRequest } from "./draft";
import type { OneShotWithCast } from "./schema";

/** The inverse of draftToContent, so a hand-written cast can stand in for Claude's output. */
function toDraft(os: OneShotWithCast): Draft {
  return {
    oneshot: {
      slug: os.slug,
      title: os.title,
      pitch: os.pitch,
      premise: os.premise,
      setting: os.setting,
      tone: os.tone,
      durationHrs: os.durationHrs,
      posting: os.posting,
      coreRoles: os.coreRoles,
      gmNotes: os.gmNotes ?? "",
      warnings: os.content.warnings,
      gazette: { name: os.gazette!.name, town: os.gazette!.town, price: os.gazette!.price },
      sounds: { beds: os.sounds!.beds, stingers: os.sounds!.stingers },
      letters: os.letters,
    },
    cast: os.cast.map((c) => {
      const m = c.mech;
      return {
        id: c.id,
        name: c.name,
        poster: { ...c.poster, alias: c.poster.alias ?? "", reward: c.poster.reward ?? "" },
        roles: c.roles,
        story: {
          ...c.story,
          age: c.story.age ?? "",
          trinket: c.story.trinket ?? "",
          intro: c.story.intro ?? "",
          ties: c.story.ties.map((t) => ({ ...t, public: t.public ?? "" })),
        },
        flashback: c.flashback ?? "",
        ifUnclaimed: c.ifUnclaimed ?? { npc: "", reassign: [], cuts: [] },
        mech: {
          species: m.species,
          lineage: m.lineage ?? "",
          size: m.size,
          background: m.background,
          classes: m.classes.map((k) => ({ name: k.name, subclass: k.subclass ?? "", level: k.level })),
          abilities: m.abilities as Draft["cast"][number]["mech"]["abilities"],
          saves: m.saves,
          skills: m.skills,
          expertise: m.expertise,
          jackOfAllTrades: m.jackOfAllTrades,
          hp: m.hp,
          ac: m.ac.value,
          acNote: m.ac.note,
          speed: m.speed,
          initiativeBonus: m.initiativeBonus,
          senses: m.senses,
          languages: m.languages,
          tools: m.tools,
          armorTraining: m.armorTraining,
          weaponTraining: m.weaponTraining,
          originFeat: m.originFeat ?? "",
          feats: m.feats,
          weaponMasteries: m.weaponMasteries,
          features: m.features.map((f) => ({ name: f.name, source: f.source, text: f.text, usesMax: f.uses?.max ?? 0, usesPer: f.uses?.per ?? "none" })),
          attacks: m.attacks.map((a) => ({
            name: a.name,
            kind: a.kind,
            ability: a.ability,
            save: a.save ?? "none",
            proficient: a.proficient,
            dice: a.dice,
            damageType: a.damageType,
            addMod: a.addMod,
            magicBonus: a.magicBonus,
            range: a.range ?? "",
            properties: a.properties,
            mastery: a.mastery ?? "",
            note: a.note ?? "",
          })),
          spellcastingAbility: m.spellcasting?.ability ?? "none",
          slots: m.spellcasting?.slots ?? [],
          pactSlots: m.spellcasting?.pact?.count ?? 0,
          pactLevel: m.spellcasting?.pact?.level ?? 0,
          spells: (m.spellcasting?.spells ?? []).map((sp) => ({ name: sp.name, level: sp.level, always: Boolean(sp.always), note: sp.note ?? "" })),
          spellNote: m.spellcasting?.note ?? "",
          equipment: m.equipment.map((e) => ({ name: e.name, qty: e.qty, equipped: Boolean(e.equipped), note: e.note ?? "" })),
          gold: m.gold,
        },
      };
    }),
  };
}

/** Drop undefined fields and customization-option tags, which drafts don't carry. */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === "option" ? undefined : x)));

const req = (os: OneShotWithCast): DraftRequest => ({
  pitch: os.pitch,
  ruleset: os.ruleset,
  level: os.level,
  players: os.players,
  castSize: os.cast.length,
  tone: os.tone.join(", "),
  setting: os.setting,
});

describe("draftToContent", () => {
  for (const slug of ["the-drowned-bell", "lot-thirteen", "the-cooling-concord"]) {
    it(`round-trips ${slug} with no errors`, () => {
      const os = loadOneShot(slug);
      const draft = draftSchema.parse(toDraft(os));
      const out = draftToContent(draft, req(os));
      expect(out.errors).toEqual([]);
      expect(out.cast.map((c) => c.id)).toEqual(os.cast.map((c) => c.id));
      // Mechanics survive the trip (customization options are dropped on purpose).
      for (const c of out.cast) {
        const orig = os.cast.find((x) => x.id === c.id)!;
        expect(plain(c.mech)).toEqual(plain(orig.mech));
        expect(plain(c.story)).toEqual(plain(orig.story));
      }
    });
  }

  it("reports problems the build would reject", () => {
    const os = loadOneShot("the-drowned-bell");
    const draft = toDraft(os);
    draft.cast[0].story.ties[0].to = "nobody";
    draft.cast[1].mech.classes[0].level = 4;
    const out = draftToContent(draftSchema.parse(draft), { ...req(os), castSize: 6 });
    expect(out.errors.join("\n")).toMatch(/tie to unknown character "nobody"/);
    expect(out.errors.join("\n")).toMatch(/level 4 but one-shot is level 5/);
    expect(out.errors.join("\n")).toMatch(/asked for 6 characters/);
  });
});
