/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Every other page is static, but the GM page reads content per request
  // (src/lib/content.ts keeps content out of tracing), so ship it explicitly.
  // The Foundry sync API reads content per request too.
  outputFileTracingIncludes: {
    "/[oneshot]/gm": ["./content/oneshots/**/*.json"],
    "/api/foundry/tables/[code]": ["./content/oneshots/**/*.json"],
    // Sealed letters resolve their text from content on each request.
    "/api/tables/[code]/letters": ["./content/oneshots/**/*.json"],
    // Drafting a cast sends the reference one-shot to Claude as a style guide.
    "/api/draft": ["./content/oneshots/the-drowned-bell/**/*.json"],
  },
};

export default nextConfig;
