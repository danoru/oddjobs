import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import { safeNext } from "@/lib/accounts";
import { fullLoad } from "@/lib/fullLoad";
import { signInWithPassword } from "@/lib/signInClient";
import { Alert, DoorPage, Field, Seal, doorStyles as d } from "@/components/door/Door";

const NEED: Record<string, string> = {
  admin: "That page is for the tavern's admins. Sign in as one to open it.",
  author: "That page is for authors. Sign in as one, or ask an admin for the badge.",
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const need = typeof router.query.need === "string" ? NEED[router.query.need] : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signInWithPassword(username, password);
    if (r.ok) {
      fullLoad(safeNext(router.query.next));
      return;
    }
    setBusy(false);
    setError(
      r.code === "rate_limited"
        ? "Too many wrong words at the door. The barkeep will listen again in a few minutes."
        : r.code === "credentials"
          ? "The barkeep doesn't know that name and password. Try again."
          : "The door is stuck. Try again in a moment.",
    );
  }

  return (
    <>
      <Head>
        <title>Sign in · Oddjobs</title>
      </Head>
      <DoorPage header="At the door" title="Who goes there?" lede={need ?? "Sign in with your name on the board."}>
        <form className={d.form} onSubmit={submit} noValidate>
          <Field id="username" label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <Alert>{error}</Alert>}
          <div className={d.actions}>
            <Seal busy={busy}>Enter</Seal>
          </div>
        </form>
        <p className={d.small}>
          New here? You need an invite link from someone at the table. Forgot your password? Ask an admin for a reset link.
        </p>
      </DoorPage>
    </>
  );
}
