// Phase 5B: identical text/voice service workload, real session-pooler PG,
// deterministic model/STT/TTS. No provider network, migrations or cleanup.
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgresDiagnosisObserver } from "./postgres-diagnosis-observer.mjs";
import { diagnosisTargets, statistics } from "./postgres-diagnosis-config.mjs";

register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const label = process.argv[2], baseline = "595a579498814317843907a65b7d09e9a5505ca4";
if (process.argv.length !== 3 || !["before", "after"].includes(label)) throw new Error("USE_BEFORE_OR_AFTER_LABEL");
const output = `docs/performance/postgres-phase5b-${label}.json`;
if (existsSync(output)) throw new Error("BENCHMARK_ARTIFACT_ALREADY_EXISTS");
const runtimeFiles = ["src/application/training-service.ts", "src/application/voice-service.ts", "src/dialogue/orchestrator.ts", "src/core.ts", "src/persistence/prisma-repository.ts", "src/persistence/prisma-client.ts", "src/domain/scoring.ts"];
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const report = { schemaVersion: 1, label, baselineCommit: baseline,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runId: randomUUID(), startedAt: new Date().toISOString(), status: "RUNNING", completedAt: null,
  environment: { node: process.version, platform: process.platform, arch: process.arch, endpoint: "session_pooler", concurrency: 1,
    pg: JSON.parse(readFileSync("node_modules/pg/package.json", "utf8")).version,
    prisma: JSON.parse(readFileSync("node_modules/@prisma/client/package.json", "utf8")).version },
  plan: { warmups: 2, measured: 10, cohortOrder: "alternating text/voice then voice/text", story: "CC-01", version: 6,
    state: "IDENTITY_CLAIM", input: "same fixed sanitized Thai text / same PCM WAV", transport: "service",
    model: "deterministic mock", stt: "deterministic mock", tts: "deterministic mock", paidProviderRequests: 0,
    percentile: "median / nearest-rank p95; exploratory at n=10", setup: "domain-authored in-memory identity snapshot forked into fresh persisted sessions outside timed intervals" },
  sourceSha256: Object.fromEntries([...runtimeFiles, "scripts/benchmark-postgres-turns.mjs", "scripts/postgres-diagnosis-observer.mjs"].map(f => [f, hash(f)])),
  samples: [], summary: {}, checks: [] };
