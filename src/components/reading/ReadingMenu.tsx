import { useState } from "react";
import { Button, Checkbox, FormControlLabel, FormGroup, Popover, Typography } from "@mui/material";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import { anyReading, READING_LABELS, READING_MODES } from "@/lib/reading";
import { useReading } from "@/lib/storage";

/** The "Reading" button: large print, high contrast and dyslexia-friendly sheets, remembered on this device. */
export function ReadingMenu() {
  const { reading, setMode } = useReading();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const on = anyReading(reading);

  return (
    <>
      <Button
        size="small"
        startIcon={<TextFieldsIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        sx={{ color: on ? "primary.main" : "text.secondary" }}
      >
        Reading{on ? " (on)" : ""}
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { role: "dialog", "aria-label": "Reading options", sx: { p: 2, maxWidth: 320 } } }}
      >
        <Typography variant="h6" component="h2" sx={{ fontSize: 18, mb: 1 }}>
          How sheets read on this device
        </Typography>
        <FormGroup>
          {READING_MODES.map((m) => (
            <FormControlLabel
              key={m}
              control={<Checkbox checked={reading[m]} onChange={(e) => setMode(m, e.target.checked)} />}
              label={
                <span>
                  {READING_LABELS[m].label}
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
                    {READING_LABELS[m].hint}
                  </Typography>
                </span>
              }
              sx={{ alignItems: "flex-start", mb: 1, "& .MuiCheckbox-root": { pt: 0.25 } }}
            />
          ))}
        </FormGroup>
        <Typography variant="body2" color="text.secondary">
          Applies to sheets, printing, cards and tents.
        </Typography>
      </Popover>
    </>
  );
}
