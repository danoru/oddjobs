/**
 * Woodcut portraits: turn any photo or sketch into an ink-on-parchment engraving,
 * entirely in the browser. No AI, no server.
 *
 * The pixel math is pure (Uint8ClampedArray + width/height) so it can be unit-tested
 * without a DOM. Only `woodcutDataUrl` and `loadImageFile` touch canvas / DOM APIs.
 *
 * Pipeline:
 *   crop square -> grayscale -> percentile levels -> light blur -> posterize to 4 tones
 *   -> per-tone 45 degree hatching (cross-hatched in the darkest band)
 *   + Sobel outline -> ink on parchment.
 */

export type RGB = readonly [number, number, number];

/** Matches --ink and --parchment in src/styles/globals.css. */
export const INK: RGB = [43, 29, 14];
export const PARCHMENT: RGB = [243, 231, 203];

export const OUTPUT_SIZE = 320;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface WoodcutOptions {
  /** Output edge length in pixels. */
  size: number;
  /** Where to place a square crop on the long axis: 0 = start, 0.5 = center. 0.25 favours the top (faces). */
  cropBias: number;
  /** Number of tones after posterizing. */
  levels: number;
  /** Distance between hatch lines, in pixels along the diagonal axis. */
  period: number;
  /** Hatch line thickness per tone, index 0 = darkest. Must not increase toward lighter tones. */
  thickness: number[];
  /** Whether each tone adds the crossing (135 degree) hatch. */
  cross: boolean[];
  /** Fraction of pixels that may become outline ink. */
  edgeFraction: number;
  /** Sobel magnitude below which nothing is outlined (keeps flat areas clean). */
  edgeFloor: number;
  /** Pixel radius of the blur applied before tone mapping. */
  toneBlur: number;
  /** Pixel radius of the blur applied before edge detection. */
  edgeBlur: number;
  /** Draw a thin double frame inside the image. */
  frame: boolean;
}

export const DEFAULT_OPTIONS: WoodcutOptions = {
  size: OUTPUT_SIZE,
  cropBias: 0.25,
  levels: 4,
  period: 6,
  thickness: [4, 3, 1, 0],
  cross: [true, false, false, false],
  edgeFraction: 0.07,
  edgeFloor: 90,
  toneBlur: 2,
  edgeBlur: 2,
  frame: false,
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

// ---- Cropping -----------------------------------------------------------------

export interface Crop {
  x: number;
  y: number;
  size: number;
}

/** The largest square in a w x h image. `bias` slides it along the long axis (0.5 = centered). */
export function cropSquare(w: number, h: number, bias = 0.5): Crop {
  const size = Math.max(1, Math.min(w, h));
  const b = Math.min(1, Math.max(0, bias));
  return { x: Math.round((w - size) * 0.5), y: Math.round((h - size) * b), size };
}

// ---- Tones --------------------------------------------------------------------

/** Rec. 601 luma, with transparent pixels treated as parchment so they stay light. */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const paper = 0.299 * PARCHMENT[0] + 0.587 * PARCHMENT[1] + 0.114 * PARCHMENT[2];
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const luma = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    out[i] = Math.round(luma * a + paper * (1 - a));
  }
  return out;
}

/**
 * Stretch the image so the `low`/`high` percentiles land on 0 and 255, then apply gamma
 * (gamma < 1 brightens). A near-flat image is left flat rather than amplifying noise.
 */
export function autoLevels(gray: Uint8ClampedArray, low = 0.02, high = 0.98, gamma = 1): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const at = (q: number) => {
    const target = q * gray.length;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  let lo = at(low);
  let hi = at(high);
  if (hi - lo < 24) {
    const mid = (lo + hi) / 2;
    lo = mid - 12;
    hi = mid + 12;
  }
  const out = new Uint8ClampedArray(gray.length);
  const span = hi - lo;
  for (let i = 0; i < gray.length; i++) {
    const t = Math.min(1, Math.max(0, (gray[i] - lo) / span));
    out[i] = Math.round(255 * (gamma === 1 ? t : Math.pow(t, gamma)));
  }
  return out;
}

/** Separable box blur with clamped edges. radius 0 returns a copy. */
export function boxBlur(gray: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return gray.slice();
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += gray[row + Math.min(w - 1, Math.max(0, x + k))];
      tmp[row + x] = sum / n;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return out;
}

/** Posterize to `levels` equal bands. 0 = darkest tone, levels - 1 = lightest. Monotonic in brightness. */
export function toneMap(gray: Uint8ClampedArray, levels = 4): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.min(levels - 1, Math.floor((gray[i] * levels) / 256));
  return out;
}

// ---- Hatching -----------------------------------------------------------------

/**
 * Does tone `tone` put ink at (x, y)? 45 degree lines: pixels where (x + y) mod period < thickness.
 * Darker tones use thicker lines from the same phase, so each tone's ink contains every lighter
 * tone's ink; tones flagged `cross` add the 135 degree lines as well.
 */
