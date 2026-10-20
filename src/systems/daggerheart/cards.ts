import type { Card, CardKind } from "@/systems/dnd5e/cards";
import { withFit } from "@/systems/dnd5e/cards";
import type { Character } from "./schema";
import { TRAIT_NAMES, derive, signed } from "./derive";
import { CLASS_INFO } from "./srd";
import { DOMAIN_INK } from "./ink";

/**
 * Daggerheart's cards for the 2.5 × 3.4 in card printer (the 5e card sheets,
 * src/systems/dnd5e/components/cards): every domain card in the loadout,
 * then the vault, each in its domain's ink with its level, type and Recall
 * cost; the weapons and armor; and the class, subclass, ancestry and
 * community features. Card text is our own paraphrase (./srd.ts).
 */

/** Which of the card printer's kinds a group belongs under (domain cards are "spell"). */
export const DH_KINDS: { kind: CardKind; label: string }[] = [
  { kind: "spell", label: "Domain cards" },
  { kind: "item", label: "Weapons & armor" },
  { kind: "feature", label: "Features" },
];

const SOURCE: Record<string, string> = {
  class: "Class feature",
  subclass: "Subclass feature",
  ancestry: "Ancestry",
  community: "Community",
  item: "Item",
  other: "Feature",
};

export function cardsFor(c: Character, kinds: readonly CardKind[] = ["spell", "item", "feature"]): Card[] {
  const m = c.mech;
  const x = derive(c);
  const owner = c.name;
  const cards: Card[] = [];

  if (kinds.includes("spell"))
    for (const [where, list] of [
      ["Loadout", x.loadout],
      ["Vault", x.vault],
    ] as const)
      for (const card of list)
        cards.push(
          withFit({
            key: `domain:${card.name}`,
            kind: "spell",
            title: card.name,
            kicker: `${card.domain} · level ${card.level} ${card.type}`,
            stats: [
              { label: "Recall", value: String(card.recall) },
              { label: "In", value: where },
              ...(card.type !== "ability" && x.spellcast ? [{ label: "Spellcast", value: `${TRAIT_NAMES[x.spellcast]} ${signed(m.traits[x.spellcast])}` }] : []),
            ],
            text: card.gist,
            more: card.note,
            owner: `${owner} · ${card.domain}`,
            accent: DOMAIN_INK[card.domain],
          }),
        );

  if (kinds.includes("item")) {
    for (const w of x.weapons)
      cards.push(
        withFit({
          key: `weapon:${w.name}`,
          kind: "item",
          title: w.name,
          kicker: `${w.slot === "primary" ? "Primary" : "Secondary"} weapon · ${w.burden}`,
          stats: [
            { label: "Attack", value: `${TRAIT_NAMES[w.trait]} ${signed(w.attack)}` },
            { label: "Damage", value: `${w.damage} ${w.damageType === "magic" ? "mag" : "phy"}` },
            { label: "Range", value: w.range },
          ],
          text: w.feature ?? "Roll the duality dice with your trait to hit; on a hit, roll your Proficiency in damage dice.",
          owner,
        }),
      );
    if (m.armor)
      cards.push(
        withFit({
          key: `armor:${m.armor.name}`,
          kind: "item",
          title: m.armor.name,
          kicker: "Armor, worn",
          stats: [
            { label: "Armor", value: String(m.armorScore) },
            { label: "Thresholds", value: `${m.thresholds.major} / ${m.thresholds.severe}` },
          ],
          text: `${m.armor.feature ? `${m.armor.feature} ` : ""}When you're hit, mark an Armor Slot to drop the damage one threshold.`,
          boxes: m.armorScore > 0 && m.armorScore <= 12 ? { n: m.armorScore, label: "Armor Slots" } : undefined,
          owner,
        }),
      );
  }

  if (kinds.includes("feature")) {
    const hope = m.features.some((f) => f.hope) ? null : CLASS_INFO[m.class].hopeFeature;
    if (hope)
      cards.push(withFit({ key: "feature:hope", kind: "feature", title: hope.name, kicker: `${m.class} Hope feature · 3 Hope`, stats: [], text: hope.gist, owner }));
    for (const f of m.features)
      cards.push(
        withFit({
          key: `feature:${f.name}`,
          kind: "feature",
          title: f.name,
          kicker: f.hope ? `${m.class} Hope feature · 3 Hope` : SOURCE[f.source],
          stats: [],
          text: f.text,
          boxes: f.uses ? { n: f.uses.max, label: `per ${f.uses.per}` } : undefined,
          owner,
        }),
      );
  }
  return cards;
}
