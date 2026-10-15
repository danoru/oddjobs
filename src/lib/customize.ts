import { z } from "zod";
import type { Character, CustomOption } from "./schema";

/** A woodcut portrait kept on this device: a small raster data URL. Never goes in share links. */
export const PORTRAIT_DATA_MAX = 250_000;
export const PORTRAIT_DATA_RE = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** A player's tweaks to a stock character. Lives in localStorage and share links. */
export const tweaksSchema = z.object({
  name: z.string().max(80).optional(),
  pronouns: z.string().max(40).optional(),
  appearance: z.string().max(600).optional(),
  portrait: z.string().url().max(500).regex(/^https?:\/\//, "http(s) only").optional(),
  portraitData: z
    .string()
    .max(PORTRAIT_DATA_MAX)
    .regex(PORTRAIT_DATA_RE, "png, webp or jpeg data URL only")
    .optional(),
  choices: z.record(z.string(), z.string()).default({}),
});
export type Tweaks = z.infer<typeof tweaksSchema>;

export const emptyTweaks = (): Tweaks => ({ choices: {} });

export const hasTweaks = (t: Tweaks) =>
  Boolean(t.name || t.pronouns || t.appearance || t.portrait || t.portraitData || Object.keys(t.choices).length);

/** The choice id that the stock character already uses for an option. */
export function defaultChoiceId(c: Character, opt: CustomOption): string {
  const current = currentValueName(c, opt);
  const hit = opt.choices.find((ch) =>
    opt.kind === "trinket" ? ch.value === current : (ch.value as { name: string }).name === current,
  );
  return hit?.id ?? opt.choices[0].id;
}

function currentValueName(c: Character, opt: CustomOption): string | undefined {
  const m = c.mech;
  switch (opt.kind) {
    case "spell":
      return m.spellcasting?.spells.find((s) => s.option === opt.id)?.name;
    case "attack":
      return m.attacks.find((a) => a.option === opt.id)?.name;
    case "equipment":
      return m.equipment.find((e) => e.option === opt.id)?.name;
    case "feature":
      return m.features.find((f) => f.option === opt.id)?.name;
    case "trinket":
      return c.story.trinket;
  }
}

/** Apply tweaks to a stock character, returning a new character. Unknown choices are ignored. */
export function applyTweaks(stock: Character, t: Tweaks): Character {
  const c: Character = structuredClone(stock);
  if (t.name) c.name = t.name;
  if (t.pronouns) c.story.pronouns = t.pronouns;
  if (t.appearance) c.story.appearance = t.appearance;
  // An uploaded woodcut wins over a linked image.
  if (t.portraitData) c.portrait = t.portraitData;
  else if (t.portrait) c.portrait = t.portrait;

  for (const opt of c.options) {
    const choiceId = t.choices[opt.id];
    if (!choiceId) continue;
    const swap = <T extends { option?: string }>(list: T[], value: Omit<T, "option"> | undefined) =>
      value ? list.map((e) => (e.option === opt.id ? ({ ...value, option: opt.id } as T) : e)) : list;
    switch (opt.kind) {
      case "spell": {
        const choice = opt.choices.find((ch) => ch.id === choiceId);
        if (!choice) break;
        if (c.mech.spellcasting) c.mech.spellcasting.spells = swap(c.mech.spellcasting.spells, choice.value);
        // A spell swap also swaps (or drops) the attack line it produced.
        const others = c.mech.attacks.filter((a) => a.option !== opt.id);
        const at = c.mech.attacks.findIndex((a) => a.option === opt.id);
        if (choice.attack) others.splice(at < 0 ? others.length : at, 0, { ...choice.attack, option: opt.id });
        c.mech.attacks = others;
        break;
      }
      case "attack": {
        const value = pick(opt.choices, choiceId);
        c.mech.attacks = swap(c.mech.attacks, value);
        // The weapon in the pack follows the weapon on the sheet.
        if (value)
          c.mech.equipment = c.mech.equipment.map((e) => (e.option === opt.id ? { ...e, name: value.name } : e));
        break;
      }
      case "equipment":
        c.mech.equipment = swap(c.mech.equipment, pick(opt.choices, choiceId));
        break;
      case "feature":
        c.mech.features = swap(c.mech.features, pick(opt.choices, choiceId));
        break;
      case "trinket":
        c.story.trinket = pick(opt.choices, choiceId) ?? c.story.trinket;
        break;
    }
  }
  return c;
}

const pick = <V>(choices: { id: string; value: V }[], choiceId: string): V | undefined =>
  choices.find((ch) => ch.id === choiceId)?.value;

// ---- Share links: tweaks <-> URL hash ----------------------------------------

/** portraitData is left out: it is far too big for a URL, so shared links carry the https portrait only. */
export function encodeTweaks(t: Tweaks): string {
  const shareable: Tweaks = { ...t };
  delete shareable.portraitData;
  const json = JSON.stringify(shareable);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeTweaks(s: string): Tweaks | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = tweaksSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
