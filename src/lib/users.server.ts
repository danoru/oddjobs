import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient, type User } from "@prisma/client";
import {
  INVITE_MAX_DAYS,
  MEMBER_INVITE_DAYS,
  RESET_HOURS,
  inviteProblem,
  inviteSchema,
  isAdmin,
  passwordSchema,
  profileSchema,
  signUpSchema,
  usernameKey,
  type SignUp,
  type SiteRole,
  type Viewer,
} from "./accounts";
import { hashPassword, verifyPassword } from "./password.server";
import { db } from "./prisma";
import { LIMITS, loginIpKey, loginUserKey, rateLimiter, tokenIpKey, type RateLimiter } from "./rateLimit.server";

/**
 * Everything that changes an account: signing in, joining with an invite,
 * invites, reset links, settings and the admin's people page. Every check
 * that matters is here, on the server; the pages only ask. Server-only.
 */

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** The form field it belongs to. */
    readonly field?: string,
  ) {
    super(message);
  }
}

export function toViewer(u: User): Viewer {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    pronouns: u.pronouns,
    role: u.role === "admin" ? "admin" : "member",
    author: u.author,
    canInvite: u.canInvite,
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newCode = () => randomBytes(12).toString("base64url");
const newResetToken = () => randomBytes(32).toString("base64url");
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export interface AccountsOptions {
  client?: () => PrismaClient;
  limiter?: RateLimiter;
  now?: () => Date;
}

export class Accounts {
  private readonly client: () => PrismaClient;
  private readonly limiter: RateLimiter;
  private readonly now: () => Date;

  constructor(opts: AccountsOptions = {}) {
    this.client = opts.client ?? db;
    this.limiter = opts.limiter ?? rateLimiter;
    this.now = opts.now ?? (() => new Date());
  }

  // ---- Signing in ----

  /**
   * Checks a username and password, counting failures. "limited" means the
   * door is shut for now, whether or not the password was right.
   */
  async authenticate(username: unknown, password: unknown, ip: string): Promise<{ ok: true; user: User } | { ok: false; reason: "bad" | "limited" }> {
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) return { ok: false, reason: "bad" };
    const key = usernameKey(username).slice(0, 64);
    const userKey = loginUserKey(key);
    const ipK = loginIpKey(ip);
    if (await this.limiter.limited([{ key: userKey, max: LIMITS.loginUser }, { key: ipK, max: LIMITS.loginIp }])) {
      return { ok: false, reason: "limited" };
    }
    const user = await this.client().user.findUnique({ where: { usernameLower: key } });
    const good = await verifyPassword(user?.passwordHash, password.slice(0, 1000));
    if (!user || !good || user.disabledAt) {
      await this.limiter.fail([userKey, ipK]);
      return { ok: false, reason: "bad" };
    }
    await this.limiter.clear(userKey);
    await this.client().user.update({ where: { id: user.id }, data: { lastLoginAt: this.now() } });
    return { ok: true, user };
  }

  /** The signed-in user, if the account is still enabled and the session still current. */
  async viewer(id: string, tokenVersion: number): Promise<Viewer | null> {
    const u = await this.client().user.findUnique({ where: { id } });
    if (!u || u.disabledAt || u.tokenVersion !== tokenVersion) return null;
    return toViewer(u);
  }

  async findUser(id: string): Promise<User | null> {
    return this.client().user.findUnique({ where: { id } });
  }

  // ---- Making accounts ----

  /** For `pnpm admin:create` and tests: an account with no invite. */
  async createUser(input: SignUp & { role?: SiteRole; author?: boolean; canInvite?: boolean }): Promise<User> {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) throw new AccountError(parsed.error.issues[0].message, 400, String(parsed.error.issues[0].path[0]));
    const s = parsed.data;
    try {
      return await this.client().user.create({
        data: {
          username: s.username,
          usernameLower: usernameKey(s.username),
          displayName: s.displayName,
          pronouns: s.pronouns ?? null,
          passwordHash: await hashPassword(s.password),
          role: input.role ?? "member",
          author: input.author ?? false,
          canInvite: input.canInvite ?? false,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AccountError("That name is already on the board", 409, "username");
      throw e;
    }
  }

  /** What /join/<code> shows: whether it can be used, and what it grants. */
  async inviteInfo(code: string): Promise<{ problem: string | null; grantsAuthor: boolean; note: string | null; from: string | null }> {
    const inv = code.length <= 64 ? await this.client().invite.findUnique({ where: { code }, include: { createdBy: true } }) : null;
    return {
      problem: inviteProblem(inv, this.now()),
      grantsAuthor: inv?.grantsAuthor ?? false,
      note: inv?.note ?? null,
      from: inv?.createdBy?.displayName ?? null,
    };
  }

  /**
   * Signs up with an invite: the invite's use and the new account land
   * together, or neither does. Two people racing for a single-use invite
   * can't both get in: the use only counts if nobody counted one meanwhile.
   */
  async join(code: unknown, input: unknown, ip: string): Promise<User> {
    const ipK = tokenIpKey(ip);
    if (await this.limiter.limited([{ key: ipK, max: LIMITS.token }])) throw new AccountError("Too many tries. Wait a few minutes.", 429);
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) throw new AccountError(parsed.error.issues[0].message, 400, String(parsed.error.issues[0].path[0]));
    const s = parsed.data;
    const inv = typeof code === "string" && code.length <= 64 ? await this.client().invite.findUnique({ where: { code } }) : null;
    const problem = inviteProblem(inv, this.now());
    if (problem || !inv) {
      await this.limiter.fail([ipK]);
      throw new AccountError(problem ?? "This invite isn't on the board.", 410);
    }
    const passwordHash = await hashPassword(s.password);
    const now = this.now();
    try {
      return await this.client().$transaction(async (tx) => {
        const took = await tx.invite.updateMany({
          where: { id: inv.id, uses: inv.uses, revokedAt: null, expiresAt: { gt: now } },
          data: { uses: { increment: 1 } },
        });
        if (took.count !== 1 || inv.uses >= inv.maxUses) throw new AccountError("Someone just used this invite. Ask for another.", 410);
        return tx.user.create({
          data: {
            username: s.username,
            usernameLower: usernameKey(s.username),
            displayName: s.displayName,
            pronouns: s.pronouns ?? null,
            passwordHash,
            role: "member",
            author: inv.grantsAuthor,
            invitedById: inv.createdById,
            inviteId: inv.id,
          },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AccountError("That name is already on the board", 409, "username");
      throw e;
    }
  }

  // ---- Invites ----

  /**
   * `seat`: a guest seat at a game (phase 11) that whoever joins with it
   * takes over, with its history. Those are always single-use.
   */
  async makeInvite(by: Viewer, input: unknown, seat?: { gameId: string; key: string }): Promise<{ code: string; expiresAt: Date }> {
    if (!isAdmin(by) && !by.canInvite) throw new AccountError("Only an admin can make invites", 403);
    const parsed = inviteSchema.safeParse(input ?? {});
    if (!parsed.success) throw new AccountError(parsed.error.issues[0].message);
    const opt = parsed.data;
    // A member who may invite gets single-use links of a week at most, and can't hand out the author badge.
    const member = !isAdmin(by) || !!seat;
    const days = Math.min(opt.days, member ? MEMBER_INVITE_DAYS : INVITE_MAX_DAYS);
    const expiresAt = new Date(this.now().getTime() + days * 24 * 60 * 60 * 1000);
    const inv = await this.client().invite.create({
      data: {
        code: newCode(),
        note: opt.note,
        maxUses: member ? 1 : opt.maxUses,
        expiresAt,
        grantsAuthor: member ? false : opt.grantsAuthor,
        createdById: by.id,
        ...(seat ? { guestGameId: seat.gameId, guestKey: seat.key } : {}),
      },
    });
    return { code: inv.code, expiresAt };
  }

  /** Admins see every invite; a member who may invite sees their own. */
  async listInvites(by: Viewer) {
    const rows = await this.client().invite.findMany({
      where: isAdmin(by) ? {} : { createdById: by.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { username: true } }, joined: { select: { username: true } } },
    });
    const now = this.now();
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      note: r.note,
      maxUses: r.maxUses,
      uses: r.uses,
      expiresAt: r.expiresAt.toISOString(),
      grantsAuthor: r.grantsAuthor,
      revoked: !!r.revokedAt,
      problem: inviteProblem(r, now),
      createdBy: r.createdBy?.username ?? null,
      joined: r.joined.map((j) => j.username),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async revokeInvite(by: Viewer, id: string): Promise<void> {
    const inv = await this.client().invite.findUnique({ where: { id } });
    if (!inv || (!isAdmin(by) && inv.createdById !== by.id)) throw new AccountError("No such invite", 404);
    await this.client().invite.update({ where: { id }, data: { revokedAt: inv.revokedAt ?? this.now() } });
  }

  // ---- Reset links ----

  /** A one-time reset link's token, shown to the admin once; only its hash is kept. Earlier unused links for the user stop working. */
  async makeReset(by: Viewer, userId: string): Promise<{ token: string; expiresAt: Date; username: string }> {
    if (!isAdmin(by)) throw new AccountError("Only an admin can make reset links", 403);
    const user = await this.client().user.findUnique({ where: { id: userId } });
    if (!user) throw new AccountError("No such person", 404);
    const token = newResetToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + RESET_HOURS * 60 * 60 * 1000);
    await this.client().$transaction([
      this.client().passwordReset.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
      this.client().passwordReset.create({ data: { tokenHash: sha256(token), userId, createdById: by.id, expiresAt } }),
    ]);
    return { token, expiresAt, username: user.username };
  }

  private async resetRow(token: unknown) {
    if (typeof token !== "string" || token.length > 128) return null;
    return this.client().passwordReset.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  }

  private resetProblem(row: Awaited<ReturnType<Accounts["resetRow"]>>): string | null {
    if (!row) return "This reset link isn't valid.";
    if (row.usedAt) return "This reset link has already been used.";
    if (row.expiresAt.getTime() <= this.now().getTime()) return "This reset link has expired.";
    if (row.user.disabledAt) return "This account is closed.";
    return null;
  }

  /** What /reset/<token> shows. */
  async resetInfo(token: unknown): Promise<{ problem: string | null; username: string | null }> {
    const row = await this.resetRow(token);
    const problem = this.resetProblem(row);
    return { problem, username: problem ? null : row!.user.username };
  }

  /** Sets a new password from a reset link, once. Every session the user had ends. */
  async useReset(token: unknown, password: unknown, ip: string): Promise<User> {
    const ipK = tokenIpKey(ip);
    if (await this.limiter.limited([{ key: ipK, max: LIMITS.token }])) throw new AccountError("Too many tries. Wait a few minutes.", 429);
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) throw new AccountError(pw.error.issues[0].message, 400, "password");
    const row = await this.resetRow(token);
    const problem = this.resetProblem(row);
    if (problem || !row) {
      await this.limiter.fail([ipK]);
      throw new AccountError(problem ?? "This reset link isn't valid.", 410);
    }
    const passwordHash = await hashPassword(pw.data);
    const now = this.now();
    return this.client().$transaction(async (tx) => {
      const took = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (took.count !== 1) throw new AccountError("This reset link has already been used.", 410);
      return tx.user.update({ where: { id: row.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    });
  }

  // ---- Settings ----

  /** Changes your own password; every other session ends (this one is re-issued by the caller). */
  async changePassword(userId: string, current: unknown, next: unknown): Promise<User> {
    const user = await this.client().user.findUnique({ where: { id: userId } });
    if (!user || user.disabledAt) throw new AccountError("Sign in again", 401);
    if (typeof current !== "string" || !(await verifyPassword(user.passwordHash, current))) {
      throw new AccountError("That isn't your current password", 400, "current");
    }
    const pw = passwordSchema.safeParse(next);
    if (!pw.success) throw new AccountError(pw.error.issues[0].message, 400, "password");
    return this.client().user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(pw.data), tokenVersion: { increment: 1 } },
    });
  }

  async updateProfile(userId: string, input: unknown): Promise<User> {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) throw new AccountError(parsed.error.issues[0].message, 400, String(parsed.error.issues[0].path[0]));
    return this.client().user.update({ where: { id: userId }, data: { displayName: parsed.data.displayName, pronouns: parsed.data.pronouns ?? null } });
  }

  // ---- The people page ----

  async listPeople() {
    const rows = await this.client().user.findMany({ orderBy: { createdAt: "asc" }, include: { invitedBy: { select: { username: true } } } });
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      pronouns: u.pronouns,
      role: (u.role === "admin" ? "admin" : "member") as SiteRole,
      author: u.author,
      canInvite: u.canInvite,
      disabled: !!u.disabledAt,
      invitedBy: u.invitedBy?.username ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /**
   * Grants or takes away admin, the author badge and inviting, or disables
   * and re-enables an account. An admin can't demote or disable themselves,
   * and there's always one enabled admin left. Losing admin or being disabled
   * ends every session at once; a grant shows up within a minute.
   */
  async setAccess(by: Viewer, userId: string, change: { role?: SiteRole; author?: boolean; canInvite?: boolean; disabled?: boolean }): Promise<User> {
    if (!isAdmin(by)) throw new AccountError("Only an admin can change who may do what", 403);
    const user = await this.client().user.findUnique({ where: { id: userId } });
    if (!user) throw new AccountError("No such person", 404);
    const demote = change.role === "member" && user.role === "admin";
    const disable = change.disabled === true && !user.disabledAt;
    if (userId === by.id && (demote || disable)) throw new AccountError("You can't do that to yourself: ask another admin", 409);
    if ((demote || (disable && user.role === "admin")) && (await this.client().user.count({ where: { role: "admin", disabledAt: null } })) <= 1) {
      throw new AccountError("There has to be one admin left", 409);
    }
    const data: Prisma.UserUpdateInput = {};
    if (change.role) data.role = change.role;
    if (typeof change.author === "boolean") data.author = change.author;
    if (typeof change.canInvite === "boolean") data.canInvite = change.canInvite;
    if (typeof change.disabled === "boolean") data.disabledAt = change.disabled ? (user.disabledAt ?? this.now()) : null;
    if (demote || disable) data.tokenVersion = { increment: 1 };
    return this.client().user.update({ where: { id: userId }, data });
  }

  /** The first admin: hands every unowned one-shot in the database to them. */
  async claimUnowned(adminId: string): Promise<number> {
    const r = await this.client().oneShot.updateMany({ where: { ownerId: null }, data: { ownerId: adminId } });
    return r.count;
  }
}

export const accounts = new Accounts();
