import type { AppProps } from "next/app";
import Head from "next/head";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "@/lib/theme";
import "@/styles/globals.css";

// Emotion zero-config SSR — see pyrosi-retrospective: the material-nextjs
// adapter duplicates Emotion instances under pnpm and breaks hydration.
export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Tear-Off</title>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </>
  );
}
