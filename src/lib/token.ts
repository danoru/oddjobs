import type { CoreCharacter as Character } from "./schema";
import { cropSquare, INK, PARCHMENT } from "./woodcut";
import { PATHS, type IconKey } from "@/components/PosterIcon";

/**
 * Round VTT tokens (Foundry, Owlbear Rodeo): the woodcut portrait, or the
 * poster icon on hatched parchment, inside a parchment ring with the name set
 * along the bottom. Drawn on a canvas in the browser and saved as a PNG with
 * a transparent outside. The geometry and lettering maths are pure (tested);
 * only drawToken and tokenBlob touch the DOM.
 */

export const TOKEN_SIZE = 512;

export interface TokenGeometry {
  size: number;
  c: number;
  /** Outer edge of the ring. */
  outer: number;
  /** Inner edge of the ring, where the picture starts. */
  inner: number;
  /** Radius the name's letters sit on (middle of the ring). */
  text: number;
  /** Letter height that fits the ring. */
  fontPx: number;
}

export function tokenGeometry(size = TOKEN_SIZE): TokenGeometry {
  const outer = size / 2 - size * 0.012;
  const ringWidth = size * 0.1;
  const inner = outer - ringWidth;
  return { size, c: size / 2, outer, inner, text: inner + ringWidth / 2, fontPx: Math.round(ringWidth * 0.6) };
}

export type TokenArt = { kind: "portrait"; src: string } | { kind: "icon"; icon: IconKey };

/** The woodcut (or linked portrait) when there is one, else the poster icon. */
export function tokenArt(c: Pick<Character, "portrait" | "poster">): TokenArt {
  return c.portrait ? { kind: "portrait", src: c.portrait } : { kind: "icon", icon: c.poster.icon };
}

export function tokenFileName(slug: string, c: Pick<Character, "id">): string {
  return `${slug}-${c.id}-token.png`;
}

