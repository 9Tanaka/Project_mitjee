import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { nativeCapability } from "./shadow-aggregate/native.mjs";
import { loadOracle, mismatchCategories } from "./shadow-aggregate/oracle.mjs";
import { diagnosisTargets } from "./postgres-diagnosis-config.mjs";
import { PostgresDiagnosisObserver, classifyStatement } from "./postgres-diagnosis-observer.mjs";

register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const scratch = "test-results/phase5d-native", observer = new PostgresDiagnosisObserver(), clients = [];
const report = { baseline: "ec5b180313ca347e3ff9e9f5ace2034685e706d3", startedAt: new Date().toISOString(), status: "RUNNING",
  authoritativeRuntimeChanged: false, candidateDrivesResponsesOrWrites: false, saveOptimizationImplemented: false,
  versions: Object.fromEntries(["prisma", "@prisma/client", "@prisma/adapter-pg", "pg"].map(p => [p, JSON.parse(readFileSync(`node_modules/${p}/package.json`, "utf8")).version])),
  cases: [], counts: [], recommendation: "DEFER" };
let baseline, candidate, oracle, repo;
const hash = f => createHash("sha256").update(readFileSync(f)).digest("hex");
const protectedFiles = execFileSync("git", ["ls-files", "src", "prisma", "package.json", "package-lock.json"], { encoding: "utf8" }).trim().split(/\r?\n/);
const generatedDigest = () => {
  const h = createHash("sha256");
  for (const name of readdirSync("src/generated/prisma", { recursive: true }).sort()) {
    if (/\.(?:ts|js|json|wasm)$/.test(name)) h.update(name).update(readFileSync("src/generated/prisma/" + name));
  }
  return h.digest("hex");
};
report.authoritativeGeneratedClientSha256 = generatedDigest();
report.harnessSourceSha256 = Object.fromEntries(["scripts/prove-postgres-aggregate.mjs", ...readdirSync("scripts/shadow-aggregate").filter(f => f.endsWith(".mjs")).map(f => "scripts/shadow-aggregate/" + f)].map(f => [f, hash(f)]));
report.protectedSourceSha256 = Object.fromEntries(protectedFiles.map(f => [f, hash(f)]));
function progress(stage, fields = {}) { console.log(JSON.stringify({ event: "phase5d_shadow", stage, ...fields })); }
function ensure(ok, code) { if (!ok) throw new Error(code); }
async function main() {
  ensure(report.versions.prisma === "7.10.0" && report.versions["@prisma/client"] === "7.10.0" && report.versions["@prisma/adapter-pg"] === "7.10.0" && report.versions.pg === "8.23.1", "PINNED_VERSION_REQUIRED");
  const capability = await nativeCapability(scratch); report.nativeCapability = capability.result ?? capability;
  progress("native_capability", report.nativeCapability);
  report.stage = "ORACLE"; oracle = await loadOracle(scratch); report.decoderSha256 = oracle.decoderSha256;
  const { urls, tlsCa } = diagnosisTargets(process.env);
  const [{ PrismaClient }, { postgresPoolConfig }, { PrismaTrainingRepository }, { TrainingCore }, { InMemoryTrainingRepository }, { smsPhishingDialogueFixture }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("../src/persistence/prisma-client.ts"), import("../src/persistence/prisma-repository.ts"), import("../src/core.ts"), import("../src/domain/repository.ts"), import("../src/fixtures/sms-phishing-dialogue.ts")]);
  class ObservedFactory extends PrismaPg { async connect() { const adapter = await super.connect(); observer.attachPool(adapter.underlyingDriver()); return adapter; } }
  class ReadOnlyFactory extends ObservedFactory { async connect() {
    const adapter = await super.connect(), pool = adapter.underlyingDriver(), Base = pool.Client;
    pool.Client = class extends Base { query(...args) {
      const command = classifyStatement(typeof args[0] === "string" ? args[0] : args[0]?.text).command;
      if (!["SELECT", "BEGIN", "COMMIT", "ROLLBACK", "SET", "SET_ISOLATION"].includes(command)) { report.candidateWriteAttempts = (report.candidateWriteAttempts ?? 0) + 1; throw new Error("CANDIDATE_WRITE_FORBIDDEN"); }
      return super.query(...args);
    } }; return adapter;
  } }
  const config = postgresPoolConfig(urls.session_pooler, { tlsCa });
  baseline = new PrismaClient({ adapter: new ObservedFactory(config, { schema: "public" }) }); clients.push(baseline);
  candidate = capability.PrismaClient ? new capability.PrismaClient({ adapter: new ReadOnlyFactory(config, { schema: "public" }) }) : null; if (candidate) clients.push(candidate);
  const explicit = new PrismaClient({ adapter: new ReadOnlyFactory(config, { schema: "public" }) }); clients.push(explicit);
  report.stage = "FIXTURE"; repo = new PrismaTrainingRepository(baseline); await repo.publish(smsPhishingDialogueFixture);
  const memory = new InMemoryTrainingRepository(), core = await TrainingCore.create([smsPhishingDialogueFixture], memory, () => 1000);
  const id = randomUUID(), owner = randomUUID(); await core.start(id, owner, smsPhishingDialogueFixture.id, smsPhishingDialogueFixture.version);
  await repo.create(await memory.get(id, owner));
  let smokeRow;
  for (const strategy of candidate ? ["baseline", "join", "query", "default"] : ["baseline"]) {
    report.stage = "READ_" + strategy.toUpperCase();
    const client = strategy === "baseline" ? baseline : candidate;
    const row = await client.$transaction(async tx => observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: 0 },
      () => tx.trainingSession.findFirst({ where: { id, ownerId: owner }, include: oracle.include, ...(strategy === "baseline" || strategy === "default" ? {} : { relationLoadStrategy: strategy }) })), { isolationLevel: "RepeatableRead", timeout: 15000 });
    report.counts.push({ strategy, statements: observer.exportSamples().at(-1).queries.length });
    if (strategy === "baseline") smokeRow = row;
    else report.cases.push({ case: "native-empty-" + strategy, rowMismatches: mismatchCategories(smokeRow, row), domainMismatches: mismatchCategories(oracle.decode(smokeRow), oracle.decode(row)) });
  }
  report.stage = "DIFFERENTIAL_SUITE";
  const { runSuite } = await import("./shadow-aggregate/suite.mjs");
  Object.assign(report, await runSuite({ baseline, native: candidate, explicit, repo, observer, oracle, scratch, PrismaTrainingRepository,
    Prisma: (await import("../src/generated/prisma/client.ts")).Prisma, progress, evidence: report }));
  const tiedMismatch = report.ties.some(t => t.mismatches.some(m => m.length));
  const coherent = report.concurrency.every(c => c.repeatableSnapshotEqual && c.latestRevisionAdvanced && c.firstChildrenUnchanged);
  const owned = report.ownership.every(o => o.baselineNull && o.candidateNull);
  const quizEqual = report.quiz.every(q => !q.rowMismatches.length && !q.domainMismatches.length);
  const expiryEqual = report.expiry.candidateDidNotExpireOrWrite && report.expiry.authoritativeCoreExpired && !report.expiry.domainMismatches.length;
  report.recommendation = tiedMismatch || !coherent || !owned || !quizEqual || !expiryEqual || !report.physicalInsertionAudit.physicalOrderDiffersFromLogical ? "DEFER" : report.selectedReader === "explicit" ? (report.explicitUntiedParity ? "FALLBACK_TO_EXPLICIT_SQL" : "DEFER") : (report.nativeUntiedParity ? "PROMOTE_GET" : "DEFER");
  report.status = "COMPLETE";
}
try { await main(); } catch (error) { delete report.firstBaseline; report.status = "FAIL"; report.failureCategory = ["P2010", "P2028", "P2026"].includes(error?.code) ? error.code
  : /getTime is not a function/.test(error?.message) ? "TIMESTAMP_HYDRATION" : /Unknown argument/.test(error?.message) ? "QUERY_ARGUMENT_UNSUPPORTED"
    : /Cannot find|Cannot resolve/.test(error?.message) ? "HARNESS_IMPORT_RESOLUTION" : "SHADOW_PROOF_OPERATION_FAILED";
  report.failureLocations = [...String(error?.stack).matchAll(/(?:oracle|native|fixtures|suite|explicit-reader|prove-postgres-aggregate)\.mjs:(\d+):(\d+)/g)].map(m => ({ line: Number(m[1]), column: Number(m[2]) }));
  process.exitCode = 1; }
finally {
  await Promise.allSettled(clients.map(c => c.$disconnect()));
  report.protectedSourcesUnchanged = protectedFiles.every(f => hash(f) === report.protectedSourceSha256[f]);
  report.authoritativeGeneratedClientUnchanged = generatedDigest() === report.authoritativeGeneratedClientSha256;
  report.candidateWriteAttempts ??= 0;
  report.completedAt = new Date().toISOString(); mkdirSync("docs/performance", { recursive: true });
  writeFileSync("docs/performance/postgres-phase5d-proof.json", JSON.stringify(report, null, 2) + "\n");
  progress("complete", { status: report.status, recommendation: report.recommendation });
}
