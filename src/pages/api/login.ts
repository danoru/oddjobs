import type { NextApiRequest, NextApiResponse } from "next";
import { createToken, roleForPassword, AUTH_COOKIE } from "@/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { password } = req.body as { password?: string };
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: "APP_PASSWORD not configured" });
  }
  const role = roleForPassword(password);
  if (!role) {
    return res.status(401).json({ error: "Wrong password" });
  }
  const token = await createToken(role);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`,
  );
  return res.status(200).json({ ok: true, role });
}
