import { describe, expect, it } from "vitest";
import { resolveDbUrls } from "./dbUrl";

const supabase = {
  POSTGRES_PRISMA_URL: "postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true",
  POSTGRES_URL_NON_POOLING: "postgres://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
};

describe("resolveDbUrls", () => {
  it("prefers DATABASE_URL and DIRECT_URL (local dev)", () => {
    const r = resolveDbUrls({ DATABASE_URL: "postgres://local/a", DIRECT_URL: "postgres://local/b", ...supabase });
    expect(r).toEqual({ url: "postgres://local/a", directUrl: "postgres://local/b", source: "env" });
  });

  it("derives both from the Supabase integration, in the tearoff schema", () => {
    const r = resolveDbUrls(supabase);
    expect(r.source).toBe("supabase");
    const url = new URL(r.url!);
    expect(url.port).toBe("6543");
    expect(url.searchParams.get("schema")).toBe("tearoff");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("1");
    expect(url.searchParams.get("sslmode")).toBe("require");
    const direct = new URL(r.directUrl!);
    expect(direct.port).toBe("5432");
    expect(direct.searchParams.get("schema")).toBe("tearoff");
    expect(direct.searchParams.has("pgbouncer")).toBe(false);
  });

  it("can be told to use the hosted database even when a local one is set", () => {
    const r = resolveDbUrls({ DATABASE_URL: "postgres://local/a", ...supabase }, { remote: true });
    expect(r.source).toBe("supabase");
    expect(new URL(r.url!).hostname).toContain("supabase");
  });

  it("keeps a schema that's already set", () => {
    const r = resolveDbUrls({ POSTGRES_PRISMA_URL: supabase.POSTGRES_PRISMA_URL + "&schema=other" });
    expect(new URL(r.url!).searchParams.get("schema")).toBe("other");
  });

  it("reports when there is no database at all", () => {
    expect(resolveDbUrls({})).toEqual({ source: "none" });
  });
});
