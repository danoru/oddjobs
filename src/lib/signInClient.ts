/**
 * Signing in from the browser, through Auth.js's credentials route: its CSRF
 * token, then the form post, as next-auth/react's signIn() does. That one
 * reads Auth.js's answer with `new URL(url)`, which throws when the answer is
 * our own relative /login (a wrong password, the rate limit), so every
 * failure looked alike; this reads it against the page's own address.
 */
export type SignInResult = { ok: true } | { ok: false; code: "rate_limited" | "credentials" | "error" };

export async function signInWithPassword(username: string, password: string): Promise<SignInResult> {
  try {
    const { csrfToken } = (await (await fetch("/api/auth/csrf", { cache: "no-store" })).json()) as { csrfToken: string };
    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ username, password, csrfToken, callbackUrl: `${window.location.origin}/board` }),
    });
    const { url } = (await res.json()) as { url?: string };
    const answer = new URL(url ?? "/login?error=Configuration", window.location.origin);
    const error = answer.searchParams.get("error");
    if (res.ok && !error) return { ok: true };
    return { ok: false, code: answer.searchParams.get("code") === "rate_limited" ? "rate_limited" : error === "CredentialsSignin" ? "credentials" : "error" };
  } catch {
    return { ok: false, code: "error" };
  }
}
