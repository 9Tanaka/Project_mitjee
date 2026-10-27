import { readFileSync } from "node:fs";

function parseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("An explicit PostgreSQL URL is required"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1) || url.hash) {
    throw new Error("An explicit PostgreSQL host, user and database without fragment is required");
  }
  return url;
}

export function directMigrationUrl(raw) {
  if (!raw?.trim()) throw new Error("DIRECT_URL is required for migrations; DATABASE_URL is never substituted");
  const url = parseUrl(raw);
  if (url.port === "6543" || url.port === "6432" || /pooler\./i.test(url.hostname)) {
    throw new Error("DIRECT_URL must be a direct endpoint, not a connection pooler");
  }
  // Prisma 7.10's native migration engine does not implement libpq's
  // verify-full/sslrootcert flags. Those can silently retain insecure defaults.
  const allowed = new Set(["sslmode", "sslaccept", "sslcert", "schema", "connect_timeout"]);
  for (const [name] of url.searchParams) {
    if (!allowed.has(name) || url.searchParams.getAll(name).length !== 1) throw new Error("Unsupported or repeated migration URL option");
  }
  if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") throw new Error("Migrations target the public schema only");
  const timeout = url.searchParams.get("connect_timeout");
  if (timeout !== null && !/^(?:[1-9]|[1-5][0-9]|60)$/.test(timeout)) throw new Error("Migration connection timeout must be between 1 and 60 seconds");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const mode = url.searchParams.get("sslmode");
  if (!local || mode !== null && mode !== "disable") {
    if (mode !== "require" || url.searchParams.get("sslaccept") !== "strict" || !url.searchParams.get("sslcert")) throw new Error("Remote CLI TLS requires sslmode=require, sslaccept=strict and a trusted sslcert file");
    try { if (!readFileSync(url.searchParams.get("sslcert"), "utf8").trim()) throw new Error(); }
    catch { throw new Error("Migration trusted CA file is unavailable or empty"); }
  }
  if (local && (mode === null || mode === "disable") && (url.searchParams.has("sslaccept") || url.searchParams.has("sslcert"))) {
    throw new Error("Local plaintext migrations cannot include conflicting TLS options");
  }
  if (url.port === "1" || url.username === "invalid" || url.pathname === "/invalid") throw new Error("The nonconnecting generation placeholder cannot be used for migration");
  return raw;
}

function target(url) {
  const host = url.hostname.toLowerCase();
  return { host: ["localhost", "127.0.0.1", "[::1]"].includes(host) ? "loopback" : host,
    port: url.port || "5432", database: decodeURIComponent(url.pathname.slice(1)) };
}

/** Checked before any test client is created or any destructive helper starts. */
export function dedicatedPostgresTestUrl(raw, runtimeUrl) {
  const url = parseUrl(raw);
  let candidate;
  try { candidate = target(url); } catch { throw new Error("Invalid dedicated PostgreSQL test target"); }
  if (!/^mitjee_test(?:_[a-z0-9_]+)?$/.test(candidate.database) || url.search || url.hash) {
    throw new Error("POSTGRES_TEST_DATABASE_URL must name mitjee_test or mitjee_test_<suffix>, with no URL options");
  }
  if (runtimeUrl) {
    let runtime;
    try { const parsed = new URL(runtimeUrl); if (["postgres:", "postgresql:"].includes(parsed.protocol)) runtime = target(parsed); }
    catch { throw new Error("Runtime database identity could not be checked safely"); }
    // Same database name is rejected across different hosts too: direct/pooler
    // aliases and credentials must not bypass runtime-target protection.
    if (runtime && runtime.database === candidate.database) throw new Error("Dedicated tests cannot target the runtime database or its aliases");
  }
  return raw;
}
