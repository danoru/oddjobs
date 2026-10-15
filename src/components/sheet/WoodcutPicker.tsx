import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { PORTRAIT_DATA_MAX } from "@/lib/customize";
import { MAX_UPLOAD_BYTES, loadImageFile, woodcutDataUrl } from "@/lib/woodcut";
import s from "./WoodcutPicker.module.css";

/**
 * Turn an uploaded photo into a woodcut portrait. Everything happens in this browser tab:
 * the file is decoded to a canvas, engraved by `woodcutDataUrl`, and the result is handed to
 * `onChange` as a small data URL. Nothing is uploaded anywhere.
 */
export function WoodcutPicker({
  value,
  onChange,
}: {
  /** The portrait currently in use (a woodcut data URL), if any. */
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The "before" preview is an object URL: free it when it is replaced and on unmount.
  useEffect(() => {
    return () => {
      if (before) URL.revokeObjectURL(before);
    };
  }, [before]);

  function discard() {
    setBefore(null);
    setAfter(null);
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file) return;
    discard();
    setError(null);
    if (!file.type.startsWith("image/")) return setError("That doesn't look like an image.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("That file is over 10 MB. Pick a smaller photo.");
    setBusy(true);
    try {
      const source = await loadImageFile(file);
      // Let the "working" state paint before the pixel loop blocks the thread.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const url = woodcutDataUrl(source);
      if ("close" in source) source.close();
      if (url.length > PORTRAIT_DATA_MAX) {
        setError("That came out too detailed to save. Try a simpler photo.");
        return;
      }
      setBefore(URL.createObjectURL(file));
      setAfter(url);
    } catch {
      setError("Couldn't read that image. Try a JPEG, PNG or WebP.");
    } finally {
      setBusy(false);
    }
  }

  function use() {
    if (!after) return;
    onChange(after);
    discard();
  }

  function remove() {
    discard();
    setError(null);
    onChange(undefined);
  }

  const pending = Boolean(before && after);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Woodcut portrait</Typography>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={pick}
        className={s.hidden}
        aria-label="Upload a photo"
        data-testid="woodcut-file"
      />

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {busy && <div className={s.working}>Carving…</div>}

      {pending && (
        <div className={s.pair}>
          <figure className={s.frame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={before!} alt="Your photo" className={s.plate} />
            <figcaption>Your photo</figcaption>
          </figure>
          <figure className={s.frame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={after!} alt="Woodcut version" className={`${s.plate} ${s.woodcut}`} />
            <figcaption>Woodcut</figcaption>
          </figure>
        </div>
      )}

      {!pending && !busy && value && (
        <figure className={s.frame} style={{ maxWidth: 160 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Current woodcut portrait" className={`${s.plate} ${s.woodcut}`} />
          <figcaption>On the poster now</figcaption>
        </figure>
      )}

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {pending && (
          <Button variant="contained" onClick={use}>
            Use this portrait
          </Button>
        )}
        <Button variant={pending ? "text" : "outlined"} onClick={() => inputRef.current?.click()} disabled={busy}>
          {pending ? "Try another photo" : "Upload a photo"}
        </Button>
        {(value || pending) && (
          <Button color="inherit" onClick={pending ? discard : remove}>
            {pending ? "Cancel" : "Remove"}
          </Button>
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Photos are engraved on this device and never uploaded. Up to 10 MB.
      </Typography>
    </Stack>
  );
}
