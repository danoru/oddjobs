import { describe, expect, it } from "vitest";
import { SOUND_BEDS, SOUND_STINGERS } from "@/lib/schema";
import { BED_PRESETS, STINGER_PRESETS } from "./synth";

describe("sound presets", () => {
  it("implements every bed in the schema, and nothing else", () => {
    expect(Object.keys(BED_PRESETS).sort()).toEqual([...SOUND_BEDS].sort());
    for (const k of SOUND_BEDS) expect(typeof BED_PRESETS[k].play).toBe("function");
  });

  it("implements every stinger in the schema, and nothing else", () => {
    expect(Object.keys(STINGER_PRESETS).sort()).toEqual([...SOUND_STINGERS].sort());
    for (const k of SOUND_STINGERS) expect(typeof STINGER_PRESETS[k].play).toBe("function");
  });

  it("keeps reverb sends in range", () => {
    for (const p of [...Object.values(BED_PRESETS), ...Object.values(STINGER_PRESETS)]) {
      expect(p.wet).toBeGreaterThanOrEqual(0);
      expect(p.wet).toBeLessThanOrEqual(1);
    }
  });
});
