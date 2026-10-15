import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Character } from "@/lib/schema";
import { WoodcutPicker } from "./WoodcutPicker";
import { defaultChoiceId, emptyTweaks, encodeTweaks, hasTweaks, tweaksSchema, type Tweaks } from "@/lib/customize";

export function CustomizeDrawer({
  open,
  onClose,
  stock,
  tweaks,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  stock: Character;
  tweaks: Tweaks;
  onChange: (t: Tweaks) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);

  const set = (patch: Partial<Tweaks>) => onChange({ ...tweaks, ...patch });
  const text = (key: "name" | "pronouns" | "appearance") => (e: React.ChangeEvent<HTMLInputElement>) =>
    set({ [key]: e.target.value || undefined });

  function setPortrait(v: string) {
    if (!v) {
      setPortraitError(null);
      return set({ portrait: undefined });
    }
    const ok = tweaksSchema.shape.portrait.safeParse(v).success;
    setPortraitError(ok ? null : "Use a full https:// image link.");
    if (ok) set({ portrait: v });
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#t=${encodeTweaks(tweaks)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 400 } } } }}>
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Make them yours
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Changes save on this device and flow into the printout and exports.
        </Typography>
        <Stack spacing={2}>
          <TextField label="Name" placeholder={stock.name} value={tweaks.name ?? ""} onChange={text("name")} fullWidth />
          <TextField
            label="Pronouns"
            placeholder={stock.story.pronouns}
            value={tweaks.pronouns ?? ""}
            onChange={text("pronouns")}
            fullWidth
          />
          <TextField
            label="Appearance"
            placeholder={stock.story.appearance}
            value={tweaks.appearance ?? ""}
            onChange={text("appearance")}
            multiline
            minRows={3}
            fullWidth
          />
          <WoodcutPicker value={tweaks.portraitData} onChange={(portraitData) => set({ portraitData })} />
          <TextField
            label="Portrait image link"
            placeholder="https://…"
            defaultValue={tweaks.portrait ?? ""}
            onBlur={(e) => setPortrait(e.target.value.trim())}
            error={Boolean(portraitError)}
            helperText={
              portraitError ??
              (tweaks.portraitData
                ? "Your woodcut portrait is in use. Remove it to show this link instead."
                : "Or link a picture. It is included in share links; uploaded portraits are not.")
            }
            fullWidth
          />
          {stock.options.map((opt) => (
            <FormControl key={opt.id} fullWidth>
              <InputLabel id={`opt-${opt.id}`}>{opt.label}</InputLabel>
              <Select
                labelId={`opt-${opt.id}`}
                label={opt.label}
                value={tweaks.choices[opt.id] ?? defaultChoiceId(stock, opt)}
                onChange={(e) => set({ choices: { ...tweaks.choices, [opt.id]: String(e.target.value) } })}
              >
                {opt.choices.map((ch) => (
                  <MenuItem key={ch.id} value={ch.id}>
                    {ch.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}
          {copied && <Alert severity="success">Link copied. Anyone at the table can open it.</Alert>}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={copyLink} disabled={!hasTweaks(tweaks)}>
              Copy share link
            </Button>
            <Button onClick={() => onChange(emptyTweaks())}>Reset to stock</Button>
          </Stack>
          <Button onClick={onClose} sx={{ alignSelf: "flex-start" }}>
            Done
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
