import { describe, expect, it } from "vitest";
import { arcLetters, ringLabel, tokenArt, tokenFileName, tokenGeometry } from "./token";

describe("token geometry", () => {
  it("fits a ring inside the canvas with the picture inside it", () => {
    const g = tokenGeometry(512);
    expect(g.c).toBe(256);
    expect(g.outer).toBeLessThan(256);
    expect(g.inner).toBeLessThan(g.outer);
    expect(g.text).toBeGreaterThan(g.inner);
    expect(g.text).toBeLessThan(g.outer);
    expect(g.fontPx).toBeLessThan(g.outer - g.inner);
  });
});

describe("lettering on the ring", () => {
  it("centres the word on the bottom, reading left to right", () => {
    const at = arcLetters([10, 10, 10], 100);
    expect(at[1].angle).toBeCloseTo(Math.PI / 2); // middle letter at the bottom
    expect(at[0].angle).toBeGreaterThan(at[1].angle); // first letter further round to the left
    expect(at[0].angle - at[1].angle).toBeCloseTo(at[1].angle - at[2].angle);
    expect(at[1].rotate).toBeCloseTo(0); // upright at the bottom
  });

  it("squeezes long names into the allowed arc", () => {
    const maxArc = Math.PI / 2;
    const at = arcLetters(Array(40).fill(20), 100, 0, maxArc);
    // Centres of the first and last letters sit inside the arc, symmetric about the bottom.
    expect(at[0].angle - at.at(-1)!.angle).toBeLessThan(maxArc);
    expect(at[0].angle - Math.PI / 2).toBeCloseTo(Math.PI / 2 - at.at(-1)!.angle);
  });

  it("shortens very long names", () => {
    expect(ringLabel("Rook")).toBe("ROOK");
    const long = ringLabel("Brother Anselm Pyke of the Undertakers' Guild");
    expect(long).toMatch(/…$/);
    expect(long.length).toBeLessThanOrEqual(22);
  });
});

describe("token art and file", () => {
  const poster = { header: "WANTED", epithet: "the Knife", hook: "x", icon: "dagger" } as const;
  it("prefers the portrait, falls back to the poster icon", () => {
    expect(tokenArt({ portrait: "data:image/png;base64,AAAA", poster })).toEqual({
      kind: "portrait",
      src: "data:image/png;base64,AAAA",
    });
    expect(tokenArt({ poster })).toEqual({ kind: "icon", icon: "dagger" });
  });
  it("names the download after the one-shot and character", () => {
    expect(tokenFileName("the-drowned-bell", { id: "rook" })).toBe("the-drowned-bell-rook-token.png");
  });
});
