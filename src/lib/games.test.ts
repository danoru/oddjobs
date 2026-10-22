import { beforeAll, describe, expect, it } from "vitest";
import { canMove, canRepin, isOver, isSeating, userIdOfKey, userKey, GAME_STATUSES } from "./games";
import { actorOf, gameAccess, viewerOf, type GameAccess } from "./games.server";
import { GUEST_COOKIE, guestMayVisit, newGuestKey, readGuestPass, signGuestPass, verifyGuestPass, type GuestPass } from "./guestPass";
import { installTestUsers, sessionCookies, TEST_USERS } from "./testAuth";

const SECRET = "test-secret";
const pass = (over: Partial<GuestPass> = {}): GuestPass => ({ code: "ABCDE", oneshot: "lot-thirteen", key: "0123456789abcdef0123456789abcdef", name: "Sam", exp: Math.floor(Date.now() / 1000) + 3600, ...over });

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
  installTestUsers();
});

describe("game statuses", () => {
  it("go planned → open → live → finished, and epilogued only from the paper", () => {
    expect(canMove("planned", "open")).toBe(true);
    expect(canMove("open", "live")).toBe(true);
    expect(canMove("live", "finished")).toBe(true);
    expect(canMove("finished", "live")).toBe(true); // ended by mistake
    expect(canMove("planned", "live")).toBe(false);
    expect(canMove("live", "open")).toBe(false);
    for (const s of GAME_STATUSES) expect(canMove(s, "epilogued")).toBe(false);
    expect(GAME_STATUSES.filter(isOver)).toEqual(["finished", "epilogued"]);
    expect(GAME_STATUSES.filter(isSeating)).toEqual(["open", "live"]);
    // Updating to the latest version only before anyone has played it.
    expect(GAME_STATUSES.filter(canRepin)).toEqual(["planned", "open"]);
  });

  it("keys an account by its id, and a guest key is never an account's", () => {
    expect(userKey("abc")).toBe("u-abc");
    expect(userIdOfKey("u-abc")).toBe("abc");
    expect(userIdOfKey("0123456789abcdef0123456789abcdef")).toBeNull();
    for (let i = 0; i < 20; i++) expect(newGuestKey()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("guest passes", () => {
  it("round-trip, and refuse a forged, tampered, expired or malformed one", async () => {
    const good = await signGuestPass(pass(), SECRET);
    expect(await verifyGuestPass(good, SECRET)).toEqual(pass());
    expect(await verifyGuestPass(good, "another secret")).toBeNull();
    const [body, sig] = good.split(".");
    const other = Buffer.from(JSON.stringify(pass({ key: "f".repeat(32) }))).toString("base64url");
    expect(await verifyGuestPass(`${other}.${sig}`, SECRET)).toBeNull();
    expect(await verifyGuestPass(`${body}.${sig.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(await verifyGuestPass(await signGuestPass(pass({ exp: 1 }), SECRET), SECRET)).toBeNull();
    // A key that looks like an account's can't ride in a pass, even signed.
    expect(await verifyGuestPass(await signGuestPass(pass({ key: "u-u-admin" }), SECRET), SECRET)).toBeNull();
    expect(await verifyGuestPass("nonsense", SECRET)).toBeNull();
    expect(await readGuestPass(`a=b; ${GUEST_COOKIE}=${encodeURIComponent(good)}; c=d`, SECRET)).toEqual(pass());
  });

  it("open that game's one-shot pages and table, and nothing else", () => {
    const p = pass();
    for (const ok of ["/lot-thirteen", "/lot-thirteen/rook", "/lot-thirteen/play", "/lot-thirteen/tv", "/lot-thirteen/epilogue", "/api/tables/ABCDE", "/api/tables/abcde/live", "/_next/data/b1/lot-thirteen/rook.json", "/_next/data/b1/lot-thirteen.json"])
      expect(guestMayVisit(p, ok), ok).toBe(true);
    for (const no of ["/lot-thirteen/gm", "/lot-thirteen/kit", "/lot-thirteen/box", "/the-drowned-bell", "/board", "/games", "/admin", "/api/tables/FGHJK/live", "/api/games", "/api/games/ABCDE", "/_next/data/b1/lot-thirteen/gm.json", "/chronicle"])
      expect(guestMayVisit(p, no), no).toBe(false);
  });
});

describe("who's asking at a game", () => {
  const game: { code: string; gmId: string | null; coGms: { userId: string }[] } = { code: "ABCDE", gmId: TEST_USERS.table.id, coGms: [{ userId: TEST_USERS.author.id }] };
  const req = async (who: Parameters<typeof sessionCookies>[0], guest?: GuestPass) => ({
    cookies: { ...(await sessionCookies(who)), ...(guest ? { [GUEST_COOKIE]: encodeURIComponent(await signGuestPass(guest, SECRET)) } : {}) },
    headers: {},
  });
  const access = async (who: Parameters<typeof sessionCookies>[0], g = game, guest?: GuestPass) => gameAccess(await req(who, guest), g);

  it("lets the GM and co-GMs act, an admin only look, and anyone else play", async () => {
    const gm = await access("table");
    expect([gm.view, gm.act, gm.key, gm.name]).toEqual([true, true, "u-u-member", "Rook"]);
    const co = await access("author");
    expect([co.view, co.act]).toEqual([true, true]);
    const admin = await access("gm");
    expect([admin.view, admin.act, admin.key]).toEqual([true, false, "u-u-admin"]);
    const other = await access("author2");
    expect([other.view, other.act, other.key]).toEqual([false, false, "u-u-author2"]);
    const nobody = await access(null);
    expect([nobody.view, nobody.act, nobody.key]).toEqual([false, false, null]);
  });

  it("leaves a game from before accounts to the admins", async () => {
    const old = { code: "ABCDE", gmId: null, coGms: [] };
    expect((await access("gm", old)).act).toBe(true);
    expect((await access("table", old)).view).toBe(false);
  });

  it("seats a guest by their pass, only at that pass's game, and never trusts a header", async () => {
    const guest = await access(null, game, pass());
    expect([guest.view, guest.act, guest.key, guest.name]).toEqual([false, false, pass().key, "Sam"]);
    const elsewhere = await access(null, { ...game, code: "FGHJK" }, pass());
    expect(elsewhere.key).toBeNull();
    const spoofed = await gameAccess({ cookies: {}, headers: { "x-tearoff-player": "u-u-member" } }, game);
    expect([spoofed.key, spoofed.act]).toEqual([null, false]);
    // A session wins over a pass left in the same browser.
    expect((await access("author2", game, pass())).key).toBe("u-u-author2");
  });

  it("an account whose session is stale is nobody on the GM's side", async () => {
    const cookies = await sessionCookies(TEST_USERS.table);
    const { encode } = await import("next-auth/jwt");
    const { SESSION_COOKIE } = await import("./session");
    const v = TEST_USERS.table;
    const stale = await encode({ secret: SECRET, salt: SESSION_COOKIE, token: { sub: v.id, name: v.displayName, username: v.username, role: v.role, author: v.author, tv: 3, chk: Date.now() } });
    expect(Object.keys(cookies)).toEqual([SESSION_COOKIE]);
    const a = await gameAccess({ cookies: { [SESSION_COOKIE]: stale }, headers: {} }, game);
    expect([a.view, a.act, a.key]).toEqual([false, false, null]);
  });

  it("picks the view and the actor, and an admin looking in can't act as the GM", () => {
    const a = (over: Partial<GameAccess>): GameAccess => ({ view: false, act: false, key: null, name: null, userId: null, account: null, ...over });
    const gm = a({ view: true, act: true, key: "u-x" });
    expect(viewerOf(gm, undefined)).toEqual({ role: "gm" });
    expect(viewerOf(gm, "player")).toEqual({ role: "player", playerId: "u-x" });
    expect(viewerOf(gm, "table")).toEqual({ role: "table" });
    expect(viewerOf(a({ key: "k" }), undefined)).toEqual({ role: "player", playerId: "k" });
    expect(viewerOf(a({}), undefined)).toEqual({ role: "table" });

    expect(actorOf(gm, undefined, "live")).toEqual({ actor: { role: "gm" } });
    expect(actorOf(a({ view: true, key: "u-admin" }), undefined, "live")).toMatchObject({ status: 403 });
    expect(actorOf(a({ view: true, key: "u-admin" }), "player", "live")).toEqual({ actor: { role: "player", playerId: "u-admin" } });
    expect(actorOf(a({ key: "k" }), undefined, "open")).toEqual({ actor: { role: "player", playerId: "k" } });
    expect(actorOf(a({ key: "k" }), undefined, "planned")).toMatchObject({ status: 409 });
    expect(actorOf(gm, undefined, "planned")).toEqual({ actor: { role: "gm" } });
    for (const over of ["finished", "epilogued"] as const) {
      expect(actorOf(gm, undefined, over)).toMatchObject({ status: 409 });
      expect(actorOf(a({ key: "k" }), undefined, over)).toMatchObject({ status: 409 });
    }
    expect(actorOf(gm, "table", "live")).toMatchObject({ status: 403 });
    expect(actorOf(a({}), undefined, "live")).toMatchObject({ status: 401 });
  });
});
