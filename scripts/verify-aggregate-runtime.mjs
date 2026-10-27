// Phase 5F: original Prisma include is the parity oracle; actual GET is under test.
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { diagnosisTargets } from "./postgres-diagnosis-config.mjs";
import { loadOracle, mismatchCategories } from "./shadow-aggregate/oracle.mjs";
import { orderingViolations } from "./shadow-aggregate/ordering-contract.mjs";
import { PostgresDiagnosisObserver } from "./postgres-diagnosis-observer.mjs";

register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const hash = f => createHash("sha256").update(readFileSync(f)).digest("hex"), clients = [], observer = new PostgresDiagnosisObserver();
const report = { phase: "5F", sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), status: "RUNNING",
  cases: [], ownership: [], malformed: [], saveUnchanged: false, decoderUnchanged: false, nativeJoinEnabled: false, sourceSha256: {} };
const progress = (stage, fields = {}) => { report.stage = stage; console.log(JSON.stringify({ event: "phase5f_runtime_parity", stage, ...fields })); };
const ensure = (ok, code) => { if (!ok) throw new Error(code); };
async function main() {
  report.sourceSha256 = Object.fromEntries(["src/persistence/prisma-repository.ts", "src/persistence/aggregate-reader.ts", "scripts/verify-aggregate-runtime.mjs", "scripts/shadow-aggregate/explicit-reader.mjs"].map(f => [f, hash(f)]));
  const original = execFileSync("git", ["show", "ec5b180:src/persistence/prisma-repository.ts"], { encoding: "utf8" }), current = readFileSync("src/persistence/prisma-repository.ts", "utf8");
  const tail = s => s.slice(s.indexOf("  async save(")).replaceAll("\r\n", "\n");
  const decoder = s => s.match(/^function decode\(row: AggregateRow\): TrainingSession \{[\s\S]*?^\}/m)?.[0]?.replaceAll("\r\n", "\n");
  report.saveUnchanged = tail(original) === tail(current); report.decoderUnchanged = decoder(original) === decoder(current);
  report.sqlUnchanged = readFileSync("scripts/shadow-aggregate/explicit-reader.mjs", "utf8").match(/const sql = (`[\s\S]*?`);/)[1] === readFileSync("src/persistence/aggregate-reader.ts", "utf8").match(/const sql = (`[\s\S]*?`);/)[1];
  ensure(report.saveUnchanged && report.decoderUnchanged && report.sqlUnchanged, "PROVEN_SOURCE_CHANGED");
  const { urls, tlsCa } = diagnosisTargets(process.env);
  const [{ PrismaClient, Prisma }, { postgresPoolConfig }, { PrismaTrainingRepository }, { readTrainingAggregate }, { buildFixtures, forkSnapshot, reverseFixtureInserts }, { TrainingCore }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("../src/persistence/prisma-client.ts"), import("../src/persistence/prisma-repository.ts"), import("../src/persistence/aggregate-reader.ts"),
    import("./shadow-aggregate/fixtures.mjs"), import("../src/core.ts")]);
  class Observed extends PrismaPg { async connect() { const a = await super.connect(); observer.attachPool(a.underlyingDriver()); return a; } }
  const config = postgresPoolConfig(urls.session_pooler, { tlsCa }), readers = new Map();
  for (const zone of ["UTC", "Asia/Bangkok", "America/New_York"]) {
    const client = new PrismaClient({ adapter: new Observed({ ...config, options: "-c timezone=" + zone }, { schema: "public" }) });
    clients.push(client); readers.set(zone, { client, repo: new PrismaTrainingRepository(client) });
  }
  const { client, repo } = readers.get("UTC"), scratch = "test-results/phase5f-runtime"; mkdirSync(scratch, { recursive: true });
  const oracle = await loadOracle(scratch), data = await buildFixtures(), fixtures = [];
  for (const t of data.templates) await repo.publish(t);
  for (const f of data.cases) {
    await (f.reverse ? reverseFixtureInserts(new PrismaTrainingRepository(client)) : repo).create(f.snapshot);
    if (f.resultVariant) {
      const value = f.resultVariant === "sql-null" ? Prisma.DbNull : f.resultVariant === "json-null" ? Prisma.JsonNull : f.resultVariant === "empty-array" ? [] : f.resultVariant === "empty-object" ? {}
        : { zero: 0, false: false, null: null, emptyArray: [], emptyObject: {}, nested: [null, { thai: "ภาษาไทย", dateText: "2026-01-01T00:00:00Z" }, [], {}], textNull: "null" };
      await client.trainingResult.update({ where: { sessionId: f.snapshot.id }, data: { decisionSummary: value, trainingScore: null } });
    } fixtures.push(f);
  }
  const signed = { name: "scalar-negative-zero", snapshot: forkSnapshot(data.history) }; await repo.create(signed.snapshot);
  await client.$executeRawUnsafe('UPDATE "public"."SessionOpportunity" SET earned=\'-0\'::double precision WHERE "sessionId"=$1', signed.snapshot.id); fixtures.push(signed);
  report.fixtureCount = fixtures.length;
  for (const [n, f] of fixtures.entries()) {
    const zones = ["physical-reverse", "before-epoch", "millisecond-boundary", "scalar-negative-zero"].includes(f.name) ? [...readers.keys()] : ["UTC"];
    for (const zone of zones) {
      const r = readers.get(zone);
      const old = await r.client.$transaction(tx => tx.trainingSession.findFirst({ where: { id: f.snapshot.id, ownerId: f.snapshot.ownerId }, include: oracle.include }), { isolationLevel: "RepeatableRead", timeout: 15000, maxWait: 5000 });
      const actual = await r.client.$transaction(tx => readTrainingAggregate(tx, f.snapshot.id, f.snapshot.ownerId), { isolationLevel: "RepeatableRead", timeout: 15000, maxWait: 5000 });
      const domain = await observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: n }, () => r.repo.get(f.snapshot.id, f.snapshot.ownerId));
      const queries = observer.exportSamples().at(-1).queries;
      report.cases.push({ case: f.name, timezone: zone, rowMismatches: mismatchCategories(old, actual), domainMismatches: mismatchCategories(oracle.decode(old), domain), orderingViolations: orderingViolations(old),
        statements: queries.length, selects: queries.filter(q => q.command === "SELECT").length, controls: queries.filter(q => ["BEGIN", "SET_ISOLATION", "COMMIT"].includes(q.command)).length });
    } if (n % 10 === 0) progress("parity", { completed: n + 1, total: fixtures.length });
  }
  const sample = fixtures[0].snapshot;
  for (const which of ["missing-session", "other-owner"]) {
    let category; try { await repo.get(which === "missing-session" ? randomUUID() : sample.id, which === "other-owner" ? randomUUID() : sample.ownerId); }
    catch (e) { category = e?.code; } report.ownership.push({ case: which, sameDomainError: category === "SESSION_NOT_FOUND" });
  }
  for (const [table, key] of [["SessionOpportunity", "position"], ["TrainingEvent", "position"], ["TrainingMessage", "position"], ["DialogueTurnReceipt", "committedRevision"]]) {
    const s = forkSnapshot(data.history); await repo.create(s);
    await client.$executeRawUnsafe(`UPDATE "public"."${table}" SET "${key}"=0 WHERE "sessionId"=$1`, s.id);
    let rejected = false; try { await repo.get(s.id, s.ownerId); } catch (e) { rejected = e?.message === "UNSUPPORTED_PERSISTED_ORDERING"; }
    report.malformed.push({ relation: table, rejected, repaired: false });
  }
  const s = forkSnapshot(data.cases.find(f => f.snapshot.status === "ACTIVE").snapshot); await repo.create(s);
  const core = await TrainingCore.create([], repo, () => s.lastActivityAt + 1);
  await client.$transaction(async tx => {
    const first = await readTrainingAggregate(tx, s.id, s.ownerId);
    await core.submit({ sessionId: s.id, ownerId: s.ownerId, actionId: randomUUID(), expectedRevision: s.revision, action: { kind: "QUIT_SESSION" } });
    const second = await readTrainingAggregate(tx, s.id, s.ownerId), latest = await repo.get(s.id, s.ownerId);
    report.coherence = { repeatableSnapshot: !mismatchCategories(first, second).length, freshReadSeesCommit: latest.status === "ABANDONED" && latest.revision === first.revision + 1 };
  }, { isolationLevel: "RepeatableRead", timeout: 15000, maxWait: 5000 });
  report.jsonNullStorage = [];
  for (const f of fixtures.filter(f => ["sql-null", "json-null"].includes(f.resultVariant))) {
    const [row] = await client.$queryRawUnsafe('SELECT "decisionSummary" IS NULL AS sql_null, "decisionSummary"=\'null\'::jsonb AS json_null FROM "public"."TrainingResult" WHERE "sessionId"=$1', f.snapshot.id);
    report.jsonNullStorage.push({ case: f.resultVariant, sqlNull: row.sql_null, jsonNull: row.json_null });
  }
  ensure(report.cases.every(c => !c.rowMismatches.length && !c.domainMismatches.length && !c.orderingViolations.length && c.statements === 4 && c.selects === 1 && c.controls === 3), "RUNTIME_PARITY_OR_COUNT_FAILURE");
  ensure(report.ownership.every(c => c.sameDomainError) && report.malformed.every(c => c.rejected) && Object.values(report.coherence).every(Boolean), "RUNTIME_BOUNDARY_FAILURE");
  report.status = "PASS";
}
try { await main(); } catch (e) { report.status = "FAIL"; report.failureCategory = ["PROVEN_SOURCE_CHANGED", "RUNTIME_PARITY_OR_COUNT_FAILURE", "RUNTIME_BOUNDARY_FAILURE"].includes(e?.message) ? e.message : ["P2028", "P2010"].includes(e?.code) ? e.code : "RUNTIME_AGGREGATE_VERIFICATION_FAILED"; process.exitCode = 1; }
finally {
  await Promise.allSettled(clients.map(c => c.$disconnect())); report.completedAt = new Date().toISOString(); mkdirSync("docs/performance", { recursive: true });
  writeFileSync("docs/performance/postgres-phase5f-parity.json", JSON.stringify(report, null, 2) + "\n"); progress("complete", { status: report.status, cases: report.cases.length });
}
