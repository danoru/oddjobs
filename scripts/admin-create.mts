/**
 * admin-create.mts — make the first admin (there's no email, so nobody else can).
 *
 *   pnpm admin:create <username>                 asks for a password (hidden)
 *   pnpm admin:create <username> --generate      makes one up and prints it once
 *   echo "…" | pnpm admin:create <username>      takes it from stdin
 *   pnpm admin:create --remote <username>        the hosted Supabase database (asks first)
 *
 * Options: --name "Display Name", --reset (the account exists: set its
 * password and make it an admin again, for when every admin is locked out),
 * --yes (don't ask before writing to the hosted database).
 *
 * The first admin (when no enabled admin exists yet) also becomes the owner of
 * every one-shot in the database that has none (everything written before
 * accounts). Later admins don't: "no owner" is how an admin hands a one-shot
 * back to all the admins. Uses .env locally, like
 * the app (src/lib/dbUrl.ts); --remote uses the Supabase integration's
 * variables from .env instead.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";
import { resolveDbUrls } from "../src/lib/dbUrl";
import { PASSWORD_MIN, passwordSchema, usernameKey } from "../src/lib/accounts";
import { hashPassword } from "../src/lib/password.server";
import { Accounts, AccountError } from "../src/lib/users.server";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const option = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const valued = new Set(["--name"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1] ?? ""));
const username = positional[0];
const remote = flag("--remote");

if (!username) {
  console.error('usage: pnpm admin:create [--remote] <username> [--name "Display Name"] [--generate] [--reset] [--yes]');
  process.exit(1);
}

// .env, as the Prisma CLI and db-env.mts read it.
const envFile = path.join(import.meta.dirname, "..", ".env");
const env: Record<string, string | undefined> = { ...process.env };
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const { url } = resolveDbUrls(env, { remote });
if (!url) {
  console.error(remote ? "No hosted database: POSTGRES_PRISMA_URL isn't set in .env." : "No database: set DATABASE_URL in .env (pnpm db:dev).");
  process.exit(1);
}
const host = new URL(url).hostname;

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo nothing while the password is typed.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.startsWith(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function getPassword(): Promise<{ password: string; generated: boolean }> {
  if (flag("--generate")) return { password: randomBytes(15).toString("base64url"), generated: true };
  if (!process.stdin.isTTY) {
    const password = await readStdin();
    if (!password) throw new Error("No password on stdin. Pipe one in, run it in a terminal, or use --generate.");
    return { password, generated: false };
  }
  for (;;) {
    const a = await ask(`Password (at least ${PASSWORD_MIN} characters): `, true);
    const ok = passwordSchema.safeParse(a);
    if (!ok.success) {
      console.log(ok.error.issues[0].message);
      continue;
    }
    if ((await ask("Again: ", true)) === a) return { password: a, generated: false };
    console.log("Those don't match. Once more.");
  }
}

const client = new PrismaClient({ datasources: { db: { url } } });

try {
  console.log(`admin:create: ${remote ? "the HOSTED database" : "the local database"} at ${host}`);
  if (remote && !flag("--yes")) {
    if (!process.stdin.isTTY) throw new Error("Writing to the hosted database: run it in a terminal, or pass --yes.");
    const sure = await ask(`This writes to the live site's database. Type the host (${host}) to go on: `);
    if (sure.trim() !== host) throw new Error("Stopped; nothing written.");
  }

  const existing = await client.user.findUnique({ where: { usernameLower: usernameKey(username) } });
  if (existing && !flag("--reset")) throw new Error(`"${existing.username}" already has an account. --reset sets its password and makes it an admin.`);

  const { password, generated } = await getPassword();
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw new Error(pw.error.issues[0].message);

  const accounts = new Accounts({ client: () => client });
  const first = (await client.user.count({ where: { role: "admin", disabledAt: null } })) === 0;
  const user = existing
    ? await client.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(password), role: "admin", disabledAt: null, tokenVersion: { increment: 1 } },
      })
    : await accounts.createUser({ username, password, displayName: option("--name") ?? username, role: "admin", canInvite: true });

  const owned = first ? await accounts.claimUnowned(user.id) : 0;
  // Clear any lockout from earlier tries.
  await client.authAttempt.deleteMany({ where: { key: `login:user:${user.usernameLower}` } });

  console.log(`${existing ? "Reset" : "Made"} admin "${user.username}".`);
  if (generated) console.log(`Password (shown once, keep it somewhere safe): ${password}`);
  if (owned) console.log(`They now own ${owned} one-shot${owned === 1 ? "" : "s"} that had no owner.`);
  console.log("Sign in at /login, then make invites at /admin/people.");
} catch (e) {
  console.error(e instanceof AccountError || e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
