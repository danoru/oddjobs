import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";

// Everything is behind the table password except the door itself.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (await verifyToken(token)) {
    return NextResponse.next();
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|favicon.ico|fonts/|textures/).*)",
  ],
};
