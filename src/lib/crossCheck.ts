import type { CoreCharacter, OneShot } from "./schema";
import type * as dnd5e from "@/systems/dnd5e/schema";
import type * as tencandles from "@/systems/tencandles/schema";
import { crossCheck as crossCheck5e } from "@/systems/dnd5e/content";
import { crossCheck as crossCheckTc } from "@/systems/tencandles/content";

/**
 * Checks Zod alone can't see, for any system. Pure (no file I/O), so they run
 * the same on content loaded from disk (src/lib/content.ts) and on a draft
 * still being edited. 5e's spell-book and level-variant checks need the files
 * and stay in the loader.
 */

/** Character ids that would collide with pages under /<oneshot>/. */
export const RESERVED_IDS = ["print", "flyer", "gm", "tv", "epilogue", "sounds", "cards", "tents", "play", "kit"];

/** Problems every system shares that Zod alone can't see. Returns human-readable messages. */
export function coreCrossCheck(os: OneShot, cast: CoreCharacter[]): string[] {
  const errs: string[] = [];
  const ids = new Set(cast.map((c) => c.id));
  if (ids.size !== cast.length) errs.push("duplicate character ids");
  if (new Set(cast.map((c) => c.order)).size !== cast.length) errs.push("duplicate character order values");
  // Ten Candles characters are made at the table, so its pre-mades are optional.
  if (os.system === "dnd5e" && cast.length < os.players.min) errs.push(`only ${cast.length} characters for min ${os.players.min} players`);
  if (os.players.min > os.players.max) errs.push("players.min > players.max");

  for (const r of os.coreRoles) if (!ids.has(r)) errs.push(`coreRoles: no character "${r}"`);
  if (os.coreRoles.length > os.players.min) errs.push("more coreRoles than players.min");

  for (const c of cast) {
    const at = `${c.id}:`;
    if (RESERVED_IDS.includes(c.id)) errs.push(`${at} id clashes with the /${c.id} page`);
    for (const t of c.story.ties) {
      if (t.to === c.id) errs.push(`${at} tie to self`);
      else if (!ids.has(t.to)) errs.push(`${at} tie to unknown character "${t.to}"`);
    }
    for (const r of c.ifUnclaimed?.reassign ?? [])
      for (const to of r.to)
        if (to === c.id || !ids.has(to)) errs.push(`${at} ifUnclaimed beat "${r.beat}" reassigns to bad id "${to}"`);
  }

  const letterIds = new Set<string>();
  for (const l of os.letters) {
    if (!ids.has(l.to)) errs.push(`letter "${l.id}" is addressed to unknown character "${l.to}"`);
    if (letterIds.has(l.id)) errs.push(`duplicate letter id "${l.id}"`);
    letterIds.add(l.id);
  }
  const sounds = [...(os.sounds?.beds ?? []), ...(os.sounds?.stingers ?? [])];
  if (new Set(sounds.map((x) => x.id)).size !== sounds.length) errs.push("duplicate sound ids");
  return errs;
}

/** Every check for a one-shot and its cast: the shared ones, then the system's own. */
export function crossCheck(os: OneShot, cast: CoreCharacter[]): string[] {
  const errs = coreCrossCheck(os, cast);
  if (os.system === "dnd5e") errs.push(...crossCheck5e(os, cast as dnd5e.Character[]));
  else errs.push(...crossCheckTc(os, cast as tencandles.Character[]));
  return errs;
}

