import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { dedicatedPostgresTestUrl } from "./postgres-config.mjs";

/** No credentials or driver errors are attached to configuration failures. */
export function diagnosisTargets(env) {
  try {
    const pooled = dedicatedPostgresTestUrl(env.POSTGRES_TEST_DATABASE_URL, env.DATABASE_URL);
    const pool = new URL(pooled), direct = new URL(env.DIRECT_URL);
    if (!["postgres:", "postgresql:"].includes(direct.protocol) || direct.hash ||
        /pooler\./i.test(direct.hostname) || ["6543", "6432"].includes(direct.port)) throw 0;
    const allowed = new Set(["sslmode", "sslaccept", "sslcert", "schema", "connect_timeout"]);
    for (const [name] of direct.searchParams) {
      if (!allowed.has(name) || direct.searchParams.getAll(name).length !== 1) throw 0;
    }
    if (direct.searchParams.has("sslmode") && direct.searchParams.get("sslmode") !== "require" ||
        direct.searchParams.has("sslaccept") && direct.searchParams.get("sslaccept") !== "strict" ||
        direct.searchParams.has("schema") && direct.searchParams.get("schema") !== "public") throw 0;
    // Runtime pg uses its explicit CA, never URL TLS overrides.
    direct.search = "";
    dedicatedPostgresTestUrl(direct.href, env.DATABASE_URL);
    const project = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(direct.hostname)?.[1];
    if (!project || !/\.pooler\.supabase\.com$/i.test(pool.hostname) || pool.port && pool.port !== "5432" ||
        !decodeURIComponent(pool.username).endsWith(`.${project}`) || pool.pathname !== direct.pathname) throw 0;
    const tlsCa = env.POSTGRES_TEST_TLS_CA || (env.POSTGRES_TEST_TLS_CA_PATH ? readFileSync(env.POSTGRES_TEST_TLS_CA_PATH, "utf8") : "");
    if (!tlsCa.trim() || /PRIVATE KEY/.test(tlsCa) || !new X509Certificate(tlsCa).ca) throw 0;
    return { urls: { session_pooler: pooled, direct: direct.href }, tlsCa };
  } catch { throw new Error("POSTGRES_DIAGNOSIS_TARGET_OR_CA_REJECTED"); }
}

export function statistics(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const n = sorted.length;
  return n ? { n, min: sorted[0], p50: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95: sorted[Math.ceil(n * .95) - 1], max: sorted[n - 1] } : { n: 0, min: null, p50: null, p95: null, max: null };
}
