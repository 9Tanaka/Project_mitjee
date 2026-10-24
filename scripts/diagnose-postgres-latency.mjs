// Phase 5A only: original repository/driver calls, observed in a dedicated test DB.
// No migrations, deletions, LLM, STT or TTS calls. No SQL/parameters/rows exported.
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgresDiagnosisObserver } from "./postgres-diagnosis-observer.mjs";
import { diagnosisTargets, statistics } from "./postgres-diagnosis-config.mjs";

register();
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const observer = new PostgresDiagnosisObserver(), clients = [], pools = [], runtimes = {};
const contextCheck = process.argv[2] === "--context-check";
const report = { schemaVersion: 1, runId: randomUUID(), startedAt: new Date().toISOString(), status: "RUNNING",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, pg: pg.version ?? JSON.parse(readFileSync("node_modules/pg/package.json", "utf8")).version,
    prisma: JSON.parse(readFileSync("node_modules/@prisma/client/package.json", "utf8")).version,
    database: "dedicated PostgreSQL test DB", TLS: "trusted CA, rejectUnauthorized=true", concurrency: 1 },
  plan: { warmups: contextCheck ? 0 : 2, measuredPairs: contextCheck ? 1 : 5, rttSamples: contextCheck ? 3 : 10, coldConnections: contextCheck ? 1 : 3, story: "CC-01", version: 6,
    state: "IDENTITY_CLAIM", provider: "deterministic mock only", paidProviderRequests: 0,
    order: "counterbalanced session_pooler/direct, then direct/session_pooler", percentile: "median; p95 nearest rank (exploratory at n=5)" },
  harnessSha256: {}, checks: [], explain: [], samples: [], summary: {} };
function progress(stage, extra = {}) { process.stdout.write(`${JSON.stringify({ event: "postgres_diagnosis", stage, ...extra })}\n`); }
const failureCodes = new Set(["EXPLICIT_TEST_DB_FLAG_REQUIRED", "DIAGNOSIS_PINNED_DRIVER_REQUIRED", "POSTGRES_DIAGNOSIS_TARGET_OR_CA_REJECTED"]);
function check(condition, code) { failureCodes.add(code); if (!condition) throw new Error(code); report.checks.push(code); }
const histogram = xs => xs.reduce((out, key) => ({ ...out, [key]: (out[key] ?? 0) + 1 }), {});
function summarize(samples) {
  const summaries = {};
  for (const endpoint of ["session_pooler", "direct"]) for (const operation of ["cold_connect", "rtt", "late_rtt", "prisma_rtt", "get", "message", "control_get"]) {
    const group = samples.filter(s => s.endpoint === endpoint && s.operation === operation && s.phase !== "warmup");
    if (!group.length) continue;
    const queries = group.flatMap(s => s.queries);
    const phases = {};
    for (const phase of ["aggregate_fetch", "save_reload", "cas_update", "write_children"])
      phases[phase] = { spans: statistics(group.flatMap(s => s.spans.filter(p => p.phase === phase && (phase !== "write_children" || p.kind === "boundary")).map(p => p.durationMs))),
        statementsPerSample: group.map(s => s.queries.filter(q => q.phase === phase).length),
        wireMs: statistics(queries.filter(q => q.phase === phase).map(q => q.wireMs)) };
    summaries[`${endpoint}/${operation}`] = { totalMs: statistics(group.map(s => s.durationMs)),
      SQLPerSample: group.map(s => s.queries.length), commands: histogram(queries.map(q => q.command)),
      tables: histogram(queries.filter(q => q.table).map(q => q.table)),
      wireMs: statistics(queries.map(q => q.wireMs)), queueMs: statistics(queries.map(q => q.queueMs)),
      acquisitionMs: statistics(group.flatMap(s => s.acquisitions.map(a => a.durationMs))),
      connectionMs: statistics(group.flatMap(s => s.connections.map(c => c.durationMs))),
      beginMs: statistics(queries.filter(q => q.command === "BEGIN").map(q => q.wireMs)),
      commitMs: statistics(queries.filter(q => q.command === "COMMIT").map(q => q.wireMs)),
      isolationMs: statistics(queries.filter(q => q.command === "SET_ISOLATION").map(q => q.wireMs)), phases,
      aggregateOperations: group.map(s => s.ormOperations.filter(p => p.model === "aggregate").map(p => ({ method: p.method, durationMs: p.durationMs }))),
      writeChildrenOperations: group.map(s => s.ormOperations.filter(p => p.phase === "write_children").map(p => ({ model: p.model, method: p.method, durationMs: p.durationMs }))) };
  }
  return summaries;
}

