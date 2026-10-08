import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DATABASE_URL is canonical; legacy names remain supported so an existing
// Vercel deployment does not lose access until its environment is migrated.
// SOLAR_DATABASE_URL comes first: DATABASE_URL is owned by the Neon
// integration and cannot be edited, so a database outside it is set there.
const databaseUrl =
  process.env.SOLAR_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.PRISMA_DATABASE_URL ||
  process.env.POSTGRES_URL;

const prismaOptions: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