/** The name as the ring shows it: capitals, trimmed to what fits. */
export function ringLabel(name: string, max = 22): string {
  const up = name.trim().toUpperCase();
  return up.length <= max ? up : `${up.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Where each letter sits so the word reads left to right along the bottom of
 * the ring, centred on the bottom. Angles are canvas angles (0 = east, π/2 =
 * south); `rotate` turns the letter so its top faces the centre. If the word
 * is longer than `maxArc` radians, letters are squeezed to fit.
 */
export function arcLetters(
  widths: number[],
  radius: number,
  spacing = 0,
  maxArc = Math.PI * 0.8,
): { angle: number; rotate: number }[] {
  const total = widths.reduce((a, w) => a + w, 0) + spacing * Math.max(0, widths.length - 1);
  const squeeze = Math.min(1, (maxArc * radius) / (total || 1));
  const start = Math.PI / 2 + (total * squeeze) / (2 * radius);
  let along = 0;
  return widths.map((w) => {
    const angle = start - ((along + w / 2) * squeeze) / radius;
    along += w + spacing;
    return { angle, rotate: angle - Math.PI / 2 };
  });
}

// ---- Browser glue ---------------------------------------------------------------

const rgb = (c: readonly number[], a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Linked portraits only draw cleanly if their host allows it; data URLs always do.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("portrait didn't load"));
    img.src = src;
  });
}

function drawIcon(ctx: CanvasRenderingContext2D, g: TokenGeometry, icon: IconKey) {
  // Engraver's hatching behind the icon, like the poster frame.
  ctx.save();
  ctx.strokeStyle = rgb(INK, 0.1);
  ctx.lineWidth = g.size / 300;
  for (let x = -g.size; x < g.size * 2; x += g.size / 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + g.size, g.size);
    ctx.stroke();
  }
  ctx.restore();
  const box = g.inner * 1.15;
  const scale = box / 24;
  ctx.save();
  ctx.translate(g.c - box / 2, g.c - box / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = rgb(INK);
  ctx.fill(new Path2D(PATHS[icon]), "evenodd");
  ctx.restore();
}

/** Paint a token onto a square canvas. Falls back to the icon when the portrait can't be loaded. */
export async function drawToken(
  canvas: HTMLCanvasElement,
  c: Pick<Character, "name" | "portrait" | "poster">,
  size = TOKEN_SIZE,
  art: TokenArt = tokenArt(c),
): Promise<TokenArt> {
  const g = tokenGeometry(size);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.clearRect(0, 0, size, size);

  let used = art;
  let img: HTMLImageElement | null = null;
  if (art.kind === "portrait") {
    try {
      img = await loadImage(art.src);
    } catch {
      used = { kind: "icon", icon: c.poster.icon };
    }
  }

  // The picture, clipped to the inner disc.
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.c, g.c, g.inner, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = rgb(PARCHMENT);
  ctx.fillRect(0, 0, size, size);
  if (img) {
    const crop = cropSquare(img.naturalWidth, img.naturalHeight, 0.4);
    const d = g.inner * 2;
    ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, g.c - g.inner, g.c - g.inner, d, d);
  } else if (used.kind === "icon") {
    drawIcon(ctx, g, used.icon);
  }
  ctx.restore();

  // The parchment ring.
  ctx.beginPath();
  ctx.arc(g.c, g.c, g.outer, 0, Math.PI * 2);
  ctx.arc(g.c, g.c, g.inner, 0, Math.PI * 2, true);
  const grad = ctx.createRadialGradient(g.c * 0.7, g.c * 0.6, g.inner * 0.4, g.c, g.c, g.outer);
  grad.addColorStop(0, "#f8eed6");
  grad.addColorStop(1, "#d9c290");
  ctx.fillStyle = grad;
  ctx.fill("evenodd");

  // Ink rules: heavy outside, a fine double rule inside.
  ctx.strokeStyle = rgb(INK);
  for (const [r, w] of [
    [g.outer, size * 0.012],
    [g.outer - size * 0.018, size * 0.003],
    [g.inner, size * 0.008],
    [g.inner + size * 0.014, size * 0.003],
  ] as const) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(g.c, g.c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The name along the bottom; two little stars at the top.
  if (typeof document !== "undefined" && document.fonts) await document.fonts.load(`${g.fontPx}px "IM Fell English"`).catch(() => null);
  ctx.fillStyle = rgb(INK);
  ctx.font = `${g.fontPx}px "IM Fell English", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Everyone at the VTT sees the token, so a mystery character keeps the board's alias.
  const label = ringLabel(c.poster.alias ?? c.name);
  const letters = [...label];
  const widths = letters.map((ch) => ctx.measureText(ch).width);
  arcLetters(widths, g.text, g.fontPx * 0.12).forEach((p, i) => {
    ctx.save();
    ctx.translate(g.c + g.text * Math.cos(p.angle), g.c + g.text * Math.sin(p.angle));
    ctx.rotate(p.rotate);
    ctx.fillText(letters[i], 0, g.fontPx * 0.06);
    ctx.restore();
  });
  ctx.font = `${Math.round(g.fontPx * 0.9)}px Georgia, serif`;
  for (const a of [-Math.PI / 2 - 0.35, -Math.PI / 2, -Math.PI / 2 + 0.35]) {
    ctx.save();
    ctx.translate(g.c + g.text * Math.cos(a), g.c + g.text * Math.sin(a));
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(a === -Math.PI / 2 ? "✦" : "·", 0, 0);
    ctx.restore();
  }
  return used;
}

/** The token as a PNG blob. A cross-origin portrait that taints the canvas is redrawn with the icon. */
export async function tokenBlob(c: Pick<Character, "name" | "portrait" | "poster">, size = TOKEN_SIZE): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await drawToken(canvas, c, size);
  const toBlob = () =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty"))), "image/png"));
  try {
    return await toBlob();
  } catch {
    await drawToken(canvas, c, size, { kind: "icon", icon: c.poster.icon });
    return toBlob();
  }
}

/** Save the token PNG to the user's downloads. */
export async function downloadToken(slug: string, c: Pick<Character, "id" | "name" | "portrait" | "poster">) {
  const blob = await tokenBlob(c);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = tokenFileName(slug, c);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
