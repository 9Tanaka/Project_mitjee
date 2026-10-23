import { readFileSync } from "node:fs";
import { dedicatedPostgresTestUrl } from "../scripts/postgres-config.mjs";
import { createPrismaClient } from "../src/persistence/prisma-client.js";

const raw = process.env.POSTGRES_TEST_DATABASE_URL;
export const postgresTestUrl = raw ? dedicatedPostgresTestUrl(raw, process.env.DATABASE_URL) : undefined;
const caPath = process.env.POSTGRES_TEST_TLS_CA_PATH;
let ca: string | undefined;
if (postgresTestUrl) {
  try { ca = process.env.POSTGRES_TEST_TLS_CA || (caPath ? readFileSync(caPath, "utf8") : undefined); }
  catch { throw new Error("Dedicated PostgreSQL test CA file could not be read"); }
}
export const postgresTestOptions = ca ? { tlsCa: ca } : {};
/** No runtime URL fallback. No connection is allocated when tests are unconfigured. */
export function postgresTestClient() {
  return postgresTestUrl ? createPrismaClient(postgresTestUrl, postgresTestOptions) : null;
}
