import { z } from "zod";

/**
 * Accounts (phase 10): who may do what on the site, and what a username,
 * password, display name and pronouns may be. Pure, so the browser forms and
 * the server share one set of rules. Per-game roles (GM, co-GM, player)
 * live on each game (./games.ts).
 */

export const SITE_ROLES = ["admin", "member"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

/** Who's signed in, as the server checked it against the database. */
export interface Viewer {
  id: string;
  username: string;
  displayName: string;
  pronouns: string | null;
  role: SiteRole;
  /** The author badge: may write one-shots in the builder (their own). */
  author: boolean;
  /** May make invite links. Admins always can. */
  canInvite: boolean;
}

export const isAdmin = (v: Pick<Viewer, "role"> | null | undefined): boolean => v?.role === "admin";
/** The builder: admins, and members with the author badge. */
export const canAuthor = (v: Pick<Viewer, "role" | "author"> | null | undefined): boolean => !!v && (v.role === "admin" || v.author);
export const canMakeInvites = (v: Pick<Viewer, "role" | "canInvite"> | null | undefined): boolean => !!v && (v.role === "admin" || v.canInvite);
/** May edit or publish a one-shot with this owner: admins any, authors their own. Unowned = admins only. */
export const mayEdit = (v: Pick<Viewer, "id" | "role" | "author"> | null | undefined, ownerId: string | null | undefined): boolean =>
  !!v && (v.role === "admin" || (v.author && !!ownerId && ownerId === v.id));

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** Names the site uses for itself, so nobody's profile (/u/<name>, phase 12) shadows a page. */
const RESERVED = new Set(["admin", "administrator", "root", "system", "oddjobs", "tearoff", "gm", "guest", "me", "settings", "login", "join", "reset", "board", "api"]);

export const usernameKey = (name: string) => name.trim().toLowerCase();

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `At least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `At most ${USERNAME_MAX} characters`)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Letters, numbers, - and _ only, starting with a letter or number")
  .refine((n) => !RESERVED.has(n.toLowerCase()), "That name is taken by the tavern itself");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `At most ${PASSWORD_MAX} characters`);

export const displayNameSchema = z.string().trim().min(1, "Put a name to it").max(40, "At most 40 characters");
export const pronounsSchema = z
  .string()
  .trim()
  .max(30, "At most 30 characters")
  .transform((p) => p || null)
  .nullable()
  .optional();

export const signUpSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  pronouns: pronounsSchema,
});
export type SignUp = z.infer<typeof signUpSchema>;

export const profileSchema = z.object({ displayName: displayNameSchema, pronouns: pronounsSchema });

/** The first problem with each field, for a form. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

/** Invite links: how long and how many, within reason. */
export const INVITE_MAX_DAYS = 30;
export const INVITE_MAX_USES = 50;
/** A member who may invite gets single-use links of at most this many days, without the author badge. */
export const MEMBER_INVITE_DAYS = 7;
export const RESET_HOURS = 48;

export const inviteSchema = z.object({
  note: z.string().trim().max(60).optional().transform((n) => n || null),
  maxUses: z.number().int().min(1).max(INVITE_MAX_USES).default(1),
  days: z.number().min(1 / 24).max(INVITE_MAX_DAYS).default(7),
  grantsAuthor: z.boolean().default(false),
});

/** Why an invite can't be used now, or null if it can. */
export function inviteProblem(
  inv: { maxUses: number; uses: number; expiresAt: Date | string; revokedAt: Date | string | null } | null,
  now = new Date(),
): string | null {
  if (!inv) return "This invite isn't on the board.";
  if (inv.revokedAt) return "This invite was taken down.";
  if (new Date(inv.expiresAt).getTime() <= now.getTime()) return "This invite has expired.";
  if (inv.uses >= inv.maxUses) return "This invite has been used up.";
  return null;
}

/** A same-site path to go to after signing in, or the board. "//host" and "/\host" would leave the site. */
export function safeNext(next: unknown, fallback = "/board"): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : fallback;
}
