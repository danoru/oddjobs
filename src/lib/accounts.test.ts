import { describe, expect, it } from "vitest";
import { canAuthor, canMakeInvites, inviteProblem, isAdmin, mayEdit, safeNext, signUpSchema, usernameKey, usernameSchema } from "./accounts";

const admin = { id: "a", role: "admin" as const, author: false, canInvite: false };
const author = { id: "b", role: "member" as const, author: true, canInvite: false };
const member = { id: "c", role: "member" as const, author: false, canInvite: true };

describe("who may do what", () => {
  it("admins do everything; authors write their own; members neither", () => {
    expect([isAdmin(admin), isAdmin(author), isAdmin(member), isAdmin(null)]).toEqual([true, false, false, false]);
    expect([canAuthor(admin), canAuthor(author), canAuthor(member)]).toEqual([true, true, false]);
    expect([canMakeInvites(admin), canMakeInvites(author), canMakeInvites(member)]).toEqual([true, false, true]);
  });

  it("an author edits only what they own; unowned is the admins' alone", () => {
    expect(mayEdit(author, "b")).toBe(true);
    expect(mayEdit(author, "someone-else")).toBe(false);
    expect(mayEdit(author, null)).toBe(false);
    expect(mayEdit(admin, null)).toBe(true);
    expect(mayEdit(admin, "b")).toBe(true);
    // A member who happens to own something (an author whose badge was taken away) can't write it.
    expect(mayEdit({ ...member, id: "b" }, "b")).toBe(false);
  });
});

describe("usernames", () => {
  it("are case-insensitive keys", () => {
    expect(usernameKey("  Rook ")).toBe("rook");
    expect(usernameKey("ROOK")).toBe(usernameKey("rook"));
  });

  it("are short, plain and not the site's own words", () => {
    expect(usernameSchema.safeParse("Rook_2").success).toBe(true);
    for (const bad of ["ab", "a".repeat(25), "-rook", "rook!", "ro ok", "Admin", "board", "ünïcode"]) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("sign-up wants a long enough password and a name", () => {
    const ok = { username: "rook", password: "long enough pw", displayName: "Rook", pronouns: "" };
    expect(signUpSchema.parse(ok).pronouns).toBeNull();
    expect(signUpSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, displayName: "  " }).success).toBe(false);
  });
});

describe("invites", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const fresh = { maxUses: 1, uses: 0, expiresAt: new Date("2026-10-22T12:00:00Z"), revokedAt: null };
  it("work until used up, expired or taken down", () => {
    expect(inviteProblem(fresh, now)).toBeNull();
    expect(inviteProblem({ ...fresh, uses: 1 }, now)).toMatch(/used up/);
    expect(inviteProblem({ ...fresh, maxUses: 3, uses: 2 }, now)).toBeNull();
    expect(inviteProblem({ ...fresh, expiresAt: new Date("2026-10-21T11:59:59Z") }, now)).toMatch(/expired/);
    expect(inviteProblem({ ...fresh, revokedAt: now }, now)).toMatch(/taken down/);
    expect(inviteProblem(null, now)).toMatch(/isn't on the board/);
  });
});

describe("after signing in", () => {
  it("only goes to paths on this site", () => {
    expect(safeNext("/the-drowned-bell/gm")).toBe("/the-drowned-bell/gm");
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", undefined, ["/x"]]) expect(safeNext(bad)).toBe("/board");
  });
});
