import Head from "next/head";
import type { GetStaticPaths, GetStaticProps } from "next";
import {
  Alert,
  Box,
  Button,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PublicIcon from "@mui/icons-material/Public";
import { useState } from "react";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { FATE_LABEL, FATES, type Fate } from "@/lib/legacy";
import { emptyEpilogue, survivorsFrom, useSharedEpilogue } from "@/lib/epilogue";
import { usePlayer, useTableCode } from "@/lib/storage";
import { SiteHeader } from "@/components/SiteHeader";
import { Gazette, type EpilogueEntry } from "@/components/gazette/Gazette";
import { publishedPaths, withPublished } from "@/lib/published";
import { storeKind, type StoreKind } from "@/lib/store/kind";

export const getStaticPaths: GetStaticPaths = publishedPaths();

type Props = { os: PublicAnyOneShot; sharedWorld: StoreKind };

export const getStaticProps: GetStaticProps<Props> = withPublished((os) => ({
  props: { os: toPublic(os), sharedWorld: storeKind() },
}));

/**
 * After the session: each character gets a fate and one line for the paper.
 * That prints as a broadsheet keepsake, and the record joins the shared world
 * so survivors can turn up in later one-shots: saved straight to the database
 * (GM only) when the content lives there, or downloaded as a file for
 * content/legacy/ when it's in git.
 */
export default function EpiloguePage({ os, sharedWorld }: Props) {
  const code = useTableCode(os.slug);
  const player = usePlayer();
  const { ep, setEp, canEdit, shared, saved } = useSharedEpilogue(os.slug, code, player?.id ?? null);
  const all = canEdit === "all";
  const mayWrite = (id: string) => all || canEdit.includes(id);
  const setEntry = (id: string, patch: Partial<EpilogueEntry>) =>
    setEp({ ...ep, entries: { ...ep.entries, [id]: { ...ep.entries[id], ...patch } } });
  const records = survivorsFrom(os, ep);
  const [world, setWorld] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  async function saveToWorld() {
    setWorld({ kind: "info", text: "Saving…" });
    try {
      const r = await fetch("/api/admin/survivors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string; saved?: string[]; skipped?: string[] };
      if (r.status === 403 && !body.error?.includes("content/legacy")) return setWorld({ kind: "error", text: "Only the GM can save to the shared world." });
      if (!r.ok) return setWorld({ kind: "error", text: body.error ?? `Saving failed (${r.status})` });
      const n = body.saved?.length ?? 0;
      setWorld({
        kind: "success",
        text: n
          ? `Saved ${n} record${n === 1 ? "" : "s"} to the shared world. Survivors are on the board and turn up as cameos on other one-shots.`
          : "The shared world already had these records.",
      });
    } catch (e) {
      setWorld({ kind: "error", text: (e as Error).message });
    }
  }

  function download() {
    const json = JSON.stringify(records, null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${os.slug}-${ep.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const field = { "& .MuiInputBase-root": { bgcolor: "rgba(0,0,0,0.15)" } };

  return (
    <>
      <Head>
        <title>{`Epilogue · ${os.title} · Oddjobs`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 380px) minmax(0, 1fr)" },
            gap: 4,
            alignItems: "start",
          }}
        >
          <Box className="no-print">
            <Typography variant="h4" component="h1" gutterBottom>
              The morning after
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {shared
                ? all
                  ? `Give each character a fate and one line for the paper. It's kept with table ${code}, so the chronicle can bind it. Players can write their own lines from their phones.`
                  : `Write your character's line for the paper; the GM sets the rest. It's kept with table ${code}.`
                : "Give each character a fate and one line for the paper. It saves on this device as you type."}
              {saved && (
                <span style={{ display: "block", fontSize: 13 }} role="status">
                  {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved with the table." : "Couldn't save; will retry when you type."}
                </span>
              )}
            </Typography>
            <Stack spacing={2}>
              <TextField label="Headline" disabled={!all} placeholder="BELL RINGS AGAIN; STORM BROKEN" value={ep.headline} onChange={(e) => setEp({ ...ep, headline: e.target.value })} sx={field} />
              <TextField label="Subhead" disabled={!all} placeholder="Five row out at midnight; four row back" value={ep.subhead} onChange={(e) => setEp({ ...ep, subhead: e.target.value })} sx={field} />
              <TextField label="What happened" disabled={!all} multiline minRows={3} value={ep.lead} onChange={(e) => setEp({ ...ep, lead: e.target.value })} sx={field} />
              <TextField
                label="Game night" disabled={!all}
                type="date"
                value={ep.date}
                onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setEp({ ...ep, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={field}
              />
              {os.cast.map((c) => {
                const e = ep.entries[c.id] ?? {};
                return (
                  <Box key={c.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
                    <Typography variant="h6" component="h2" sx={{ lineHeight: 1.2 }}>
                      {c.name}{" "}
                      <Typography component="span" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        {c.poster.epithet}
                      </Typography>
                    </Typography>
                    <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          select
                          size="small"
                          label="Fate"
                          disabled={!all}
                          value={e.fate ?? ""}
                          onChange={(ev) => setEntry(c.id, { fate: (ev.target.value || undefined) as Fate | undefined })}
                          sx={{ minWidth: 150, ...field }}
                        >
                          <MenuItem value="">Not played</MenuItem>
                          {FATES.map((f) => (
                            <MenuItem key={f} value={f}>
                              {FATE_LABEL[f]}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField size="small" label="Played by" disabled={!mayWrite(c.id)} value={e.playedBy ?? ""} onChange={(ev) => setEntry(c.id, { playedBy: ev.target.value })} sx={{ flex: 1, ...field }} />
                      </Stack>
                      <TextField size="small" label="Their line for the paper" disabled={!mayWrite(c.id)} multiline value={e.line ?? ""} onChange={(ev) => setEntry(c.id, { line: ev.target.value })} slotProps={{ htmlInput: { maxLength: 280 } }} sx={field} />
                      <Stack direction="row" spacing={1}>
                        <TextField size="small" label="Title earned" disabled={!all} placeholder="Bell-thief" value={e.title ?? ""} onChange={(ev) => setEntry(c.id, { title: ev.target.value })} slotProps={{ htmlInput: { maxLength: 60 } }} sx={{ flex: 1, ...field }} />
                        <TextField size="small" label="Scar" disabled={!all} placeholder="rope-burned palms" value={e.scar ?? ""} onChange={(ev) => setEntry(c.id, { scar: ev.target.value })} slotProps={{ htmlInput: { maxLength: 140 } }} sx={{ flex: 1, ...field }} />
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                  Print the paper
                </Button>
                {sharedWorld === "db" ? (
                  <>
                    <Button variant="outlined" startIcon={<PublicIcon />} onClick={() => void saveToWorld()} disabled={records.length === 0 || world?.text === "Saving…"}>
                      Save to the shared world
                    </Button>
                    <Button startIcon={<FileDownloadIcon />} onClick={download} disabled={records.length === 0} sx={{ color: "text.secondary" }}>
                      Download
                    </Button>
                  </>
                ) : (
                  <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={download} disabled={records.length === 0}>
                    Save to the shared world
                  </Button>
                )}
                <Button onClick={() => setEp(emptyEpilogue())} disabled={!all} sx={{ color: "text.secondary" }}>
                  Clear
                </Button>
              </Stack>
              {world ? (
                <Alert severity={world.kind} role="status" onClose={() => setWorld(null)}>
                  {world.text}
                </Alert>
              ) : sharedWorld === "db" ? (
                <Alert severity="info">
                  &ldquo;Save to the shared world&rdquo; (GM only) adds {records.length} record{records.length === 1 ? "" : "s"} to the shared
                  world, and survivors start turning up on the board and as cameos on other one-shots.
                </Alert>
              ) : (
                <Alert severity="info">
                  &ldquo;Save to the shared world&rdquo; downloads {records.length} record{records.length === 1 ? "" : "s"}. Add the file to{" "}
                  <code>content/legacy/</code> and survivors start turning up as cameos on other one-shots.
                </Alert>
              )}
            </Stack>
          </Box>
          <Gazette os={os} ep={ep} />
        </Box>
      </Container>
    </>
  );
}
