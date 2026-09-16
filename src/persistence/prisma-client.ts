import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";

/** Composition-root helper, never imported by Core. No client is opened on module import. */
export function createPrismaClient(databaseUrl: string, options: {
  tlsCa?: string;
  /** Trusted local server RSA public key path/content; only for loopback development/tests. */
  loopbackRsaPublicKey?: string;
} = {}): PrismaClient {
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:") throw new Error("Expected a mysql database URL");
  if (url.search || url.hash) throw new Error("Configure TLS explicitly with tlsCa; URL parameters are not silently ignored");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!loopback && options.loopbackRsaPublicKey) {
    throw new Error("RSA public key configuration is restricted to loopback development/test connections");
  }
  if (!loopback && !options.tlsCa) {
    throw new Error("Remote database connections require a trusted TLS CA");
  }
  const adapter = new PrismaMariaDb({
    host: url.hostname === "[::1]" ? "::1" : url.hostname, port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)), connectionLimit: 8,
    // Domain timestamps are UTC milliseconds, independent of server timezone.
    timezone: "Z", ...(options.tlsCa ? { ssl: { ca: options.tlsCa, rejectUnauthorized: true } } : {}),
    ...(options.loopbackRsaPublicKey ? { cachingRsaPublicKey: options.loopbackRsaPublicKey } : {}),
    allowPublicKeyRetrieval: false,
  });
  return new PrismaClient({ adapter });
}
