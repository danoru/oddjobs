import Link from "next/link";
import { useState } from "react";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import type { useClaims } from "@/lib/storage";
import s from "./Board.module.css";

const field = {
  "& .MuiInputBase-root": { color: "var(--ink)", fontFamily: "var(--font-print)" },
  "& .MuiInputLabel-root": { color: "var(--ink-soft)" },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--ink-soft)" },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--wax)", borderWidth: 3 },
  "& .MuiInputLabel-root.Mui-focused": { color: "var(--wax)" },
};

/**
 * Join the GM's table so everyone sees who tore what, or show which table
 * you're at. `initialCode` comes from a `?table=` link.
 */
export function TableNote({
  claims,
  initialCode,
}: {
  claims: ReturnType<typeof useClaims>;
  initialCode?: string;
}) {
  const { table, player, error, join, leave } = claims;
  // null until typed in, so a link's code and a remembered name show up once
  // the router and storage are read, without wiping what's been typed.
  const [typedCode, setCode] = useState<string | null>(null);
  const [typedName, setName] = useState<string | null>(null);
  const code = typedCode ?? initialCode?.toUpperCase() ?? "";
  const name = typedName ?? player?.name ?? "";
  const [problem, setProblem] = useState<{ error: string; oneshot?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(await join(table ?? code, name));
    setBusy(false);
  }

  const atTable = table && player;

  return (
    <div className={`${s.note} no-print`} data-part="note" style={{ ["--tilt" as string]: "0.4deg", marginBottom: 32 }}>
      <span className={s.pin} data-part="pin" aria-hidden="true" />
      {atTable ? (
        <Box sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 16px" }}>
          <p className={s.noteTitle} data-part="noteTitle" style={{ margin: 0 }}>
            Table {table}
          </p>
          <Typography sx={{ fontFamily: "var(--font-print)", fontSize: 17 }}>
            You&apos;re {player.name}. Tear a poster and it&apos;s gone for everyone at this table.
          </Typography>
          <Button size="small" onClick={leave} sx={{ color: "var(--ink-soft)", ml: "auto" }}>
            Leave table
          </Button>
        </Box>
      ) : (
        <Box component="form" onSubmit={submit}>
          <p className={s.noteTitle} data-part="noteTitle">{table ? `Table ${table}` : "Playing at a table?"}</p>
          <Typography sx={{ fontFamily: "var(--font-print)", fontSize: 16, mb: 1.5 }}>
            {table
              ? "Give the table your name before you tear a poster."
              : "Join with the GM's table code and everyone sees who's torn what. Without one, claims stay on this device."}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {!table && (
              <TextField
                size="small"
                label="Table code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                slotProps={{ htmlInput: { maxLength: 7, autoCapitalize: "characters", spellCheck: false } }}
                sx={{ ...field, width: 130 }}
              />
            )}
            <TextField
              size="small"
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 40 } }}
              sx={{ ...field, width: 200 }}
            />
            <Button type="submit" variant="contained" color="secondary" disabled={busy}>
              {table ? "Sit down" : "Join table"}
            </Button>
            {table && (
              <Button size="small" onClick={leave} sx={{ color: "var(--ink-soft)" }}>
                Leave table
              </Button>
            )}
          </Box>
        </Box>
      )}
      {problem && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {problem.error}{" "}
          {problem.oneshot && (
            <Link href={`/${problem.oneshot}?table=${encodeURIComponent(code)}`}>Go to that one-shot</Link>
          )}
        </Alert>
      )}
      {error && (
        <Alert severity="warning" sx={{ mt: 1.5 }} onClose={claims.clearError}>
          {error}
        </Alert>
      )}
    </div>
  );
}
