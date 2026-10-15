import { useState } from "react";
import { useRouter } from "next/router";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forGm = typeof router.query.next === "string" && /^\/[^/]+\/gm\/?$/.test(router.query.next.split("?")[0]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      const next = typeof router.query.next === "string" ? router.query.next : "/";
      // Same-site paths only: "//host" and "/\host" would leave the site.
      router.push(/^\/(?![/\\])/.test(next) ? next : "/");
    } else {
      setError("The barkeep shakes their head. Try again.");
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
      <Box
        component="form"
        onSubmit={submit}
        sx={{
          width: "100%",
          maxWidth: 360,
          p: 4,
          bgcolor: "var(--parchment)",
          color: "var(--ink)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
          transform: "rotate(-1deg)",
        }}
      >
        <Stack spacing={2}>
          <Typography variant="h2" align="center" sx={{ fontSize: 34, color: "var(--wax)" }}>
            Tear-Off
          </Typography>
          <Typography align="center" sx={{ fontFamily: "var(--font-print)", fontSize: 18 }}>
            {forGm ? "Only the GM goes behind the screen. Speak the GM's word." : "Speak the word at the door."}
          </Typography>
          <TextField
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            fullWidth
            sx={{
              "& .MuiInputBase-root": { color: "var(--ink)" },
              "& .MuiInputLabel-root": { color: "var(--ink-soft)" },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--ink-soft)" },
            }}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" color="secondary" disabled={busy}>
            Enter the tavern
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
