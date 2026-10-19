/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Every other page is static, but the GM page reads content per request
  // (src/lib/content.ts keeps content out of tracing), so ship it explicitly.
  // The Foundry sync API reads content per request too. Loading a one-shot also
  // reads the spell book (every spell must have card text), so ship that as well.
  // Keys are globs, so a [param] segment is written as * ("[oneshot]" would be a character class).
  outputFileTracingIncludes: {
    "/*/gm": ["./content/**/*.json"],
    // The Ten Candles table kit is GM-only too (it carries the module).
    "/*/kit": ["./content/**/*.json"],
    "/api/foundry/tables/*": ["./content/**/*.json"],
    // Sealed letters resolve their text from content on each request.
    "/api/tables/*/letters": ["./content/**/*.json"],
    // Live table play finds the one-shot's system (and a module's intro) in content.
    "/api/tables/*/game": ["./content/**/*.json"],
    // The builder reads (and, locally, writes) content per request; deployed it's read-only.
    "/admin": ["./content/**/*.json"],
    "/admin/**/*": ["./content/**/*.json"],
    "/api/admin/**/*": ["./content/**/*.json"],
  },
};

export default nextConfig;
