/**
 * Where authored content lives: "files" (content/ in git, the default) or
 * "db" (Postgres, with TEAROFF_STORE=db). The builder, the player pages, the
 * table APIs, the spell book and the shared world all follow it.
 */
export type StoreKind = "files" | "db";

export function storeKind(env: Partial<Record<string, string>> = process.env): StoreKind {
  return env.TEAROFF_STORE === "db" ? "db" : "files";
}
