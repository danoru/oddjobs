import { describe, expect, it } from "vitest";
import { publishedOneShots } from "./source";
import { LANDING_SYSTEMS, toLanding } from "./landing";

/**
 * The public landing page shows posters from our own 5e and Ten Candles
 * casts, and nothing else. These run over every one-shot in content/.
 */

/** Every string under a key that must never be public (secrets, GM notes, letters, if-unclaimed, rumors, modules…). */
const PRIVATE_KEYS = new Set([
  "secret",
  "gmNotes",
  "letters",
  "ifUnclaimed",
  "rumors",
  "notices",
  "acts",
  "module",
  "suggestedTruths",
  "adversaries",
  "naughty",
  "briefing",
  "announcements",
  "flashback",
  "ties",
  "stake",
  "premise",
]);

function privateStrings(value: unknown, under = false, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (under && value.trim().length >= 12) out.push(value.trim());
  } else if (Array.isArray(value)) {
    for (const v of value) privateStrings(v, under, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) privateStrings(v, under || PRIVATE_KEYS.has(k), out);
  }
  return out;
}

const all = await publishedOneShots();

describe("the landing page's one-shots", () => {
  const landing = toLanding(all);
  const json = JSON.stringify(landing);

  it("has some posters to show", () => {
    expect(landing.length).toBeGreaterThan(0);
    expect(landing.every((j) => j.posters.length > 0)).toBe(true);
  });

  it("only comes from our own 5e and Ten Candles casts", () => {
    expect(landing.every((j) => LANDING_SYSTEMS.includes(j.system))).toBe(true);
    const licensed = all.filter((os) => os.system === "daggerheart" || os.system === "paranoia");
    expect(licensed.length).toBeGreaterThan(0);
    for (const os of licensed) {
      expect(json).not.toContain(os.title);
      for (const c of os.cast) expect(json).not.toContain(c.name);
    }
    expect(json).not.toMatch(/daggerheart|paranoia/i);
  });

  it("carries only the posting and poster fields, by name", () => {
    for (const j of landing) {
      expect(Object.keys(j).sort()).toEqual(["durationHrs", "pitch", "players", "posters", "postingHeader", "system", "title"]);
      for (const p of j.posters) expect(Object.keys(p).sort()).toEqual(["epithet", "header", "hook", "icon", "name"]);
    }
  });

  it("never carries a secret, a GM note, a letter or anything else private", () => {
    // Private text that only repeats something public (a letter that just names the job) doesn't count.
    const publicOf = (os: (typeof all)[number]) =>
      new Set([os.title, os.pitch, os.posting.header, ...os.cast.flatMap((c) => [c.name, c.poster.alias, c.poster.epithet, c.poster.hook])].filter(Boolean));
    const secrets = all.flatMap((os) => privateStrings(os).filter((s) => !publicOf(os).has(s)));
    expect(secrets.length).toBeGreaterThan(20);
    for (const s of secrets) expect(json, s.slice(0, 60)).not.toContain(s);
  });

  it("shows a mystery character by the board's alias, not their name", () => {
    const masked = all
      .filter((os) => LANDING_SYSTEMS.includes(os.system))
      .flatMap((os) => os.cast.map((c) => ({ name: c.name, alias: c.poster.alias })))
      .filter((c) => c.alias && c.alias !== c.name);
    for (const c of masked) expect(json).not.toContain(`"name":"${c.name}"`);
  });
});
