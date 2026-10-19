import type { DocPath, OneShotDoc } from "@/lib/oneShotCheck";
import { getAt } from "@/lib/store/doc";

/**
 * Soft warnings the builder shows next to a field. They never block
 * publishing; they're there to catch the easy mistakes.
 */

const STOP = new Set(
  "the and that with from this they them their there have has had were was what when where which while who whom whose will would could should into onto over under about after before because been being than then also only just very more most some such your yours ours ever never each other another nothing something anyone someone everyone".split(
    " ",
  ),
);

/** Words worth comparing: lowercase, four letters or more, not filler. */
export function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[’']/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/** The words a board-safe line shares with the secret it must not give away. */
export function sharedWithSecret(publicLine: string, secret: string): string[] {
  const secretWords = keywords(secret);
  return [...keywords(publicLine)].filter((w) => secretWords.has(w));
}

/** For a tie's `public` line: warns when it echoes words from the character's own secret. */
export function publicTieWarning(value: unknown, doc: OneShotDoc, path: DocPath): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  // path: ["cast", i, "story", "ties", j, "public"]
  const secret = getAt(doc, [...path.slice(0, 2), "story", "secret"]);
  if (typeof secret !== "string") return null;
  const shared = sharedWithSecret(value, secret);
  return shared.length
    ? `Might reveal the secret: it shares ${shared.map((w) => `“${w}”`).join(", ")} with it. Everyone sees this line on the board.`
    : null;
}
