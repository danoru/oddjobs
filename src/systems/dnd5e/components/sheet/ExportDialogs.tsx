import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from "@mui/material";
import type { Character, Ruleset } from "@/systems/dnd5e/schema";
import { ddbRecipe, recipeText } from "@/systems/dnd5e/export/ddb";
import { FOUNDRY_EXPORT_VERSION, foundryActor, foundryFilename } from "@/systems/dnd5e/export/foundry";

export function RecipeDialog({
  open,
  onClose,
  c,
  ruleset,
}: {
  open: boolean;
  onClose: () => void;
  c: Character;
  ruleset: Ruleset;
}) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const steps = ddbRecipe(c, ruleset);

  async function copy() {
    try {
      await navigator.clipboard.writeText(recipeText(c, ruleset));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Build {c.name} in D&amp;D Beyond</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          D&amp;D Beyond can&apos;t import characters, so here&apos;s the build, step by step. It takes about two
          minutes.
        </Typography>
        {steps.map((step, i) => (
          <div key={step.title} style={{ marginBottom: 14 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={Boolean(done[step.title])}
                  onChange={(e) => setDone({ ...done, [step.title]: e.target.checked })}
                />
              }
              label={
                <Typography variant="h6" component="span">
                  {i + 1}. {step.title}
                </Typography>
              }
            />
            <ul style={{ margin: "0 0 0 34px", paddingLeft: 18 }}>
              {step.items.map((it) => (
                <li key={it}>
                  <Typography variant="body2">{it}</Typography>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {copied && <Alert severity="success">Recipe copied as text.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={copy}>Copy as text</Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function FoundryDialog({
  open,
  onClose,
  c,
  oneshot,
}: {
  open: boolean;
  onClose: () => void;
  c: Character;
  oneshot: { slug: string; title: string; ruleset: Ruleset };
}) {
  function download() {
    const json = JSON.stringify(foundryActor(c, oneshot), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = foundryFilename(c);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send {c.name} to Foundry</DialogTitle>
      <DialogContent dividers>
        <ol style={{ marginTop: 0, paddingLeft: 20 }}>
          <li>Download the actor file below.</li>
          <li>In Foundry, create a blank Character actor (any name).</li>
          <li>Right-click it in the Actors sidebar → Import Data → choose the file → Import.</li>
        </ol>
        <Alert severity="info">
          Beta ({FOUNDRY_EXPORT_VERSION}): stats, proficiencies, HP, AC, spell slots, features, weapons and spells
          come across. Features and spells arrive as text rather than full compendium items for now.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={download}>
          Download actor JSON
        </Button>
      </DialogActions>
    </Dialog>
  );
}
