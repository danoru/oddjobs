/**
 * What a Daggerheart sheet rolls at the table: a duality roll for a trait or
 * a weapon's attack (the server rolls the Hope and Fear dice, see
 * ./live.ts), or plain damage dice (Proficiency × the weapon's die, plus its
 * bonus) through the log's ordinary roll.
 */
export type DhRoll =
  | { kind: "duality"; label: string; mod: number }
  | { kind: "damage"; label: string; count: number; sides: number; mod: number };

export const dualitySpec = (label: string, mod: number): DhRoll => ({ kind: "duality", label, mod });

export const damageSpec = (label: string, dice: { count: number; sides: number; mod: number }): DhRoll => ({ kind: "damage", label, ...dice });
