import { PrismaClient } from "@prisma/client";

// Prisma 7: pass the database URL directly to the constructor
// instead of relying on the schema datasource url field
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
} as any);