/** Spell-book names, checked the same in the browser and on the server (no Node imports here). */

export const SPELL_NAME_MAX = 60;

/** Why a spell name can't be used, or null. */
export function spellNameProblem(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "a spell needs a name";
  if (name !== name.trim()) return "no spaces at the start or end";
  if (name.length > SPELL_NAME_MAX) return `at most ${SPELL_NAME_MAX} characters`;
  if (/[\u0000-\u001f]/.test(name)) return "no control characters";
  return null;
}
