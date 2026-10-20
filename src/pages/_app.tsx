import type { AppProps } from "next/app";
import Head from "next/head";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "@/lib/theme";
import { GmBar } from "@/components/GmBar";
import "@/styles/globals.css";

type OneShotLike = { slug?: string; title?: string; system?: string };

/** The one-shot a page is about, for the GM bar: player and GM pages pass `os`; the builder passes its draft. */
function oneShotOf(props: unknown): OneShotLike | undefined {
  const p = props as { os?: OneShotLike; initial?: { oneshot?: OneShotLike } };
  return p.os ?? p.initial?.oneshot;
}

// Emotion zero-config SSR — see pyrosi-retrospective: the material-nextjs
// adapter duplicates Emotion instances under pnpm and breaks hydration.
export default function App({ Component, pageProps, router }: AppProps) {
  return (
    <>
      <Head>
        <title>Tear-Off</title>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {/* First on every page, ahead of the GM bar: every page's main content is #main. */}
        {router.pathname !== "/login" && (
          <a href="#main" className="skip-link">
            Skip to the page
          </a>
        )}
        <GmBar os={oneShotOf(pageProps)} />
        <Component {...pageProps} />
      </ThemeProvider>
    </>
  );
}
