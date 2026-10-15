import { describe, expect, it } from "vitest";
import { bearerToken, checkFoundryToken, safeEqual, shapeFoundryTable } from "./foundry-sync";

describe("bearerToken", () => {
  it("extracts the token", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer abc123")).toBe("abc123");
  });
  it("rejects anything else", () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("abc123")).toBeNull();
    expect(bearerToken("Basic abc123")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
    expect(bearerToken(["Bearer a"])).toBeNull();
  });
});

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret2")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("checkFoundryToken", () => {
  it("is unconfigured when the env var is unset or empty, even for an empty bearer", () => {
    expect(checkFoundryToken("Bearer x", undefined)).toBe("unconfigured");
    expect(checkFoundryToken("Bearer x", "")).toBe("unconfigured");
    expect(checkFoundryToken(undefined, "")).toBe("unconfigured");
  });
  it("accepts the right token and refuses the rest", () => {
    expect(checkFoundryToken("Bearer tok", "tok")).toBe("ok");
    expect(checkFoundryToken("Bearer nope", "tok")).toBe("unauthorized");
    expect(checkFoundryToken(undefined, "tok")).toBe("unauthorized");
    expect(checkFoundryToken("tok", "tok")).toBe("unauthorized");
  });
});

const character = (id: string, secret: string, alias?: string) => ({
  id,
  name: `Name ${id}`,
  poster: { header: "WANTED", epithet: `Epithet ${id}`, hook: `Hook ${id}`, icon: "sword", alias },
  story: { secret },
});

describe("shapeFoundryTable", () => {
  const oneshot = {
    title: "The Drowned Bell",
    cast: [character("rook", "RookSecret"), character("mist", "MistSecret", "????"), character("ash", "AshSecret")],
  } as unknown as Parameters<typeof shapeFoundryTable>[0];
  const state = {
    code: "ABC23",
    oneshot: "the-drowned-bell",
    claims: [
      { characterId: "rook", name: "Maya", mine: false, claimedAt: "2026-01-01T00:00:00.000Z" },
      { characterId: "rook", name: "Late", mine: false, claimedAt: "2026-01-01T00:00:01.000Z" },
    ],
  };

  it("includes the secret only for claimed characters", () => {
    const out = shapeFoundryTable(oneshot, state);
    expect(out.cast.find((c) => c.id === "rook")).toMatchObject({ claimedBy: "Maya", secret: "RookSecret" });
    for (const id of ["mist", "ash"]) {
      const c = out.cast.find((x) => x.id === id)!;
      expect(c.claimedBy).toBeNull();
      expect("secret" in c).toBe(false);
    }
    expect(JSON.stringify(out)).not.toContain("MistSecret");
    expect(JSON.stringify(out)).not.toContain("AshSecret");
  });

  it("shapes the header fields and keeps cast order", () => {
    const out = shapeFoundryTable(oneshot, state);
    expect(out).toMatchObject({ code: "ABC23", oneshot: "the-drowned-bell", title: "The Drowned Bell" });
    expect(out.cast.map((c) => c.id)).toEqual(["rook", "mist", "ash"]);
    expect(out.cast[1]).toMatchObject({ alias: "????", epithet: "Epithet mist", header: "WANTED", hook: "Hook mist", icon: "sword" });
    expect(out.cast[0].alias).toBeNull();
  });
});
