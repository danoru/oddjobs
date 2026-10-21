import type { GetServerSidePropsContext } from "next";
import { canAuthor, isAdmin, type Viewer } from "./accounts";
import { cookieHeaderOf, readClaims } from "./session";
import { accounts } from "./users.server";

/**
 * Who's asking, on the server: API routes and getServerSideProps. The proxy
 * only checks that a session exists; everything privileged checks the user
 * here, against the database, on every request.
 *
 * Until games arrive (phase 11), "GM" means an admin: the GM pages, opening a
 * table and the GM's side of every table API.
 */

type NodeReq = { headers?: Record<string, string | string[] | undefined>; cookies?: Partial<Record<string, string>> };

/** How the server looks a session's user up; tests swap it out. */
export const userSource = {
  viewer: (id: string, tokenVersion: number): Promise<Viewer | null> => accounts.viewer(id, tokenVersion),
};

/** The signed-in user, checked against the database (enabled, session still current), or null. */
export async function currentUser(req: NodeReq): Promise<Viewer | null> {
  const claims = await readClaims(cookieHeaderOf(req));
  if (!claims) return null;
  return userSource.viewer(claims.sub, claims.tv);
}

/** At a table: "gm" for an admin, "table" for anyone else signed in. */
export type Role = "table" | "gm";

/**
 * The table role, for the table APIs the phones poll every couple of
 * seconds: a player's session is taken at its word (no database read per
 * poll), but a session claiming admin is checked against the database.
 */
export async function requestRole(req: NodeReq): Promise<Role | null> {
  const claims = await readClaims(cookieHeaderOf(req));
  if (!claims) return null;
  if (claims.role !== "admin") return "table";
  const v = await userSource.viewer(claims.sub, claims.tv);
  return v ? (isAdmin(v) ? "gm" : "table") : null;
}

export type Need = "member" | "author" | "admin";

const allowed = (v: Viewer, need: Need) => (need === "admin" ? isAdmin(v) : need === "author" ? canAuthor(v) : true);

/**
 * For getServerSideProps: the viewer if they may see the page, otherwise the
 * redirect to the door (which says who the page is for).
 */
export async function pageViewer(
  ctx: Pick<GetServerSidePropsContext, "req" | "resolvedUrl">,
  need: Need,
): Promise<{ viewer: Viewer; redirect?: undefined } | { viewer?: undefined; redirect: { destination: string; permanent: false } }> {
  const viewer = await currentUser(ctx.req);
  if (viewer && allowed(viewer, need)) return { viewer };
  // Client-side navigations add the route params to the query (`?oneshot=…`); a GM page takes none.
  const next = need === "member" ? ctx.resolvedUrl : ctx.resolvedUrl.split("?")[0];
  const q = new URLSearchParams({ next });
  if (viewer) q.set("need", need);
  return { redirect: { destination: `/login?${q}`, permanent: false } };
}

/** For API routes: the viewer if allowed, else answers 401/403 itself and returns null. */
export async function apiViewer(
  req: NodeReq,
  res: { status(code: number): { json(body: unknown): unknown }; setHeader(k: string, v: string): unknown },
  need: Need,
  message?: string,
): Promise<Viewer | null> {
  res.setHeader("Cache-Control", "private, no-store");
  const viewer = await currentUser(req);
  if (!viewer) {
    res.status(401).json({ error: "Sign in first" });
    return null;
  }
  if (!allowed(viewer, need)) {
    res.status(403).json({ error: message ?? (need === "admin" ? "Only an admin can do that" : "Only an author can do that") });
    return null;
  }
  return viewer;
}
