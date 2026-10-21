import { PrismaClient } from "@prisma/client";
import { resolveDbUrls } from "./dbUrl";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The shared Prisma client, made on first use so builds and type checks don't
 * need a database. The table-session API routes use it, and with
 * TEAROFF_STORE=db so does everything that reads or writes authored content.
 * The URL comes from resolveDbUrls: .env locally, the Supabase integration's
 * variables on Vercel.
 */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const { url } = resolveDbUrls(process.env);
    globalForPrisma.prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  }
  return globalForPrisma.prisma;
}
