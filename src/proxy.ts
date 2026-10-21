import { NextRequest, NextResponse } from "next/server";
import { readClaims } from "@/lib/session";

/**
 * The front door. Everything needs a signed-in account except the public
 * pages: the landing page (`/`), the door itself (`/login`, `/join/<code>`,
 * `/reset/<token>`), their APIs, Auth.js's own routes and the link-preview
 * images. Static assets skip the proxy entirely (see the matcher), and so
 * does `/api/foundry/`: Foundry calls it cross-origin with a bearer token (no
 * cookie), and the route checks the token itself.
 *
 * This only checks that a session exists (the token, no database). Who may do
 * what (admins, authors) is checked by each page and API on the server,
 * against the database (src/lib/auth.ts). Requests for a page's
 * `_next/data/…json` arrive here under the page's own path, so they follow
 * the same rule as the page.
 */

const PUBLIC = /^\/(?:login|join\/[^/]+|reset\/[^/]+|api\/(?:auth\/.*|og(?:\/.*)?|join|reset|whoami))\/?$/;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await readClaims(req.headers.get("cookie"));

  if (pathname === "/") {
    // The landing page is for strangers; members go straight to the board.
    if (!claims) return NextResponse.next();
    const board = req.nextUrl.clone();
    board.pathname = "/board";
    return NextResponse.redirect(board);
  }
  if (claims || PUBLIC.test(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/foundry/|_next/static|_next/image|favicon.ico|robots.txt|fonts/|textures/).*)"],
};
