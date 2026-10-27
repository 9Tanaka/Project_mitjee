import { defineConfig } from "prisma/config";
import { directMigrationUrl } from "./scripts/postgres-config.mjs";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generate/validate/build do not connect. Migration execution is separately
  // preflighted by scripts/deploy-postgres.mjs and never uses DATABASE_URL.
  datasource: { url: process.env.DIRECT_URL ? directMigrationUrl(process.env.DIRECT_URL) : "postgresql://invalid:invalid@127.0.0.1:1/invalid" },
});
