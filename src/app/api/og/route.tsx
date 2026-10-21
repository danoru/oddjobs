import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Link-preview images (Open Graph), drawn with next/og: a parchment notice
 * pinned to the cork board, so the landing page and invite links unfurl in
 * Discord as a poster card. Public (Discord isn't signed in), so it only
 * ever draws fixed words: no one-shot, no name, nothing from the database.
 *
 *   /api/og                 the landing page
 *   /api/og?card=invite     an invite link
 *
 * Fonts: Rye and IM Fell English (SIL Open Font License, ./fonts).
 */
export const runtime = "nodejs";

const CARDS = {
  landing: { header: "Help wanted", title: "Odd jobs for one night", line: "Pick a job · Tear a poster · Play tonight · Keep the scar", seal: "OJ" },
  invite: { header: "Hands wanted", title: "You're invited to the board", line: "Put your name down, tear a poster, play tonight", seal: "OJ" },
} as const;

let fonts: Promise<{ name: string; data: Buffer; style: "normal"; weight: 400 }[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all(
    [
      ["Rye", "rye.woff"],
      ["IM Fell English", "im-fell-english.woff"],
    ].map(async ([name, file]) => ({
      name,
      data: await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "src", "app", "api", "og", "fonts", file)),
      style: "normal" as const,
      weight: 400 as const,
    })),
  ));

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("card") === "invite" ? "invite" : "landing";
  const card = CARDS[kind];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 20%, #b9844b, #a8743f 45%, #7d5229)",
          border: "22px solid #4a2e18",
        }}
      >
        {/* The hanging sign */}
        <div
          style={{
            position: "absolute",
            top: 26,
            left: 40,
            display: "flex",
            padding: "8px 26px",
            fontFamily: "Rye",
            fontSize: 44,
            color: "#d2a85a",
            background: "linear-gradient(180deg, #4a2e18, #35200f)",
            border: "4px solid #6b4425",
            boxShadow: "0 8px 18px rgba(0,0,0,0.5)",
          }}
        >
          Oddjobs
        </div>
        {/* The notice */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 760,
            padding: "54px 56px 46px",
            background: "linear-gradient(180deg, #f6ecd3, #f3e7cb 60%, #e9d8b0)",
            color: "#2b1d0e",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
            transform: "rotate(-2deg)",
            marginTop: 40,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 370,
              width: 26,
              height: 26,
              borderRadius: 13,
              background: "radial-gradient(circle at 35% 30%, #fff1c8, #d2a85a 45%, #6e4f17)",
            }}
          />
          <div style={{ fontFamily: "IM Fell English", fontSize: 26, letterSpacing: 8, textTransform: "uppercase", color: "#5b4426", borderBottom: "2px solid #5b4426", paddingBottom: 6 }}>
            {card.header}
          </div>
          <div style={{ fontFamily: "Rye", fontSize: 64, lineHeight: 1.1, textAlign: "center", marginTop: 22 }}>{card.title}</div>
          <div style={{ fontFamily: "IM Fell English", fontSize: 30, textAlign: "center", marginTop: 20, color: "#2b1d0e" }}>{card.line}</div>
        </div>
        {/* The wax seal */}
        <div
          style={{
            position: "absolute",
            right: 120,
            bottom: 70,
            width: 130,
            height: 130,
            borderRadius: 65,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Rye",
            fontSize: 42,
            color: "#fbe9dc",
            background: "radial-gradient(circle at 35% 30%, #d4553f, #9e2f22 55%, #6c1d14)",
            boxShadow: "0 8px 16px rgba(0,0,0,0.45)",
            transform: "rotate(-12deg)",
          }}
        >
          {card.seal}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: await loadFonts(),
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
