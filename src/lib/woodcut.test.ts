import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  DEFAULT_OPTIONS,
  INK,
  PARCHMENT,
  applyFrame,
  autoLevels,
  boxBlur,
  cropSquare,
  edgeMask,
  hatchAt,
  hatchMask,
  sobel,
  toGray,
  toneMap,
  woodcutPixels,
} from "./woodcut";

/** A deterministic fake portrait: shaded head and shoulders on a gradient, plus a little noise. */
function fakePortrait(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2);
      const ny = (y - h * 0.38) / (h * 0.3);
      let v = 200 - 90 * (x / w) - 30 * (y / h); // backdrop
      const head = nx * nx * 1.8 + ny * ny;
      if (head < 1) v = 235 - 120 * Math.max(0, nx + 0.2) - 50 * head; // lit from the left
      if (ny < -0.55 && head < 1.35) v = 45 + 25 * rand(); // hair
      if (Math.abs(nx + 0.3) < 0.18 && Math.abs(ny + 0.05) < 0.07) v = 40; // eye
      if (Math.abs(nx - 0.3) < 0.18 && Math.abs(ny + 0.05) < 0.07) v = 40; // eye
      if (Math.abs(nx) < 0.3 && Math.abs(ny - 0.5) < 0.05) v = 70; // mouth
      if (y > h * 0.7 && Math.abs(x - w / 2) < w * (0.2 + (y - h * 0.7) / h)) v = 85; // shoulders
      v += 14 * rand();
      const p = (y * w + x) * 4;
      px[p] = v * 1.05;
      px[p + 1] = v;
      px[p + 2] = v * 0.9;
      px[p + 3] = 255;
    }
  }
  return px;
}

describe("cropSquare", () => {
  it("is the largest square, centered on the short axis", () => {
    expect(cropSquare(400, 200)).toEqual({ x: 100, y: 0, size: 200 });
    expect(cropSquare(200, 200)).toEqual({ x: 0, y: 0, size: 200 });
  });
  it("biases toward the top of a tall image", () => {
    expect(cropSquare(200, 600, 0.5).y).toBe(200);
    expect(cropSquare(200, 600, 0.25).y).toBe(100);
    expect(cropSquare(200, 600, 0).y).toBe(0);
    expect(cropSquare(200, 600, 9).y).toBe(400);
  });
});

describe("tones", () => {
  it("greyscale ignores transparent pixels", () => {
    const g = toGray(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]), 3, 1);
    expect(g[0]).toBe(0);
    expect(g[1]).toBeGreaterThan(200); // transparent -> parchment
    expect(g[2]).toBe(255);
  });

  it("stretches levels to the full range and leaves flat images flat", () => {
    const g = new Uint8ClampedArray(1000);
    for (let i = 0; i < g.length; i++) g[i] = 100 + Math.floor((i / g.length) * 40);
    const out = autoLevels(g);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
    const flat = autoLevels(new Uint8ClampedArray(100).fill(128));
    expect(new Set(flat).size).toBe(1);
  });

  it("maps brightness to tones monotonically, 0 darkest", () => {
    const ramp = new Uint8ClampedArray(256).map((_, i) => i);
    const tones = toneMap(ramp, 4);
    expect(tones[0]).toBe(0);
    expect(tones[255]).toBe(3);
    expect(new Set(tones).size).toBe(4);
    for (let i = 1; i < 256; i++) expect(tones[i]).toBeGreaterThanOrEqual(tones[i - 1]);
  });

  it("blur preserves a flat field and softens a step", () => {
    const flat = new Uint8ClampedArray(25).fill(90);
    expect(new Set(boxBlur(flat, 5, 5, 2))).toEqual(new Set([90]));
    const step = new Uint8ClampedArray([0, 0, 0, 255, 255, 255]);
    const blurred = boxBlur(step, 6, 1, 1);
    expect(blurred[2]).toBeGreaterThan(0);
    expect(blurred[3]).toBeLessThan(255);
  });
});

describe("hatching", () => {
  const P = DEFAULT_OPTIONS.period;
  const grid = (tone: number) => {
    const set = new Set<number>();
    for (let y = 0; y < P * 2; y++) for (let x = 0; x < P * 2; x++) if (hatchAt(tone, x, y)) set.add(y * 100 + x);
    return set;
  };

  it("the lightest tone gets no ink", () => {
    expect(grid(3).size).toBe(0);
  });

  it("is monotonic: each darker tone's ink contains every lighter tone's ink, and adds some", () => {
    for (let tone = 1; tone >= 0; tone--) {
      const darker = grid(tone);
      const lighter = grid(tone + 1);
      for (const k of lighter) expect(darker.has(k)).toBe(true);
      expect(darker.size).toBeGreaterThan(lighter.size);
    }
  });

  it("covers more of the page as tones darken", () => {
    const w = 60;
    const coverage = (tone: number) => {
      const m = hatchMask(new Uint8Array(w * w).fill(tone), w, w);
      return m.reduce((a, b) => a + b, 0) / m.length;
    };
    const [c0, c1, c2, c3] = [0, 1, 2, 3].map(coverage);
    expect(c3).toBe(0);
    expect(c2).toBeGreaterThan(0);
    expect(c1).toBeGreaterThan(c2);
    expect(c0).toBeGreaterThan(c1);
    expect(c0).toBeLessThan(1); // still lines, never a solid slab
  });

  it("runs at 45 degrees: ink is constant along x + y", () => {
    for (let s = 0; s < 40; s++) {
      const first = hatchAt(2, s, 0);
      for (let x = 0; x <= s; x++) expect(hatchAt(2, x, s - x)).toBe(first);
    }
  });

  it("the darkest tone cross-hatches the other way", () => {
    // A pixel that is off the 45 degree lines but on the 135 degree ones.
    let found = false;
    for (let x = 0; x < P && !found; x++) {
      const y = 0;
      if (!hatchAt(1, x, y) && hatchAt(0, x, y)) found = true;
    }
    expect(found).toBe(true);
  });
});

