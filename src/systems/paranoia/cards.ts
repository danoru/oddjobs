import type { Card, CardKind } from "@/systems/dnd5e/cards";
import { withFit } from "@/systems/dnd5e/cards";
import type { Character, Naughty } from "./schema";
import { STATS } from "./schema";
import { STAT_NAMES, cloneName, signed, stats } from "./derive";
import { CLEARANCE_INK, CLEARANCE_NAMES } from "./rules";

/**
 * Paranoia's cards for the 2.5 × 3.4 in card printer: a clone ID card in the
 * clearance's colour and the assigned gear, for everyone. With the naughty
 * side (only the GM-only box passes it), a secret society card, a mutant
 * power card, the secret objectives and the treasonous gear too.
 */

export const PA_KINDS: { kind: CardKind; label: string }[] = [
  { kind: "feature", label: "Clone ID" },
  { kind: "item", label: "Gear" },
  { kind: "spell", label: "Naughty side (GM's box only)" },
];

export function cardsFor(c: Pick<Character, "name" | "mech" | "story">, naughty: Naughty | null, kinds: readonly CardKind[] = ["feature", "item", "spell"]): Card[] {
  const m = c.mech;
  const owner = cloneName(m);
  const st = stats(m);
  const cards: Card[] = [];
  if (kinds.includes("feature"))
    cards.push(
      withFit({
        key: "clone-id",
        kind: "feature",
        title: cloneName(m),
        kicker: `${CLEARANCE_NAMES[m.clone.clearance]} clearance · ${m.serviceGroup}`,
        stats: [
          ...STATS.map((s) => ({ label: STAT_NAMES[s], value: String(st[s]) })),
          { label: "Duty", value: m.bonusDuty },
        ],
        text: `Citizen ${c.name} is a loyal Troubleshooter in good standing. Present this card on request. Failure to present this card is treason.`,
        boxes: { n: 6, label: "clones (tick each one used)" },
        owner: "Property of Friend Computer",
        accent: CLEARANCE_INK[m.clone.clearance].bg,
      }),
    );
  if (kinds.includes("item"))
    for (const g of m.gear)
      cards.push(
        withFit({
          key: `gear:${g.name}`,
          kind: "item",
          title: g.name,
          kicker: "Assigned gear · sign it out, sign it back in",
          stats: g.level ? [{ label: "Extra dice", value: signed(g.level) }] : [],
          text: g.note ?? "Issued by the Computer. Losing or damaging it is treason; using it wrongly is also treason.",
          owner,
        }),
      );
  if (naughty && kinds.includes("spell")) {
    cards.push(
      withFit({
        key: "society",
        kind: "spell",
        title: naughty.society,
        kicker: "Secret society · keep this hidden",
        stats: [],
        text: naughty.societyObjective ?? "Your society will be in touch.",
        more: naughty.favours.society.length ? `Favours: ${naughty.favours.society.join("; ")}` : undefined,
        owner,
        accent: "#3a2a2a",
      }),
      withFit({
        key: "mutation",
        kind: "spell",
        title: naughty.mutantPower.name,
        kicker: "Mutant power · unregistered mutation is treason",
        stats: [{ label: "Costs", value: "Moxie" }],
        text: naughty.mutantPower.text,
        owner,
        accent: "#3b2f86",
      }),
    );
    if (naughty.objectives.length)
      cards.push(
        withFit({ key: "objectives", kind: "spell", title: "Secret objectives", kicker: "For your eyes only", stats: [], text: naughty.objectives.map((o) => `☐ ${o}`).join(" "), owner, accent: "#8b1e1e" }),
      );
    for (const g of naughty.treasonousGear)
      cards.push(
        withFit({
          key: `treason:${g.name}`,
          kind: "spell",
          title: g.name,
          kicker: "Treasonous gear · do not use openly",
          stats: g.level ? [{ label: "Extra dice", value: signed(g.level) }] : [],
          text: g.note ?? "Where did you get this?",
          owner,
          accent: "#8b1e1e",
        }),
      );
  }
  return cards;
}
