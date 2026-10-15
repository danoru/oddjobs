import { beforeAll, describe, expect, it } from "vitest";
import { createToken, roleForPassword, verifyToken } from "./auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("auth tokens", () => {
  it("round-trips the role", async () => {
    expect(await verifyToken(await createToken("table"))).toBe("table");
    expect(await verifyToken(await createToken("gm"))).toBe("gm");
  });

  it("rejects a player token edited to say gm", async () => {
    const [, expires, sig] = (await createToken("table")).split(".");
    expect(await verifyToken(`gm.${expires}.${sig}`)).toBeNull();
  });

  it("rejects expired, unknown-role and malformed tokens", async () => {
    const old = await createToken("gm", 0);
    expect(await verifyToken(old)).toBeNull();
    expect(await verifyToken(undefined)).toBeNull();
    expect(await verifyToken("gm.123")).toBeNull();
    const now = Date.now();
    const token = await createToken("table", now);
    const [, expires, sig] = token.split(".");
    expect(await verifyToken(`admin.${expires}.${sig}`, now)).toBeNull();
  });
});

describe("roleForPassword", () => {
  const env = { APP_PASSWORD: "door", GM_PASSWORD: "screen" };
  it("maps each password to its role", () => {
    expect(roleForPassword("door", env)).toBe("table");
    expect(roleForPassword("screen", env)).toBe("gm");
    expect(roleForPassword("nope", env)).toBeNull();
    expect(roleForPassword(undefined, env)).toBeNull();
  });
  it("never matches an unset password", () => {
    expect(roleForPassword("", { APP_PASSWORD: "door" })).toBeNull();
    expect(roleForPassword("screen", { APP_PASSWORD: "door" })).toBeNull();
  });
});
