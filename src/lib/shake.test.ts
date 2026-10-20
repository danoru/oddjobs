import { describe, expect, it } from "vitest";
import { shakeDetector } from "./shake";
import { attackRolls, parseDamage, sheetRolls } from "@/systems/dnd5e/rolls";
import { load5e } from "./content";

describe("shake to roll", () => {
  it("fires on a few sharp jolts close together, once, then stays quiet", () => {
    const shake = shakeDetector();
    const at = (t: number, x: number) => shake({ x, y: 0, z: 9.8, t });
    expect(at(0, 0)).toBe(false);
    expect(at(100, 20)).toBe(false); // one jolt
    expect(at(200, -2)).toBe(false); // two
    expect(at(300, 20)).toBe(true); // three: a shake
    expect(at(400, -2)).toBe(false); // still shaking: no second roll
    expect(at(500, 20)).toBe(false);
    expect(at(2400, 0)).toBe(false);
  });

  it("ignores walking about and setting the phone down", () => {
    const shake = shakeDetector();
    let fired = false;
    for (let t = 0; t < 5000; t += 50) fired ||= shake({ x: Math.sin(t / 300) * 3, y: Math.cos(t / 400) * 2, z: 9.8, t });
    fired ||= shake({ x: 0, y: 0, z: 25, t: 6000 }); // one thump
    expect(fired).toBe(false);
  });
});

describe("5e rolls from the sheet", () => {
  it("parses simple damage dice", () => {
    expect(parseDamage("1d8 + 3")).toEqual({ count: 1, sides: 8, mod: 3 });
    expect(parseDamage("2d6")).toEqual({ count: 2, sides: 6, mod: 0 });
    expect(parseDamage("1d10 − 1")).toEqual({ count: 1, sides: 10, mod: -1 });
    expect(parseDamage("1d8 + 1d6")).toBeNull();
  });

  it("offers every check, save, skill and attack with the sheet's own modifier", () => {
    const os = load5e("the-drowned-bell");
    const rook = os.cast.find((c) => c.id === "rook")!;
    const groups = sheetRolls(rook);
    expect(groups.map((g) => g.group)).toEqual(["Checks", "Saves", "Skills", "Attacks"]);
    expect(groups[2].rolls).toHaveLength(18);
    for (const r of groups.flatMap((g) => g.rolls)) expect(Number.isInteger(r.mod)).toBe(true);
    const first = rook.mech.attacks[0];
    const { hit } = attackRolls(rook, first.name);
    if (hit) expect(hit).toMatchObject({ sides: 20, count: 1, d20: true });
  });
});
