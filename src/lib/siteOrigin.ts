/**
 * The site's own address, for absolute links (link-preview images must be
 * absolute). From the request when there is one; otherwise, at build time,
 * SITE_URL if set, then Vercel's production domain, then localhost.
 */
export function siteOrigin(req?: { headers: Record<string, string | string[] | undefined> }, env: Partial<Record<string, string>> = process.env): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0].trim();
  if (req) {
    const host = one(req.headers["x-forwarded-host"]) ?? one(req.headers.host);
    if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
      const proto = one(req.headers["x-forwarded-proto"]) ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https");
      return `${proto === "http" ? "http" : "https"}://${host}`;
    }
  }
  if (env.SITE_URL) return env.SITE_URL.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3004";
}
