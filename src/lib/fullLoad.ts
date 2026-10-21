/**
 * Goes to a page with a full load instead of Next's client-side navigation:
 * after signing in or out, or when a session has ended, so every request
 * (and the GM bar's /api/whoami) sees the new session cookie.
 */
export function fullLoad(path: string): void {
  window.location.assign(path);
}
