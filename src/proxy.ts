import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";

/**
 * `/<oneshot>/gm` (the GM's view of one table), `/<oneshot>/kit` (the GM's
 * printable kit), `/<oneshot>/box` (the whole box, sealed letters and all)
 * and the one-shot builder under `/admin`.
 */
const GM_PAGE = /^\/(?:[^/]+\/(?:gm|kit|box)|admin(?:\/.*)?)\/?$/;

// Everything is behind the table password except the door itself, and the GM
// pages also need the GM password. This is the convenience redirect; the GM
// page and GM-only API routes check the role again themselves.
// /api/foundry/ is excluded in the matcher below: Foundry calls it cross-origin
// with a bearer token (no cookie), and the route checks the token itself.
export async function proxy(req: NextRequest) {
  const role = await verifyToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (role && (role === "gm" || !GM_PAGE.test(req.nextUrl.pathname))) {
    return NextResponse.next();
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  // GM pages take no query; on client-side navigations Next adds the route
  // params to it (`?oneshot=…`), which shouldn't end up in `next`.
  const search = GM_PAGE.test(req.nextUrl.pathname) ? "" : req.nextUrl.search;
  login.searchParams.set("next", req.nextUrl.pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!login|api/login|api/foundry/|_next/static|_next/image|favicon.ico|fonts/|textures/).*)",
  ],
};
