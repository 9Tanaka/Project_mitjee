import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";

export const DATABASE_CONNECTION_TIMEOUT_MS = 10_000;
export const DATABASE_IDLE_TIMEOUT_MS = 10_000;
export const DATABASE_POOL_LIMIT = 8;

/** No URL, driver error or connection parameter is included in configuration errors. */
export function postgresPoolConfig(databaseUrl: string, options: { tlsCa?: string } = {}): PoolConfig {
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new Error("Invalid PostgreSQL database URL"); }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("Expected a PostgreSQL database URL");
  // pg connection strings can replace the explicit SSL object. Parse only the
  // connection identity here; all runtime query/hash options fail closed.
  if (url.search || url.hash) throw new Error("Configure TLS explicitly with tlsCa; URL parameters and fragments are not accepted");
  if (Object.keys(options).some(key => key !== "tlsCa")) throw new Error("Unsupported database configuration option");
  let user: string, password: string, database: string;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw new Error("Invalid PostgreSQL connection identity"); }
  if (!url.hostname || !user || !database || /[\x00-\x1f/\\]/.test(database)) throw new Error("Explicit PostgreSQL host, user and database are required");
  const host = url.hostname === "[::1]" ? "::1" : url.hostname;
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  const ca = options.tlsCa?.trim();
  if (!loopback && !ca) throw new Error("Remote database connections require a trusted TLS CA");
  return {
    host, port: Number(url.port || 5432), user, password, database,
    max: DATABASE_POOL_LIMIT, connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
    // Explicit false prevents ambient PGSSLMODE from changing local test policy.
    ssl: ca ? { ca, rejectUnauthorized: true } : false,
    options: "-c timezone=UTC",
  };
}

/** PrismaPg owns its lazy pool; Prisma $disconnect disposes that pool. */
export function createPrismaClient(databaseUrl: string, options: { tlsCa?: string } = {}): PrismaClient {
  const adapter = new PrismaPg(postgresPoolConfig(databaseUrl, options), { schema: "public" });
  return new PrismaClient({ adapter });
}
