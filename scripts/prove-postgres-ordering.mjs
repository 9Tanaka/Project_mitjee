// Phase 5E: dedicated fixture proof only. No authoritative GET/SAVE changes.
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { diagnosisTargets } from "./postgres-diagnosis-config.mjs";
import { loadOracle, mismatchCategories } from "./shadow-aggregate/oracle.mjs";
import { readExplicit } from "./shadow-aggregate/explicit-reader.mjs";
import { orderingViolations, domainOrderingViolations, writerFacts, coreFacts, orderedRelations } from "./shadow-aggregate/ordering-contract.mjs";
import { PostgresDiagnosisObserver, classifyStatement } from "./postgres-diagnosis-observer.mjs";

register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const protectedFiles = git("ls-files", "src", "prisma", "package.json", "package-lock.json").split(/\r?\n/);
const report = { phase: "5E", sourceCommit: git("rev-parse", "HEAD"), startedAt: new Date().toISOString(), status: "RUNNING",
  runtimePromoted: false, saveChanged: false, nativeCandidateUsed: false, schemaChanged: false, secondarySortAdded: false,
  protectedSourceSha256: Object.fromEntries(protectedFiles.map(f => [f, hash(f)])),
  proofSourceSha256: Object.fromEntries(["scripts/prove-postgres-ordering.mjs", "scripts/shadow-aggregate/ordering-contract.mjs", "scripts/shadow-aggregate/fixtures.mjs", "scripts/shadow-aggregate/explicit-reader.mjs", "tests/ordering-contract.test.ts"].map(f => [f, hash(f)])),
  versions: Object.fromEntries(["prisma", "@prisma/client", "@prisma/adapter-pg", "pg"].map(p => [p, JSON.parse(readFileSync(`node_modules/${p}/package.json`, "utf8")).version])),
  cases: [], semanticCases: [], recommendation: "DEFER_AND_DEFINE_ORDERING_MIGRATION" };
const observer = new PostgresDiagnosisObserver(), clients = [], fixtureIds = [];
const progress = (stage, details = {}) => console.log(JSON.stringify({ event: "phase5e_ordering", stage, ...details }));
const ensure = (condition, code) => { if (!condition) throw new Error(code); };

