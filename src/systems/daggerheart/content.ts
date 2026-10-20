import type { Character, OneShot } from "./schema";
import { TRAITS } from "./schema";
import { expected } from "./derive";
import { CLASS_INFO, MAX_LOADOUT, STARTING_EXPERIENCES, TRAIT_SPREAD, cardInfo } from "./srd";

/**
 * Daggerheart checks Zod can't see, per character: the class's subclass and
 * domains, the level-1 trait spread and Experiences, Evasion, Hit Points,
 * Stress, Armor and thresholds against the rules (./derive.ts), domain cards
 * against the SRD table (./srd.ts) and the loadout's size, and what the hands
 * can hold. The shared checks (ties, ids, letters) are in src/lib/crossCheck.ts.
 *
 * Level-up choices (an extra Hit Point, a trait boost…) aren't modelled, so
 * above level 1 only what can't change is checked.
 */
export function crossCheck(os: Pick<OneShot, "level"> & { adversaries?: OneShot["adversaries"] }, cast: Character[]): string[] {
  const errs: string[] = [];
  for (const c of cast) errs.push(...checkCharacter(os, c).map((e) => `${c.id}: ${e}`));
  const ids = (os.adversaries ?? []).map((a) => a.id);
  if (new Set(ids).size !== ids.length) errs.push("duplicate adversary ids");
  for (const a of os.adversaries ?? [])
    if (a.thresholds && a.thresholds.severe <= a.thresholds.major) errs.push(`adversary "${a.id}": Severe threshold must be above Major`);
  return errs;
}

function checkCharacter(os: Pick<OneShot, "level">, c: Character): string[] {
  const errs: string[] = [];
  const m = c.mech;
  const k = CLASS_INFO[m.class];
  const first = m.level === 1;

  if (m.level !== os.level) errs.push(`level ${m.level} but the one-shot is level ${os.level}`);
  if (!(m.subclass in k.subclasses)) errs.push(`subclass "${m.subclass}" isn't a ${m.class} subclass (${Object.keys(k.subclasses).join(" or ")})`);

  // Traits: a new character spreads +2, +1, +1, +0, +0, −1.
  if (first) {
    const got = TRAITS.map((t) => m.traits[t]).sort((a, b) => b - a);
    const want = [...TRAIT_SPREAD].sort((a, b) => b - a);
    if (got.join() !== want.join()) errs.push(`traits should spread +2, +1, +1, +0, +0, −1 at level 1 (got ${got.map((n) => (n >= 0 ? `+${n}` : n)).join(", ")})`);
    if (m.proficiency !== 1) errs.push(`Proficiency is 1 at level 1 (got ${m.proficiency})`);
    if (m.experiences.length !== STARTING_EXPERIENCES.count || m.experiences.some((x) => x.bonus !== STARTING_EXPERIENCES.bonus))
      errs.push(`experiences: a level-1 character has ${STARTING_EXPERIENCES.count}, each +${STARTING_EXPERIENCES.bonus}`);
  }
  if (new Set(m.experiences.map((x) => x.name.toLowerCase())).size !== m.experiences.length) errs.push("experiences: two with the same name");

  // The numbers.
  const e = expected(m);
  if (first) {
    if (m.evasion !== e.evasion) errs.push(`Evasion ${m.evasion}, but ${m.class} ${k.evasion}${signedPart(m.armor?.evasionMod)}${signedPart(m.bonuses.evasion)} makes ${e.evasion}`);
    if (m.hp !== e.hp) errs.push(`HP ${m.hp}, but a ${m.class} starts with ${k.hp}${signedPart(m.bonuses.hp)} = ${e.hp}`);
    if (m.stress !== e.stress) errs.push(`Stress ${m.stress}, but everyone starts with 6${signedPart(m.bonuses.stress)} = ${e.stress}`);
  }
  if (m.armorScore !== e.armorScore) errs.push(`Armor Score ${m.armorScore}, but ${m.armor ? `${m.armor.name} gives ${m.armor.score}` : "no armor gives 0"}${signedPart(m.bonuses.armor)} = ${e.armorScore}`);
  if (m.thresholds.major !== e.thresholds.major || m.thresholds.severe !== e.thresholds.severe)
    errs.push(
      `thresholds ${m.thresholds.major}/${m.thresholds.severe}, but ${m.armor ? `${m.armor.name}'s ${m.armor.major}/${m.armor.severe} plus level ${m.level}` : `no armor at level ${m.level}`}${signedPart(m.bonuses.thresholds)} makes ${e.thresholds.major}/${e.thresholds.severe}`,
    );
  if (m.thresholds.severe <= m.thresholds.major) errs.push("thresholds: Severe must be above Major");

  // Domain cards: from the class's two domains, no higher than the level, a loadout of at most five.
  const names = m.domainCards.map((x) => x.name);
  if (new Set(names).size !== names.length) errs.push("domain cards: the same card twice");
  for (const ref of m.domainCards) {
    const info = cardInfo(ref.name);
    if (!info) errs.push(`domain card "${ref.name}" isn't in the SRD table (src/systems/daggerheart/srd.ts)`);
    else if (!k.domains.includes(info.domain)) errs.push(`domain card "${ref.name}" is ${info.domain}, not one of the ${m.class}'s domains (${k.domains.join(" and ")})`);
    else if (info.level > m.level) errs.push(`domain card "${ref.name}" is level ${info.level}, above the character's level ${m.level}`);
  }
  const want = m.level + 1 + (m.bonuses.cards ?? 0);
  if (first ? m.domainCards.length !== want : m.domainCards.length < want)
    errs.push(`domain cards: ${first ? "a level-1 character has" : `at level ${m.level} expect at least`} ${want} (got ${m.domainCards.length})`);
  const loadout = m.domainCards.filter((x) => x.where === "loadout").length;
  if (loadout > MAX_LOADOUT) errs.push(`loadout: at most ${MAX_LOADOUT} domain cards in play (got ${loadout}); put the rest in the vault`);

  // What the hands can hold.
  const primary = m.weapons.filter((x) => x.slot === "primary");
  const secondary = m.weapons.filter((x) => x.slot === "secondary");
  if (primary.length > 1) errs.push("weapons: one primary weapon at a time (carry spares in the inventory)");
  if (secondary.length > 1) errs.push("weapons: one secondary weapon at a time");
  if (secondary.length && primary.some((x) => x.burden === "two-handed")) errs.push("weapons: a two-handed primary leaves no hand for a secondary weapon");
  if (secondary.some((x) => x.burden === "two-handed")) errs.push("weapons: secondary weapons are one-handed");

  const hope = m.features.filter((f) => f.hope);
  if (hope.length > 1) errs.push("features: only one Hope feature");
  return errs;
}

const signedPart = (n?: number) => (n ? (n > 0 ? ` + ${n}` : ` − ${-n}`) : "");
