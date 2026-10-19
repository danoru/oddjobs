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
import { loadOneShot, publishedSlugs } from "@/lib/content";
import { toPublic, type PublicAnyOneShot } from "@/lib/public";
import { FATE_LABEL, FATES, type Fate } from "@/lib/legacy";
import { emptyEpilogue, survivorsFrom, useEpilogue } from "@/lib/epilogue";
import { SiteHeader } from "@/components/SiteHeader";
import { Gazette, type EpilogueEntry } from "@/components/gazette/Gazette";

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: publishedSlugs().map((oneshot) => ({ params: { oneshot } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ os: PublicAnyOneShot }> = async ({ params }) => ({
  props: { os: toPublic(loadOneShot(String(params!.oneshot))) },
});

/**
 * After the session: each character gets a fate and one line for the paper.
 * That prints as a broadsheet keepsake, and the record joins the shared world
 * so survivors can turn up in later one-shots.
 */
export default function EpiloguePage({ os }: { os: PublicAnyOneShot }) {
  const { ep, setEp } = useEpilogue(os.slug);
  const setEntry = (id: string, patch: Partial<EpilogueEntry>) =>
    setEp({ ...ep, entries: { ...ep.entries, [id]: { ...ep.entries[id], ...patch } } });
  const records = survivorsFrom(os, ep);

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
        <title>{`Epilogue · ${os.title} · Tear-Off`}</title>
      </Head>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <SiteHeader back={{ href: `/${os.slug}`, label: os.title }} />
        {/* Where the header's skip link lands. */}
        <div id="main" tabIndex={-1} />
        <Box
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
              Give each character a fate and one line for the paper. It saves on this device as you type.
            </Typography>
            <Stack spacing={2}>
              <TextField label="Headline" placeholder="BELL RINGS AGAIN; STORM BROKEN" value={ep.headline} onChange={(e) => setEp({ ...ep, headline: e.target.value })} sx={field} />
              <TextField label="Subhead" placeholder="Five row out at midnight; four row back" value={ep.subhead} onChange={(e) => setEp({ ...ep, subhead: e.target.value })} sx={field} />
              <TextField label="What happened" multiline minRows={3} value={ep.lead} onChange={(e) => setEp({ ...ep, lead: e.target.value })} sx={field} />
              <TextField
                label="Game night"
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
                    <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
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
                        <TextField size="small" label="Played by" value={e.playedBy ?? ""} onChange={(ev) => setEntry(c.id, { playedBy: ev.target.value })} sx={{ flex: 1, ...field }} />
                      </Stack>
                      <TextField size="small" label="Their line for the paper" multiline value={e.line ?? ""} onChange={(ev) => setEntry(c.id, { line: ev.target.value })} slotProps={{ htmlInput: { maxLength: 280 } }} sx={field} />
                      <Stack direction="row" spacing={1}>
                        <TextField size="small" label="Title earned" placeholder="Bell-thief" value={e.title ?? ""} onChange={(ev) => setEntry(c.id, { title: ev.target.value })} slotProps={{ htmlInput: { maxLength: 60 } }} sx={{ flex: 1, ...field }} />
                        <TextField size="small" label="Scar" placeholder="rope-burned palms" value={e.scar ?? ""} onChange={(ev) => setEntry(c.id, { scar: ev.target.value })} slotProps={{ htmlInput: { maxLength: 140 } }} sx={{ flex: 1, ...field }} />
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                  Print the paper
                </Button>
                <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={download} disabled={records.length === 0}>
                  Save to the shared world
                </Button>
                <Button onClick={() => setEp(emptyEpilogue())} sx={{ color: "text.secondary" }}>
                  Clear
                </Button>
              </Stack>
              <Alert severity="info">
                &ldquo;Save to the shared world&rdquo; downloads {records.length} record{records.length === 1 ? "" : "s"}. Add the file to{" "}
                <code>content/legacy/</code> and survivors start turning up as cameos on other one-shots.
              </Alert>
            </Stack>
          </Box>
          <Gazette os={os} ep={ep} />
        </Box>
      </Container>
    </>
  );
}