async function main() {
  if (process.argv.length !== 3 || !["--live-test-db", "--context-check"].includes(process.argv[2])) throw new Error("EXPLICIT_TEST_DB_FLAG_REQUIRED");
  if (report.environment.pg !== "8.23.1" || report.environment.prisma !== "7.10.0") throw new Error("DIAGNOSIS_PINNED_DRIVER_REQUIRED");
  for (const file of ["scripts/postgres-diagnosis-observer.mjs", "scripts/postgres-diagnosis-config.mjs", "scripts/diagnose-postgres-latency.mjs",
    "src/persistence/prisma-client.ts", "src/persistence/prisma-repository.ts", "src/core.ts", "src/dialogue/orchestrator.ts"])
    report.harnessSha256[file] = createHash("sha256").update(readFileSync(file)).digest("hex");
  const { urls, tlsCa } = diagnosisTargets(process.env);
  const [{ PrismaClient }, { postgresPoolConfig, createPrismaClient }, { PrismaTrainingRepository }, { createApplication }, { MockScenarioModelProvider }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("../src/persistence/prisma-client.ts"), import("../src/persistence/prisma-repository.ts"),
    import("../src/application/composition.ts"), import("../src/dialogue/mock-provider.ts")]);
  class ObservedFactory extends PrismaPg {
    async connect() { const adapter = await super.connect(); observer.attachPool(adapter.underlyingDriver()); return adapter; }
  }
  for (const endpoint of ["session_pooler", "direct"]) {
    const config = postgresPoolConfig(urls[endpoint], { tlsCa });
    for (let i = 1; i <= report.plan.coldConnections; i++) {
      const pool = new pg.Pool(config); pools.push(pool); observer.attachPool(pool);
      await observer.sample({ endpoint, operation: "cold_connect", phase: "measured", index: i }, async () => { const c = await pool.connect(); c.release(); });
      await pool.end(); pools.splice(pools.indexOf(pool), 1);
    }
    const pool = new pg.Pool(config); pools.push(pool); observer.attachPool(pool);
    for (let i = 1 - report.plan.warmups; i <= report.plan.rttSamples; i++) await observer.sample({ endpoint, operation: "rtt", phase: i <= 0 ? "warmup" : "measured", index: Math.max(i, 0) }, () => pool.query("SELECT 1"));
    const version = await pool.query("SELECT current_setting('server_version_num') AS version");
    check(/^\d+$/.test(version.rows[0]?.version), "SERVER_VERSION_NUMERIC");
    report.environment.serverVersionNum = version.rows[0].version;
    const client = new PrismaClient({ adapter: new ObservedFactory(config, { schema: "public" }) }); clients.push(client);
    const repo = observer.attachRepository(new PrismaTrainingRepository(client));
    const app = await createApplication(repo, new MockScenarioModelProvider(), Date.now, undefined, () => "CC-01");
    runtimes[endpoint] = { client, repo, app, pool };
    progress("endpoint_ready", { endpoint });
  }
  async function prepare(endpoint) {
    const { app } = runtimes[endpoint], owner = { id: randomUUID() };
    let s = (await app.start("call-center", owner, { startId: randomUUID(), expectedRevision: 0 })).session;
    const action = s.availableActions.find(a => a.label === "รับสาย"); check(Boolean(action), "ANSWER_ACTION_PRESENT");
    s = (await app.action(s.sessionId, owner, { actionId: randomUUID(), expectedRevision: s.revision, actionDefinitionId: action.id, payload: {} })).session;
    for (let n = 0; n < 3 && !(s.phone?.state === "IDENTITY_CLAIM" && s.phone.openingStatus === "READY"); n++)
      s = (await app.opening(s.sessionId, owner, { expectedRevision: s.revision })).session;
    check(s.phone?.state === "IDENTITY_CLAIM" && s.phone.openingStatus === "READY", "MATCHED_BASELINE_STATE");
    return { owner, s };
  }
  // Same newly-created synthetic session is visible through both endpoint aliases.
  const shared = await prepare("session_pooler");
  check(JSON.stringify(await runtimes.session_pooler.repo.get(shared.s.sessionId, shared.owner.id)) ===
    JSON.stringify(await runtimes.direct.repo.get(shared.s.sessionId, shared.owner.id)), "ENDPOINTS_SHARE_SYNTHETIC_RECORD");
  let explainQueries = [];
  for (let pair = 1 - report.plan.warmups; pair <= report.plan.measuredPairs; pair++) {
    const phase = pair <= 0 ? "warmup" : "measured", order = pair % 2 ? ["session_pooler", "direct"] : ["direct", "session_pooler"];
    for (const endpoint of order) {
      const { repo, app } = runtimes[endpoint], { owner, s } = await prepare(endpoint);
      if (pair === 1 && endpoint === "session_pooler") observer.explainCapture = q => { explainQueries.push({ text: q.text, values: q.values }); };
      const before = await observer.sample({ endpoint, operation: "get", phase, index: Math.max(pair, 0) }, () => repo.get(s.sessionId, owner.id));
      observer.explainCapture = null;
      const observedGet = observer.exportSamples().at(-1);
      check(observedGet.queries.filter(q => q.phase === "aggregate_fetch").length === 8, "EIGHT_FETCH_QUERIES_CORRELATED");
      if (pair === 1 && endpoint === "session_pooler") check(explainQueries.length === 8, "EIGHT_EXPLAIN_SELECTS_CAPTURED");
      const turn = { turnId: randomUUID(), expectedRevision: s.revision, text: "ขอตรวจสอบผ่านช่องทางทางการก่อนครับ" };
      const result = await observer.sample({ endpoint, operation: "message", phase, index: Math.max(pair, 0) }, () => app.message(s.sessionId, owner, turn));
      if (pair > 0) await observer.sample({ endpoint, operation: "prisma_rtt", phase, index: pair }, () => runtimes[endpoint].client.$queryRawUnsafe("SELECT 1"));
      const after = await repo.get(s.sessionId, owner.id), receipt = after.dialogueTurns.at(-1);
      check(after.events.length === before.events.length && after.result === null && receipt?.usedFallback === false && receipt.attempts === 1, "MOCK_TURN_NO_AUTHORITATIVE_EVALUATION");
      if (pair === 1) {
        const replay = await observer.sample({ endpoint, operation: "replay", phase: "control", index: 1 }, () => app.message(s.sessionId, owner, turn));
        check(replay.duplicate === true && JSON.stringify(await repo.get(s.sessionId, owner.id)) === JSON.stringify(after), "REPLAY_NO_WRITES");
        await observer.sample({ endpoint, operation: "ownership_rejected", phase: "control", index: 1 }, async () => {
          try { await repo.get(s.sessionId, randomUUID()); throw new Error("OWNER_NOT_REJECTED"); }
          catch (e) { check(e.code === "SESSION_NOT_FOUND", "OWNERSHIP_REJECTED"); }
        });
        await observer.sample({ endpoint, operation: "stale", phase: "control", index: 1 }, async () => {
          try { await repo.save(after, after.revision - 1); throw new Error("STALE_NOT_REJECTED"); }
          catch (e) { check(e.code === "REVISION_CONFLICT", "STALE_CAS_REJECTED"); }
        });
        const failingRepo = observer.attachRepository(new PrismaTrainingRepository(runtimes[endpoint].client, { beforeCommit() { throw new Error("INJECTED_DIAGNOSIS_FAILURE"); } }));
        await observer.sample({ endpoint, operation: "rollback", phase: "control", index: 1 }, async () => {
          const next = structuredClone(after); next.revision++;
          try { await failingRepo.save(next, after.revision); throw new Error("FAULT_NOT_THROWN"); }
          catch (e) { check(e.message === "INJECTED_DIAGNOSIS_FAILURE", "INJECTED_FAILURE_OBSERVED"); }
        });
        check(JSON.stringify(await repo.get(s.sessionId, owner.id)) === JSON.stringify(after), "CAS_AND_FAULT_ATOMIC_ROLLBACK");
        const plainClient = createPrismaClient(urls[endpoint], { tlsCa }); clients.push(plainClient);
        const plainRepo = new PrismaTrainingRepository(plainClient);
        // Prewarm before timing the uninstrumented comparison; cold connection is measured separately.
        await plainRepo.get(s.sessionId, owner.id);
        for (let n = 1; n <= 3; n++) {
          const normal = await observer.sample({ endpoint, operation: "control_get", phase: "control", index: n }, () => plainRepo.get(s.sessionId, owner.id));
          check(JSON.stringify(normal) === JSON.stringify(after), "UNINSTRUMENTED_SNAPSHOT_IDENTICAL");
        }
        await plainClient.$disconnect(); clients.splice(clients.indexOf(plainClient), 1);
      }
      check(result.session.status === "ACTIVE", "ACTIVE_STATE_PRESERVED");
      progress("pair_sample_complete", { endpoint, phase, pair });
    }
  }
  // Repeat warm plain-driver probes late to expose time/connection-path drift.
  for (const endpoint of ["session_pooler", "direct"]) {
    await runtimes[endpoint].pool.query("SELECT 1");
    for (let i = 1; i <= 5; i++) await observer.sample({ endpoint, operation: "late_rtt", phase: "measured", index: i }, () => runtimes[endpoint].pool.query("SELECT 1"));
  }
  // EXPLAIN only our parameterized SELECTs in READ ONLY transactions. Raw plan and
  // parameters remain private in RAM and are discarded; numeric totals only leave it.
  for (const endpoint of ["session_pooler", "direct"]) {
    const c = await runtimes[endpoint].pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      for (let i = 0; i < explainQueries.length; i++) {
        const q = explainQueries[i];
        const r = await c.query({ text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.text}`, values: q.values });
        const p = r.rows[0]["QUERY PLAN"][0];
        report.explain.push({ endpoint, queryIndex: i + 1, planningMs: p["Planning Time"], executionMs: p["Execution Time"],
          rows: p.Plan["Actual Rows"], sharedHitBlocks: p.Plan["Shared Hit Blocks"], sharedReadBlocks: p.Plan["Shared Read Blocks"] });
      }
      await c.query("COMMIT");
    } finally { c.release(); }
  }
  explainQueries = [];
  check(report.explain.length === 16, "SIXTEEN_EXPLAIN_PLANS_MEASURED");
  report.samples = observer.exportSamples();
  check(report.samples.every(s => s.queries.every(q => q.statementCount === 1 && q.clientMs !== null && q.wireMs !== null)), "ALL_STATEMENTS_SINGLE_AND_TIMED");
  check(report.samples.filter(s => s.operation === "get").every(s => s.queries.filter(q => q.command === "SELECT").length > 1), "RELATION_FANOUT_OBSERVED");
  check(report.samples.filter(s => s.operation === "prisma_rtt").every(s => s.queries.length === 1 && s.acquisitions.length === 1), "LAZY_RAW_PROBE_CONTEXT_OBSERVED");
  report.summary = summarize(report.samples); report.status = "PASS";
}
try { await main(); }
catch (error) {
  report.status = "FAIL";
  // Never serialize driver/Prisma errors, even if the DB puts SQL or secrets in them.
  report.failureCategory = failureCodes.has(error?.message) ? error.message : "POSTGRES_DIAGNOSIS_OPERATION_FAILED";
  report.samples = observer.exportSamples(); process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(c => c.$disconnect()));
  await Promise.allSettled(pools.map(p => p.end()));
  report.completedAt = new Date().toISOString();
  mkdirSync("docs/performance", { recursive: true });
  writeFileSync(contextCheck ? "docs/performance/postgres-latency-context-check.json" : "docs/performance/postgres-latency-diagnosis.json", `${JSON.stringify(report, null, 2)}\n`);
  progress("complete", { status: report.status, failureCategory: report.failureCategory ?? null, samples: report.samples.length });
}
