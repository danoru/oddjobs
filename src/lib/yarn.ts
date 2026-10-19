import type { CoreCharacter } from "./schema";

type YarnCharacter = Pick<CoreCharacter, "id" | "name" | "poster" | "story">;

/**
 * Layout for the red-yarn board: characters pinned round an oval, one string
 * per pair that's tied, labelled with the board-safe `public` lines only.
 */

export interface YarnCard {
  id: string;
  label: string;
  /** Centre, as a percentage of the board's width/height. */
  x: number;
  y: number;
}

export interface YarnString {
  key: string;
  from: string;
  to: string;
  /** Board-safe lines from either side of the tie. */
  labels: string[];
}

export function yarnLayout(cast: YarnCharacter[]): { cards: YarnCard[]; strings: YarnString[] } {
  const n = cast.length;
  const cards = cast.map((c, i): YarnCard => {
    // Start at the top and go clockwise; a slight squash leaves room for labels.
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return {
      id: c.id,
      label: c.poster.alias ?? c.name,
      x: 50 + 36 * Math.cos(a),
      y: 50 + 34 * Math.sin(a),
    };
  });

  const byKey = new Map<string, YarnString>();
  const ids = new Set(cast.map((c) => c.id));
  for (const c of cast) {
    for (const t of c.story.ties) {
      if (!ids.has(t.to)) continue;
      const [from, to] = [c.id, t.to].sort();
      const key = `${from}|${to}`;
      const s = byKey.get(key) ?? { key, from, to, labels: [] };
      // A mystery character's ties stay mysterious.
      if (t.public && !c.poster.alias && !s.labels.includes(t.public)) s.labels.push(t.public);
      byKey.set(key, s);
    }
  }
  return { cards, strings: [...byKey.values()] };
}

/** Quadratic curve control point: the string sags downward, as yarn does. */
export function sag(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: mx, y: my + Math.min(14, len * 0.18) };
}
