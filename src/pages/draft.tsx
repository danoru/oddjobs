import Head from "next/head";
import { useState } from "react";
import type { GetServerSideProps } from "next";
import {
  Alert,
  Box,
  Button,
  Container,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { requestRole } from "@/lib/auth";
import type { Character, OneShot } from "@/lib/schema";
import { classLine } from "@/lib/derive";
import { SiteHeader } from "@/components/SiteHeader";
import { PosterIcon } from "@/components/PosterIcon";
import { tiltFor } from "@/components/board/Poster";
import b from "@/components/board/Board.module.css";

export const getServerSideProps: GetServerSideProps = async ({ req, resolvedUrl }) => {
  if ((await requestRole(req)) !== "gm") {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } };
  }
  return { props: {} };
};

type Result = { oneshot: OneShot; cast: Character[]; errors: string[]; model?: string };

/**
 * A cast from your pitch: Claude drafts the one-shot and its cast, the site's
 * own validator checks it, and the GM downloads it to import into content/.
 */
export default function DraftPage() {
  const [pitch, setPitch] = useState("");
  const [ruleset, setRuleset] = useState<"2014" | "2024">("2024");
  const [level, setLevel] = useState(4);
  const [castSize, setCastSize] = useState(5);
  const [tone, setTone] = useState("");
  const [setting, setSetting] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function draft(e: React.FormEvent) {
    e.preventDefault();
    if (pitch.trim().length < 10) return setError("Give it at least a sentence of pitch.");
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitch,
          ruleset,
          level,
          castSize,
          players: { min: Math.min(3, castSize), max: castSize },
          tone,
          setting,
        }),
      });
      const json = await res.json().catch(() => ({ error: "The tavern didn't answer. Try again." }));
      if (!res.ok) setError(json.error ?? "That didn't work. Try again.");
      else setResult(json as Result);
    } catch {
      setError("Couldn't reach the tavern. Try again.");
    }
    setBusy(false);
  }

  function download() {
    if (!result) return;
    const bundle = JSON.stringify({ oneshot: result.oneshot, cast: result.cast }, null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([bundle], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.oneshot.slug}.draft.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const field = { "& .MuiInputBase-root": { bgcolor: "rgba(0,0,0,0.15)" } };

  return (
    <>
      <Head>
        <title>Draft a cast · Tear-Off</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: "/", label: "the board" }} />
        <Box component="form" onSubmit={draft} sx={{ maxWidth: 720 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            A cast from your pitch
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Claude drafts the one-shot, its cast, their ties and secrets, letters and sounds. Tear-Off&apos;s own
            validator checks the rules before you see it. Drafting takes a few minutes.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Pitch"
              placeholder="A heist aboard a sky-whale on its last migration"
              multiline
              minRows={3}
              value={pitch}
              onChange={(e) => {
                setPitch(e.target.value);
                setError(null);
              }}
              slotProps={{ htmlInput: { maxLength: 1200 } }}
              sx={field}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select label="Rules" value={ruleset} onChange={(e) => setRuleset(e.target.value as "2014" | "2024")} sx={{ minWidth: 120, ...field }}>
                <MenuItem value="2024">2024</MenuItem>
                <MenuItem value="2014">2014</MenuItem>
              </TextField>
              <TextField
                label="Level"
                type="number"
                value={level}
                onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                sx={{ width: 110, ...field }}
              />
              <TextField
                label="Characters"
                type="number"
                value={castSize}
                onChange={(e) => setCastSize(Math.max(3, Math.min(7, Number(e.target.value) || 3)))}
                sx={{ width: 130, ...field }}
              />
              <TextField label="Tone" placeholder="heist, wonder, bittersweet" value={tone} onChange={(e) => setTone(e.target.value)} sx={{ flex: 1, ...field }} />
            </Stack>
            <TextField label="Setting (optional)" placeholder="Leave blank for setting-agnostic" value={setting} onChange={(e) => setSetting(e.target.value)} sx={field} />
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Button type="submit" variant="contained" color="secondary" startIcon={<AutoAwesomeIcon />} disabled={busy}>
                {busy ? "Drafting…" : "Draft the cast"}
              </Button>
            </Box>
            {busy && <LinearProgress />}
          </Stack>
        </Box>

        {result && (
          <Box sx={{ mt: 5 }}>
            {result.errors.length > 0 ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                The validator still has {result.errors.length} problem{result.errors.length === 1 ? "" : "s"} to fix by
                hand before this can be posted:
                <ul style={{ margin: "6px 0 0" }}>
                  {result.errors.slice(0, 12).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert severity="success" sx={{ mb: 2 }}>
                Passes every check the build runs. Review the mechanics and story, then import it.
              </Alert>
            )}
            <div className={b.frame}>
              <div className={b.note} style={{ ["--tilt" as string]: "-0.5deg", marginBottom: 28 }}>
                <span className={b.brassPin} aria-hidden="true" />
                <div className={b.postingHeader}>{result.oneshot.posting?.header}</div>
                <h2 className={b.postingTitle}>{result.oneshot.title}</h2>
                <p className={b.postingPitch}>{result.oneshot.premise}</p>
              </div>
              <div className={b.grid}>
                {result.cast.map((c) => (
                  <article key={c.id} className={b.poster} style={{ ["--tilt" as string]: `${tiltFor(c.id)}deg`, paddingBottom: 14 }}>
                    <span className={b.pin} aria-hidden="true" />
                    <div className={b.posterHeader}>{c.poster.header}</div>
                    <div className={b.engraving}>
                      <PosterIcon icon={c.poster.icon} size={72} />
                    </div>
                    <div className={b.posterName}>{c.poster.alias ?? c.name}</div>
                    <div className={b.posterEpithet}>{c.poster.epithet}</div>
                    <p className={b.posterHook}>{c.poster.hook}</p>
                    <div className={b.posterTag}>{classLine(c)}</div>
                  </article>
                ))}
              </div>
            </div>
            <Stack direction="row" spacing={2} sx={{ mt: 3, alignItems: "center", flexWrap: "wrap" }} useFlexGap>
              <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={download}>
                Download draft
              </Button>
              <Typography color="text.secondary">
                Then run <code>pnpm import-draft {result.oneshot.slug}.draft.json</code> in the repo and commit.
              </Typography>
            </Stack>
          </Box>
        )}
      </Container>
    </>
  );
}
