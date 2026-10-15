import type { NextApiRequest, NextApiResponse } from "next";
import { AUTH_COOKIE } from "@/lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  res.redirect(303, "/login");
}