describe("edges", () => {
  it("finds the boundary of a square and nothing in flat areas", () => {
    const w = 40;
    const g = new Uint8ClampedArray(w * w).fill(230);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) g[y * w + x] = 20;
    const mask = edgeMask(sobel(g, w, w), 0.2, 90);
    expect(mask[20 * w + 20]).toBe(0); // inside
    expect(mask[2 * w + 2]).toBe(0); // outside
    expect(mask[20 * w + 10] || mask[20 * w + 9]).toBe(1); // on the edge
    const none = edgeMask(sobel(new Uint8ClampedArray(w * w).fill(128), w, w), 0.5, 90);
    expect(none.every((v) => v === 0)).toBe(true);
  });
});

describe("woodcutPixels", () => {
  const w = 320;
  const src = fakePortrait(w, w);
  const out = woodcutPixels(src, w, w);

  it("keeps its dimensions", () => {
    expect(out.length).toBe(w * w * 4);
  });

  it("only uses the ink and parchment colours, fully opaque", () => {
    const seen = new Set<string>();
    for (let p = 0; p < out.length; p += 4) {
      seen.add(`${out[p]},${out[p + 1]},${out[p + 2]},${out[p + 3]}`);
    }
    expect(seen).toEqual(new Set([`${INK.join(",")},255`, `${PARCHMENT.join(",")},255`]));
  });

  it("is a real engraving: both colours in healthy amounts", () => {
    let ink = 0;
    for (let p = 0; p < out.length; p += 4) if (out[p] === INK[0]) ink++;
    const share = ink / (w * w);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.7);
  });

  it("is deterministic", () => {
    expect(Buffer.from(woodcutPixels(src, w, w)).equals(Buffer.from(out))).toBe(true);
  });

  it("puts more ink where the picture is darker", () => {
    const px = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < w * w; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      // Left half dark grey, right half light grey; a black and a white strip pin the levels.
      const g = y < 8 ? (x < w / 2 ? 0 : 255) : x < w / 2 ? 70 : 190;
      px.set([g, g, g, 255], i * 4);
    }
    const r = woodcutPixels(px, w, w, { edgeFraction: 0 });
    const inkIn = (x0: number, x1: number) => {
      let n = 0;
      for (let y = 20; y < w - 20; y++) for (let x = x0; x < x1; x++) if (r[(y * w + x) * 4] === INK[0]) n++;
      return n;
    };
    expect(inkIn(20, w / 2 - 20)).toBeGreaterThan(inkIn(w / 2 + 20, w - 20) * 2);
  });

  it("can draw a double frame", () => {
    const framed = woodcutPixels(src, w, w, { frame: true });
    const inkAt = (x: number, y: number) => framed[(y * w + x) * 4] === INK[0];
    expect(inkAt(3, 160)).toBe(true); // outer frame
    expect(inkAt(4, 160)).toBe(true);
    expect(inkAt(8, 160)).toBe(true); // inner frame
    expect(inkAt(0, 160)).toBe(false); // clear margin
    expect(inkAt(6, 160)).toBe(false); // gap between the two lines
  });

  it("frame mask: untouched in the middle", () => {
    const m = new Uint8Array(30 * 30).fill(1);
    applyFrame(m, 30, 30);
    expect(m[15 * 30 + 15]).toBe(1);
    expect(m[15 * 30 + 0]).toBe(0);
  });
});

// ---- Optional visual check ----------------------------------------------------
// WOODCUT_PREVIEW=<dir> pnpm vitest run src/lib/woodcut.test.ts  writes before/after PNGs.

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("preview", () => {
  const dir = process.env.WOODCUT_PREVIEW;
  it.skipIf(!dir)("writes before/after PNGs", () => {
    const w = 320;
    const src = fakePortrait(w, w);
    fs.mkdirSync(dir!, { recursive: true });
    fs.writeFileSync(path.join(dir!, "before.png"), encodePng(src, w, w));
    fs.writeFileSync(path.join(dir!, "after.png"), encodePng(woodcutPixels(src, w, w), w, w));
    // And as it appears on the poster: 112px.
    fs.writeFileSync(path.join(dir!, "after-framed.png"), encodePng(woodcutPixels(src, w, w, { frame: true }), w, w));
  });
});