export function hatchAt(
  tone: number,
  x: number,
  y: number,
  opts: Pick<WoodcutOptions, "period" | "thickness" | "cross"> = DEFAULT_OPTIONS,
): boolean {
  const t = opts.thickness[tone] ?? 0;
  if (t <= 0) return false;
  if (mod(x + y, opts.period) < t) return true;
  return Boolean(opts.cross[tone]) && mod(x - y, opts.period) < t;
}

/** 1 where hatching puts ink, 0 elsewhere. */
export function hatchMask(
  tones: Uint8Array,
  w: number,
  h: number,
  opts: Pick<WoodcutOptions, "period" | "thickness" | "cross"> = DEFAULT_OPTIONS,
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (hatchAt(tones[y * w + x], x, y, opts)) out[y * w + x] = 1;
    }
  }
  return out;
}

// ---- Edges --------------------------------------------------------------------

/** Sobel gradient magnitude (|gx| + |gy|, 0..2040) with clamped edges. */
export function sobel(gray: Uint8ClampedArray, w: number, h: number): Uint16Array {
  const out = new Uint16Array(w * h);
  const px = (x: number, y: number) => gray[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        -px(x - 1, y - 1) - 2 * px(x - 1, y) - px(x - 1, y + 1) + px(x + 1, y - 1) + 2 * px(x + 1, y) + px(x + 1, y + 1);
      const gy =
        -px(x - 1, y - 1) - 2 * px(x, y - 1) - px(x + 1, y - 1) + px(x - 1, y + 1) + 2 * px(x, y + 1) + px(x + 1, y + 1);
      out[y * w + x] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return out;
}

/** Outline: the strongest `fraction` of gradients, but never below `floor`. */
export function edgeMask(magnitude: Uint16Array, fraction: number, floor: number): Uint8Array {
  const hist = new Uint32Array(2041);
  for (let i = 0; i < magnitude.length; i++) hist[Math.min(2040, magnitude[i])]++;
  const keep = fraction * magnitude.length;
  let acc = 0;
  let cut = 2040;
  for (let v = 2040; v >= 0; v--) {
    acc += hist[v];
    if (acc > keep) {
      cut = v + 1;
      break;
    }
    cut = v;
  }
  const threshold = Math.max(cut, floor, 1);
  const out = new Uint8Array(magnitude.length);
  for (let i = 0; i < magnitude.length; i++) if (magnitude[i] >= threshold) out[i] = 1;
  return out;
}

// ---- Frame and composition ----------------------------------------------------

/** Clear a margin and draw a thin double frame (2px outer, 1px inner) into an ink mask. */
export function applyFrame(mask: Uint8Array, w: number, h: number): void {
  const margin = 11;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inset = Math.min(x, y, w - 1 - x, h - 1 - y);
      const i = y * w + x;
      if (inset < margin) mask[i] = inset === 3 || inset === 4 || inset === 8 ? 1 : 0;
    }
  }
}

/** Two-colour RGBA: ink where the mask is set, parchment elsewhere. */
export function renderInk(mask: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const c = mask[i] ? INK : PARCHMENT;
    out[p] = c[0];
    out[p + 1] = c[1];
    out[p + 2] = c[2];
    out[p + 3] = 255;
  }
  return out;
}

/** The whole pipeline on raw RGBA pixels that are already cropped and sized. */
export function woodcutPixels(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  options: Partial<WoodcutOptions> = {},
): Uint8ClampedArray {
  const o: WoodcutOptions = { ...DEFAULT_OPTIONS, ...options };
  const levelled = autoLevels(toGray(rgba, w, h));
  const tones = toneMap(boxBlur(levelled, w, h, o.toneBlur), o.levels);
  const ink = hatchMask(tones, w, h, o);
  const edges = edgeMask(sobel(boxBlur(levelled, w, h, o.edgeBlur), w, h), o.edgeFraction, o.edgeFloor);
  for (let i = 0; i < ink.length; i++) if (edges[i]) ink[i] = 1;
  if (o.frame) applyFrame(ink, w, h);
  return renderInk(ink, w, h);
}

// ---- Browser glue (canvas / DOM) ----------------------------------------------

export type WoodcutSource = ImageBitmap | HTMLImageElement;

const sourceSize = (src: WoodcutSource) =>
  src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };

/** Square-crop the source, draw it at output size, run the pipeline and return a PNG data URL. */
export function woodcutDataUrl(src: WoodcutSource, options: Partial<WoodcutOptions> = {}): string {
  const o: WoodcutOptions = { ...DEFAULT_OPTIONS, ...options };
  const { w, h } = sourceSize(src);
  if (!w || !h) throw new Error("That image has no pixels.");
  const crop = cropSquare(w, h, o.cropBias);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = o.size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = `rgb(${PARCHMENT.join(",")})`;
  ctx.fillRect(0, 0, o.size, o.size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, crop.x, crop.y, crop.size, crop.size, 0, 0, o.size, o.size);
  const input = ctx.getImageData(0, 0, o.size, o.size);
  const output = woodcutPixels(input.data, o.size, o.size, o);
  ctx.putImageData(new ImageData(output as Uint8ClampedArray<ArrayBuffer>, o.size, o.size), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Decode a user's file. Prefers createImageBitmap (honours EXIF rotation); falls back to <img>. */
export async function loadImageFile(file: File): Promise<WoodcutSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