function historyAudit() {
  return [["src/persistence/prisma-repository.ts", writerFacts], ["src/core.ts", coreFacts]].map(([file, facts]) => {
    const revisions = [...new Set([report.sourceCommit, ...git("log", "--all", "--format=%H", "--", file).split(/\r?\n/).filter(Boolean)])];
    return { file, revisions: revisions.map(commit => { const source = git("show", `${commit}:${file}`); return { commit, sha256: createHash("sha256").update(source).digest("hex"), facts: facts(source) }; }) };
  });
}
function legacyAudit() {
  const root = process.env.USERPROFILE + "/.codex/.chatgpt-projects/g-p-6a7468f2e2d8819197c81d86cba074ea/mitjee-core/.local-mysql/data/";
  return ["mitjee_test", "mitjee_test_verification"].map(name => {
    const dir = root + name, present = existsSync(dir);
    return { fixtureDatabase: name, offlineDirectoryPresent: present, tableFiles: present ? readdirSync(dir).filter(f => /^(sessionopportunity|trainingevent|trainingmessage|dialogueturnreceipt)\.ibd$/i.test(f)).length : 0,
      inspection: "READ_ONLY_FILE_METADATA", logicalRowScan: "NOT_RUN_OFFLINE_SERVER_NOT_STARTED", sourceFilesModified: false };
  });
}
async function main() {
  ensure(report.versions.prisma === "7.10.0" && report.versions["@prisma/client"] === "7.10.0" && report.versions["@prisma/adapter-pg"] === "7.10.0" && report.versions.pg === "8.23.1", "PINNED_VERSION_REQUIRED");
  report.history = historyAudit(); report.localMySQL = legacyAudit();
  ensure(report.history.every(h => h.revisions.every(r => Object.values(r.facts).every(Boolean))), "UNCLASSIFIED_HISTORICAL_WRITER");
  const { urls, tlsCa } = diagnosisTargets(process.env);
  const [{ PrismaClient }, { postgresPoolConfig }, { PrismaTrainingRepository }, { TrainingCore }, { ScenarioDialogueOrchestrator }, { MockScenarioModelProvider }, { IDLE_TIMEOUT_MS }, { smsPhishingDialogueFixture }, { buildFixtures, reverseFixtureInserts, safeActions }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("../src/persistence/prisma-client.ts"), import("../src/persistence/prisma-repository.ts"), import("../src/core.ts"),
    import("../src/dialogue/orchestrator.ts"), import("../src/dialogue/mock-provider.ts"), import("../src/domain/constants.ts"), import("../src/fixtures/sms-phishing-dialogue.ts"), import("./shadow-aggregate/fixtures.mjs")]);
  class Observed extends PrismaPg { async connect() { const a = await super.connect(); observer.attachPool(a.underlyingDriver()); return a; } }
  class CandidateReadOnly extends Observed { async connect() {
    const a = await super.connect(), pool = a.underlyingDriver(), Base = pool.Client;
    pool.Client = class extends Base { query(...args) {
      const c = classifyStatement(typeof args[0] === "string" ? args[0] : args[0]?.text).command;
      if (!["SELECT", "BEGIN", "SET", "SET_ISOLATION", "COMMIT", "ROLLBACK"].includes(c)) { report.candidateWriteAttempts = (report.candidateWriteAttempts ?? 0) + 1; throw new Error("CANDIDATE_WRITE_FORBIDDEN"); }
      return super.query(...args);
    } }; return a;
  } }
  const config = postgresPoolConfig(urls.session_pooler, { tlsCa });
  const baseline = new PrismaClient({ adapter: new Observed(config, { schema: "public" }) }); clients.push(baseline);
  const candidate = new PrismaClient({ adapter: new CandidateReadOnly(config, { schema: "public" }) }); clients.push(candidate);
  const repo = new PrismaTrainingRepository(baseline), scratch = "test-results/phase5e-ordering"; mkdirSync(scratch, { recursive: true });
  const oracle = await loadOracle(scratch); report.decoderSha256 = oracle.decoderSha256;
  async function scan(ids) {
    if (ids) ensure(ids.length > 0, "EMPTY_CORPUS_SCOPE");
    return baseline.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); const rows = [];
      for (const [table, , key] of orderedRelations) {
        // All identifiers are from the closed constant list; values are bound.
        const sql = `WITH scoped AS (SELECT "sessionId", "${key}" AS k FROM "public"."${table}"${ids ? ' WHERE "sessionId"=ANY($1::text[])' : ''}), g AS (SELECT "sessionId", k, COUNT(*) AS n FROM scoped GROUP BY "sessionId", k HAVING COUNT(*)>1)
          SELECT (SELECT COUNT(*)::int FROM scoped) AS rows, COUNT(*)::int AS groups, COUNT(DISTINCT "sessionId")::int AS sessions, COALESCE(SUM(n-1),0)::int AS extra, COUNT(*) FILTER(WHERE k=0)::int AS zero_groups FROM g`;
        const [r] = await tx.$queryRawUnsafe(sql, ...(ids ? [ids] : []));
        rows.push({ relation: table, key, rows: r.rows, duplicateGroups: r.groups, affectedSessions: r.sessions, excessRows: r.extra, zeroKeyGroups: r.zero_groups });
      } return rows;
    }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  }
  report.databaseScanBefore = await scan(); progress("existing_database_scanned", { relations: 4 });
  const data = await buildFixtures(); for (const t of data.templates) await repo.publish(t);
  const fixtures = data.cases.filter(f => !f.resultVariant); // No raw-JSON mutation or deliberately tied stress rows.
  report.excludedFromSupportedCorpus = { directJsonMutationFixtures: data.cases.filter(f => f.resultVariant).length, tiedOrderingStress: true, signedZeroStress: true };
  for (const f of fixtures) { await (f.reverse ? reverseFixtureInserts(new PrismaTrainingRepository(baseline)) : repo).create(f.snapshot); fixtureIds.push(f.snapshot.id); }
  report.supportedFixtureCount = fixtures.length;
  for (const [index, f] of fixtures.entries()) {
    for (const timezone of ["physical-reverse", "before-epoch", "millisecond-boundary"].includes(f.name) ? ["UTC", "Asia/Bangkok", "America/New_York"] : ["UTC"]) {
      async function load(client, explicit) {
        return client.$transaction(async tx => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          if (timezone !== "UTC") await tx.$executeRawUnsafe(timezone === "Asia/Bangkok" ? "SET LOCAL TIME ZONE 'Asia/Bangkok'" : "SET LOCAL TIME ZONE 'America/New_York'");
          return observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: 0 }, () => explicit ? readExplicit(tx, f.snapshot.id, f.snapshot.ownerId)
            : tx.trainingSession.findFirst({ where: { id: f.snapshot.id, ownerId: f.snapshot.ownerId }, include: oracle.include }));
        }, { isolationLevel: "RepeatableRead", timeout: 15000 });
      }
      const reference = await load(baseline, false), actualDomain = await repo.get(f.snapshot.id, f.snapshot.ownerId), actual = await load(candidate, true);
      report.cases.push({ case: f.name, timezone, rowMismatches: mismatchCategories(reference, actual), domainMismatches: mismatchCategories(actualDomain, oracle.decode(actual)),
        oracleMatchesRepository: !mismatchCategories(actualDomain, oracle.decode(reference)).length, orderingViolations: orderingViolations(reference), candidateSelects: observer.exportSamples().at(-1).queries.length });
    }
    if (index % 10 === 0) progress("supported_parity", { completed: index + 1, total: fixtures.length });
  }
  // Existing Core/repository commit paths only. No candidate drives these commands.
  async function harness(faulty = false) {
    let now = 1000, fail = false;
    const repository = faulty ? new PrismaTrainingRepository(baseline, { beforeCommit() { if (fail) throw new Error("INJECTED_ORDERING_ROLLBACK"); } }) : repo;
    const core = await TrainingCore.create([smsPhishingDialogueFixture], repository, () => now), id = randomUUID(), owner = randomUUID(); fixtureIds.push(id);
    await core.start(id, owner, smsPhishingDialogueFixture.id, smsPhishingDialogueFixture.version);
    const dialogue = new ScenarioDialogueOrchestrator(core, new MockScenarioModelProvider());
    return { core, repository, id, owner, dialogue, setFail: v => { fail = v; }, expire: () => { now += IDLE_TIMEOUT_MS; },
      current: () => repository.get(id, owner), request: (turnId, revision) => ({ sessionId: id, ownerId: owner, turnId, expectedRevision: revision, text: "ขอรายละเอียดเพิ่มเติม" }),
      async check() { const row = await baseline.trainingSession.findFirst({ where: { id, ownerId: owner }, include: oracle.include }); ensure(row && !orderingViolations(row).length, "SUPPORTED_WRITER_ORDERING_VIOLATION"); return repository.get(id, owner); } };
  }
  async function semantic(name, run) { await run(); report.semanticCases.push({ case: name, status: "PASS" }); progress("semantic", { case: name, status: "PASS" }); }
  await semantic("safe-multi-turn-and-action-replay", async () => {
    const h = await harness();
    for (const [n, action] of safeActions.entries()) {
      const s = await h.current(), request = h.request("ordering-turn-" + n, s.revision); await h.dialogue.sendMessage(request); const afterTurn = await h.check();
      const replay = await h.dialogue.sendMessage(request); ensure(replay.duplicate && isDeepStrictEqual(afterTurn, await h.current()), "TURN_REPLAY_CHANGED_HISTORY");
      const command = { sessionId: h.id, ownerId: h.owner, expectedRevision: afterTurn.revision, actionId: "ordering-action-" + n, action };
      await h.core.submit(command); const afterAction = await h.check();
      ensure((await h.core.submit(command)).duplicate && isDeepStrictEqual(afterAction, await h.current()), "ACTION_REPLAY_CHANGED_HISTORY");
    } ensure((await h.current()).status === "COMPLETED", "SAFE_PATH_INCOMPLETE");
  });
  await semantic("concurrent-distinct-turns-one-CAS-winner", async () => {
    const h = await harness(), replies = await Promise.allSettled(["turn-a", "turn-b"].map(id => h.dialogue.sendMessage(h.request(id, 0))));
    ensure(replies.filter(r => r.status === "fulfilled").length === 1 && replies.some(r => r.status === "rejected" && r.reason?.code === "REVISION_CONFLICT"), "CAS_WINNER_INCORRECT");
    const s = await h.check(); ensure(s.revision === 1 && s.dialogueTurns.length === 1 && s.messages.length === 2, "CAS_PARTIAL_HISTORY");
  });
  await semantic("concurrent-duplicate-turn-one-receipt", async () => {
    const h = await harness(), request = h.request("duplicate", 0), replies = await Promise.all([h.dialogue.sendMessage(request), h.dialogue.sendMessage(request)]);
    const s = await h.check(); ensure(replies.filter(r => r.duplicate).length === 1 && s.revision === 1 && s.dialogueTurns.length === 1 && s.messages.length === 2, "DUPLICATE_TURN_HISTORY");
  });
  await semantic("rollback-then-same-turn-retry", async () => {
    const h = await harness(true), before = await h.current(), request = h.request("rollback", 0); h.setFail(true); let rejected = false;
    try { await h.dialogue.sendMessage(request); } catch (e) { rejected = e?.message === "INJECTED_ORDERING_ROLLBACK"; }
    ensure(rejected && isDeepStrictEqual(before, await h.check()), "ROLLBACK_CHANGED_HISTORY");
    h.setFail(false); await h.dialogue.sendMessage(request); const s = await h.check(); ensure(s.dialogueTurns.length === 1 && s.dialogueTurns[0].committedRevision === 1, "ROLLBACK_RETRY_REVISION");
  });
  await semantic("resume-expiry-competing-CAS-and-ownership", async () => {
    const h = await harness(); await h.dialogue.sendMessage(h.request("before-expiry", 0)); const before = await h.check();
    ensure(isDeepStrictEqual(before, await h.core.resume(h.id, h.owner)), "RESUME_CHANGED_HISTORY");
    let denied = false; try { await h.core.resume(h.id, randomUUID()); } catch (e) { denied = e?.code === "SESSION_NOT_FOUND"; } ensure(denied, "OWNERSHIP_FAILURE");
    h.expire(); const [a, b] = await Promise.all([h.core.resume(h.id, h.owner), h.core.resume(h.id, h.owner)]);
    ensure(isDeepStrictEqual(a, b) && a.status === "EXPIRED" && a.revision === before.revision + 1, "EXPIRY_CAS_FAILURE");
    for (const k of ["opportunities", "events", "messages", "dialogueTurns"]) ensure(isDeepStrictEqual(a[k], before[k]), "EXPIRY_CHANGED_CHILDREN"); await h.check();
  });
  await semantic("critical-and-abandoned-paths", async () => {
    const h = await harness(); for (const [n, action] of safeActions.slice(0, 4).entries()) { const s = await h.current(); await h.core.submit({ sessionId: h.id, ownerId: h.owner, actionId: "critical-step-" + n, expectedRevision: s.revision, action }); await h.check(); }
    const before = await h.current(); await h.core.submit({ sessionId: h.id, ownerId: h.owner, actionId: "critical", expectedRevision: before.revision, action: { kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-password", confirmed: true } });
    ensure((await h.check()).status === "FAILED", "CRITICAL_PATH_FAILURE");
    const q = await harness(); await q.core.submit({ sessionId: q.id, ownerId: q.owner, actionId: "quit", expectedRevision: 0, action: { kind: "QUIT_SESSION" } }); ensure((await q.check()).status === "ABANDONED", "QUIT_PATH_FAILURE");
  });
  report.supportedCorpusScan = await scan(fixtureIds);
  report.writerClassifications = orderedRelations.map(([relation, , key]) => ({ relation, key, classification: "GUARANTEED_UNIQUE_BY_SUPPORTED_WRITERS", externalOrForgedSnapshotsCoveredByGuarantee: false }));
  ensure(report.cases.every(c => !c.rowMismatches.length && !c.domainMismatches.length && !c.orderingViolations.length && c.oracleMatchesRepository && c.candidateSelects === 1), "SUPPORTED_PARITY_FAILURE");
  ensure(report.supportedCorpusScan.every(c => c.duplicateGroups === 0), "SUPPORTED_CORPUS_TIES");
  report.status = "PASS"; report.recommendation = "PROMOTE_EXPLICIT_GET_SHADOW_TO_RUNTIME";
}
try { await main(); } catch { report.status = "FAIL"; report.failureCategory = "ORDERING_PROOF_FAILED"; process.exitCode = 1; }
finally {
  await Promise.allSettled(clients.map(c => c.$disconnect())); report.candidateWriteAttempts ??= 0;
  report.protectedSourcesUnchanged = protectedFiles.every(f => hash(f) === report.protectedSourceSha256[f]);
  report.completedAt = new Date().toISOString(); mkdirSync("docs/performance", { recursive: true });
  writeFileSync("docs/performance/postgres-phase5e-evidence.json", JSON.stringify(report, null, 2) + "\n"); progress("complete", { status: report.status, recommendation: report.recommendation });
}