const observer = new PostgresDiagnosisObserver(); let client;
const assertionCodes = new Set();
function ensure(ok, code) { assertionCodes.add(code); if (!ok) throw new Error(code); report.checks.push(code); }
function wav() {
  const bytes = new Uint8Array(364), view = new DataView(bytes.buffer);
  const tag = (offset, text) => [...text].forEach((c, i) => bytes[offset + i] = c.charCodeAt(0));
  tag(0, "RIFF"); tag(8, "WAVE"); tag(12, "fmt "); tag(36, "data");
  view.setUint32(4, 356, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, 320, true);
  return bytes;
}
async function main() {
  ensure(report.environment.pg === "8.23.1" && report.environment.prisma === "7.10.0", "PINNED_DRIVERS");
  if (label === "before") for (const f of runtimeFiles) {
    const old = execFileSync("git", ["show", `${baseline}:${f}`], { encoding: "utf8" });
    ensure(old.replace(/\r\n/g, "\n") === readFileSync(f, "utf8").replace(/\r\n/g, "\n"), "BASELINE_RUNTIME_MATCHES_PHASE5A");
  }
  const { urls, tlsCa } = diagnosisTargets(process.env);
  const [{ PrismaClient }, { postgresPoolConfig }, { PrismaTrainingRepository }, { createApplication }, { InMemoryTrainingRepository }, { MockScenarioModelProvider }, { VoiceApplicationService }, { runLatencyTrace }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("../src/persistence/prisma-client.ts"), import("../src/persistence/prisma-repository.ts"),
    import("../src/application/composition.ts"), import("../src/domain/repository.ts"), import("../src/dialogue/mock-provider.ts"),
    import("../src/application/voice-service.ts"), import("../src/observability/latency.ts")]);
  class ObservedFactory extends PrismaPg {
    async connect() { const adapter = await super.connect(); observer.attachPool(adapter.underlyingDriver()); return adapter; }
  }
  client = new PrismaClient({ adapter: new ObservedFactory(postgresPoolConfig(urls.session_pooler, { tlsCa }), { schema: "public" }) });
  const repo = observer.attachRepository(new PrismaTrainingRepository(client));
  const app = await createApplication(repo, new MockScenarioModelProvider(), Date.now, undefined, () => "CC-01");
  const inputText = "ขอตรวจสอบผ่านช่องทางทางการก่อนครับ", audio = wav();
  const voice = new VoiceApplicationService(app, { async transcribe() { return inputText; } }, { async synthesize() { return audio; } });
  const memory = new InMemoryTrainingRepository(), fixtureApp = await createApplication(memory, new MockScenarioModelProvider(), Date.now, undefined, () => "CC-01");
  const fixtureOwner = { id: randomUUID() };
  let s = (await fixtureApp.start("call-center", fixtureOwner, { startId: randomUUID(), expectedRevision: 0 })).session;
  s = (await fixtureApp.action(s.sessionId, fixtureOwner, { actionId: randomUUID(), expectedRevision: s.revision,
    actionDefinitionId: s.availableActions.find(a => a.label === "รับสาย").id, payload: {} })).session;
  while (!(s.phone?.state === "IDENTITY_CLAIM" && s.phone.openingStatus === "READY"))
    s = (await fixtureApp.opening(s.sessionId, fixtureOwner, { expectedRevision: s.revision })).session;
  const fixture = await memory.get(s.sessionId, fixtureOwner.id);
  ensure(fixture.state === "IDENTITY_CLAIM" && fixture.result === null && fixture.events.length === 0 && fixture.opportunities.length === 0, "MATCHED_PHASE5A_IDENTITY_FIXTURE");
  report.fixture = { state: fixture.state, revision: fixture.revision, messages: fixture.messages.length, actions: fixture.actions.length, receipts: fixture.dialogueTurns.length };
  for (let index = -1; index <= report.plan.measured; index++) {
    const phase = index <= 0 ? "warmup" : "measured";
    for (const cohort of index % 2 ? ["text", "voice"] : ["voice", "text"]) {
      const initial = structuredClone(fixture), owner = { id: randomUUID() }, shift = Date.now() - fixture.lastActivityAt;
      initial.id = randomUUID(); initial.ownerId = owner.id; initial.startedAt += shift; initial.lastActivityAt += shift;
      initial.actions.forEach(a => { a.sessionId = initial.id; a.at += shift; });
      initial.messages.forEach(m => { m.at += shift; });
      await repo.create(initial);
      ensure(isDeepStrictEqual(await repo.get(initial.id, owner.id), initial), "PERSISTED_FIXTURE_IDENTICAL");
      let trace;
      const command = { turnId: randomUUID(), expectedRevision: initial.revision };
      const reply = await runLatencyTrace({ transport: "service", operation: cohort === "text" ? "message" : "voice", enabled: true, sink: t => { trace = t; } },
        () => observer.sample({ endpoint: "session_pooler", operation: "message", phase, index: Math.max(index, 0) },
          () => cohort === "text" ? app.message(initial.id, owner, { ...command, text: inputText })
            : voice.send(initial.id, owner, { ...command, audio, mime: "audio/wav" })));
      const raw = observer.exportSamples().at(-1), after = await repo.get(initial.id, owner.id), receipt = after.dialogueTurns.at(-1);
      ensure(after.revision === initial.revision + 1 && after.state === initial.state && after.result === null && after.events.length === 0 && after.opportunities.length === 0, "NO_AUTHORITATIVE_EVALUATION");
      ensure(receipt?.attempts === 1 && receipt.usedFallback === false && receipt.failureReason === null, "ONE_ATTEMPT_NO_FALLBACK");
      ensure(cohort === "text" || reply.audioStatus === "READY", "VOICE_READY");
      ensure(raw.queries.every(q => q.statementCount === 1 && q.wireMs !== null), "COMPLETE_SQL_TIMINGS");
      report.samples.push({ cohort, ...raw, trace: { totalMs: trace.totalMs, durationsMs: trace.durationsMs,
        repositoryOperations: trace.repositoryOperations, aggregateDbReads: trace.aggregateDbReads, attempts: trace.attempts, retryCount: trace.retryCount } });
      console.log(JSON.stringify({ event: "postgres_turn_benchmark", label, cohort, phase, index, statements: raw.queries.length }));
    }
  }
  for (const cohort of ["text", "voice"]) {
    const ss = report.samples.filter(s => s.cohort === cohort && s.phase === "measured");
    report.summary[cohort] = { totalMs: statistics(ss.map(s => s.durationMs)), statementCounts: ss.map(s => s.queries.length),
      getCounts: ss.map(s => s.ormOperations.filter(o => o.model === "aggregate" && o.method === "get").length),
      saveSqlCounts: ss.map(s => {
        const save = s.ormOperations.find(o => o.model === "aggregate" && o.method === "save"), spans = new Map(s.spans.map(p => [p.id, p]));
        return s.queries.filter(q => { let id = q.spanId; while (id) { if (id === save.id) return true; id = spans.get(id)?.parent; } return false; }).length;
      }), dbPreflightMs: statistics(ss.map(s => s.trace.durationsMs.db_preflight)), commitMs: statistics(ss.map(s => s.trace.durationsMs.commit)) };
  }
  report.status = "PASS";
}
try { await main(); } catch (error) { report.status = "FAIL"; report.failureCategory = assertionCodes.has(error?.message) ? error.message
  : ["P2002", "P2003", "P2028"].includes(error?.code) ? error.code : "POSTGRES_TURN_BENCHMARK_FAILED"; process.exitCode = 1; }
finally {
  await client?.$disconnect().catch(() => {}); report.completedAt = new Date().toISOString();
  mkdirSync("docs/performance", { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ event: "postgres_turn_benchmark_complete", label, status: report.status, samples: report.samples.length }));
}
