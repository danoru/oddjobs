import { describe, expect, it } from "vitest";
import { claimBody, CODE_ALPHABET, CODE_LENGTH, makeTableCode, normalizeCode, playerIdSchema, playerNameSchema } from "./tables";

describe("table codes", () => {
  it("are five unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = makeTableCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("normalize what players type", () => {
    expect(normalizeCode(" ab-c2d ")).toBe("ABC2D");
    expect(normalizeCode("abc2")).toBeNull();
    expect(normalizeCode("ABC0D")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
});

describe("request bodies", () => {
  it("take a claim by character only: the name comes from the account or the guest pass", () => {
    expect(claimBody.safeParse({ characterId: "sister-vell", name: "Someone Else" }).data).toEqual({ characterId: "sister-vell" });
  });
  it("reject blank names and odd ids", () => {
    expect(playerNameSchema.safeParse("  ").success).toBe(false);
    expect(playerNameSchema.safeParse(" Ana ").data).toBe("Ana");
    expect(claimBody.safeParse({ characterId: "../etc" }).success).toBe(false);
    expect(playerIdSchema.safeParse("short").success).toBe(false);
  });
});
