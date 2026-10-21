import type { NextApiRequest, NextApiResponse } from "next";
import { AccountError } from "./users.server";

/** Account errors become their HTTP answer (with the form field they belong to); anything else is a 500. */
export function sendAccountError(res: NextApiResponse, e: unknown) {
  if (e instanceof AccountError) return res.status(e.status).json({ error: e.message, field: e.field });
  console.error("[accounts]", e);
  return res.status(500).json({ error: "Something went wrong at the door" });
}

/** Only these methods; answers 405 itself otherwise. */
export function allow(req: NextApiRequest, res: NextApiResponse, methods: string[]): boolean {
  res.setHeader("Cache-Control", "private, no-store");
  if (methods.includes(req.method ?? "")) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

/** The body as an object, whatever came in. */
export const bodyOf = (req: NextApiRequest): Record<string, unknown> =>
  req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
