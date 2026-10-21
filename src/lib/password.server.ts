import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing: argon2id with @node-rs/argon2's defaults (19 MiB, two
 * passes, one lane: OWASP's minimum for argon2id), so a stolen table of
 * hashes is slow to crack. Server-only.
 */
export const hashPassword = (password: string): Promise<string> => hash(password);

// A real hash of nothing in particular: checking an unknown username against
// it takes as long as checking a real one, so timing doesn't tell names apart.
let dummy: Promise<string> | null = null;

export async function verifyPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hash("not a real password, only for timing");
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
