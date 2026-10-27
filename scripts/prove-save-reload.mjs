// Phase 5G shadow proof only: the Phase 5F SAVE remains authoritative.
import nextEnv from "@next/env";
import { register } from "tsx/esm/api";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { diagnosisTargets } from "./postgres-diagnosis-config.mjs";
import { PostgresDiagnosisObserver } from "./postgres-diagnosis-observer.mjs";
import { loadOracle, mismatchCategories, sameMembersIgnoringOrder } from "./shadow-aggregate/oracle.mjs";
import { installSaveReloadShadow, errorCategory } from "./shadow-aggregate/save-reload.mjs";

register(); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const hash = f => createHash("sha256").update(readFileSync(f)).digest("hex");
const tracked = execFileSync("git", ["ls-files", "src", "prisma", "package.json", "package-lock.json"], { encoding: "utf8" }).trim().split(/\r?\n/);
const runtimeFiles = [...new Set([...tracked, "src/persistence/aggregate-reader.ts"])], clients = [], shadows = [], observer = new PostgresDiagnosisObserver();
const report = { phase: "5G", startedAt: new Date().toISOString(), status: "RUNNING", sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  authoritativeBaseline: "Phase 5F working-tree source digests", runtimeSaveChanged: false, candidateDrivesWrites: false, cases: [], corpus: [],
  recommendation: "DEFER_SAVE_OPTIMIZATION", sourceSha256: Object.fromEntries(runtimeFiles.map(f => [f, hash(f)])),
  proofSha256: Object.fromEntries(["scripts/prove-save-reload.mjs", "scripts/shadow-aggregate/save-reload.mjs", "tests/save-reload-shadow.test.ts"].map(f => [f, hash(f)])) };
const progress = (stage, fields = {}) => { report.stage = stage; console.log(JSON.stringify({ event: "phase5g_save_shadow", stage, ...fields })); };
const ensure = (ok, code) => { if (!ok) throw new Error(code); };
async function main() {
  const f = JSON.parse(readFileSync("docs/performance/postgres-phase5f-parity.json", "utf8"));
  ensure(["src/persistence/prisma-repository.ts", "src/persistence/aggregate-reader.ts"].every(p => f.sourceSha256[p] === hash(p)), "PHASE5F_BASELINE_REQUIRED");
  const { urls, tlsCa } = diagnosisTargets(process.env);
  const [{ PrismaClient, Prisma }, { postgresPoolConfig }, { PrismaTrainingRepository }, { readTrainingAggregate }, { assertUpdate }, { TrainingCore },
    { ScenarioDialogueOrchestrator }, { MockScenarioModelProvider }, { IDLE_TIMEOUT_MS }, fixtureModule, { buildFixtures, forkSnapshot, reverseFixtureInserts, safeActions }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("../src/persistence/prisma-client.ts"), import("../src/persistence/prisma-repository.ts"), import("../src/persistence/aggregate-reader.ts"),
    import("../src/domain/persistence-contract.ts"), import("../src/core.ts"), import("../src/dialogue/orchestrator.ts"), import("../src/dialogue/mock-provider.ts"),
    import("../src/domain/constants.ts"), import("../src/fixtures/sms-phishing-dialogue.ts"), import("./shadow-aggregate/fixtures.mjs")]);
  report.versions = Object.fromEntries(["prisma", "@prisma/client", "@prisma/adapter-pg", "pg"].map(p => [p, JSON.parse(readFileSync(`node_modules/${p}/package.json`, "utf8")).version]));
  ensure(report.versions.prisma === "7.10.0" && report.versions["@prisma/client"] === "7.10.0" && report.versions["@prisma/adapter-pg"] === "7.10.0" && report.versions.pg === "8.23.1", "PINNED_VERSION_REQUIRED");
  const scratch = "test-results/phase5g-save"; mkdirSync(scratch, { recursive: true }); const oracle = await loadOracle(scratch);
  report.decoderSha256 = oracle.decoderSha256;
  class Observed extends PrismaPg { async connect() { const a = await super.connect(); observer.attachPool(a.underlyingDriver()); return a; } }
  let fault = false;
  const config = postgresPoolConfig(urls.session_pooler, { tlsCa }), repos = new Map();
  for (const zone of ["UTC", "Asia/Bangkok", "America/New_York"]) {
    const client = new PrismaClient({ adapter: new Observed({ ...config, options: "-c timezone=" + zone }, { schema: "public" }) }); clients.push(client);
    const repo = new PrismaTrainingRepository(client, { beforeCommit() { if (fault) throw new Error("INJECTED_SHADOW_ROLLBACK"); } });
    const shadow = installSaveReloadShadow(repo, { readAggregate: readTrainingAggregate, decode: oracle.decode, assertUpdate,
      async sample(_label, run) { const value = await observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: 0 }, run); return { value, statements: observer.exportSamples().at(-1).queries.length }; } });
    shadows.push(shadow); repos.set(zone, { repo, client, shadow });
  }
  const { repo, client, shadow } = repos.get("UTC");
  const data = await buildFixtures(); for (const t of data.templates) await repo.publish(t);
  async function current(id, owner) { return repo.get(id, owner); }
  async function caseRun(name, run, flags = {}) { await shadow.run(name, run, flags); report.cases.push({ case: name, status: "PASS" }); progress("case", { case: name, status: "PASS" }); }
  async function harness() {
    let clock = 1000; const core = await TrainingCore.create([fixtureModule.smsPhishingDialogueFixture], repo, () => clock), id = randomUUID(), owner = randomUUID();
    await core.start(id, owner, fixtureModule.smsPhishingDialogueFixture.id, 2);
    const dialogue = new ScenarioDialogueOrchestrator(core, new MockScenarioModelProvider());
    return { id, owner, core, dialogue, advance: () => { clock += IDLE_TIMEOUT_MS; }, current: () => current(id, owner),
      command: async (action, actionId = randomUUID()) => ({ sessionId: id, ownerId: owner, expectedRevision: (await current(id, owner)).revision, actionId, action }),
      async act(action) { return core.submit(await this.command(action)); },
      async say(turnId = randomUUID()) { return dialogue.sendMessage({ sessionId: id, ownerId: owner, expectedRevision: (await current(id, owner)).revision, turnId, text: "ขอรายละเอียดเพิ่มเติม" }); } };
  }
  await caseRun("normal-dialogue-opportunity-events-completion-result-and-replay", async () => {
    const h = await harness(); await h.say("initial-turn");
    for (const action of safeActions) {
      const command = await h.command(action); await h.core.submit(command); const beforeReplay = await h.current(), beforeReloads = shadow.comparisons.length;
      ensure((await h.core.submit(command)).duplicate && !mismatchCategories(beforeReplay, await h.current()).length && shadow.comparisons.length === beforeReloads, "ACTION_REPLAY_WROTE");
    }
    const s = await h.current(); ensure(s.status === "COMPLETED" && s.result && s.events.length > 1, "SAFE_PATH_INCOMPLETE");
  });
  await caseRun("duplicate-dialogue-replay", async () => {
    const h = await harness(), request = { sessionId: h.id, ownerId: h.owner, turnId: "same", expectedRevision: 0, text: "ขอรายละเอียดเพิ่มเติม" };
    await h.dialogue.sendMessage(request); const before = await h.current(), count = shadow.comparisons.length;
    ensure((await h.dialogue.sendMessage(request)).duplicate && shadow.comparisons.length === count && !mismatchCategories(before, await h.current()).length, "TURN_REPLAY_WROTE");
  });
  await caseRun("expiry-only-save-and-competing-expiry", async () => {
    const h = await harness(); await h.say(); const before = await h.current(); h.advance();
    const [a, b] = await Promise.all([h.core.resume(h.id, h.owner), h.core.resume(h.id, h.owner)]);
    ensure(!mismatchCategories(a, b).length && a.status === "EXPIRED" && a.revision === before.revision + 1, "EXPIRY_CAS_MISMATCH");
    for (const k of ["actions", "events", "opportunities", "messages", "dialogueTurns"]) ensure(!mismatchCategories(before[k], a[k]).length, "EXPIRY_CHILDREN_CHANGED");
  });
  await caseRun("stale-revision-no-reload", async () => {
    const h = await harness(), command = await h.command(safeActions[0]); await h.core.submit(command);
    const stale = structuredClone(await h.current()); stale.revision = 1;
    const count = shadow.comparisons.length; let rejected = false;
    try { await repo.save(stale, 0); } catch (e) { rejected = e?.code === "REVISION_CONFLICT"; }
    ensure(rejected && shadow.comparisons.length === count, "STALE_RELOADED");
  });
  await caseRun("concurrent-distinct-CAS-one-winner", async () => {
    const h = await harness(), cmd = await h.command(safeActions[0]), count = shadow.comparisons.length;
    const replies = await Promise.allSettled([h.core.submit(cmd), h.core.submit({ ...cmd, actionId: randomUUID() })]);
    const s = await h.current(); ensure(replies.filter(r => r.status === "fulfilled").length === 1 && replies.some(r => r.status === "rejected" && r.reason?.code === "REVISION_CONFLICT") && s.revision === 1 && s.actions.length === 1 && shadow.comparisons.length === count + 1, "CONCURRENT_CAS_MISMATCH");
  });
  await caseRun("concurrent-duplicate-turn-one-commit", async () => {
    const h = await harness(), request = { sessionId: h.id, ownerId: h.owner, turnId: "racing", expectedRevision: 0, text: "ขอรายละเอียดเพิ่มเติม" }, count = shadow.comparisons.length;
    const r = await Promise.all([h.dialogue.sendMessage(request), h.dialogue.sendMessage(request)]), s = await h.current();
    ensure(r.filter(x => x.duplicate).length === 1 && s.dialogueTurns.length === 1 && s.messages.length === 2 && shadow.comparisons.length === count + 1, "DUPLICATE_CAS_MISMATCH");
  });
  for (const kind of ["decision", "transition", "critical", "dialogue", "safe-result"]) {
    await caseRun("beforeCommit-rollback-and-retry-" + kind, async () => {
      const h = await harness(), setup = kind === "transition" ? 1 : kind === "critical" ? 4 : kind === "safe-result" ? 8 : 0;
      for (const action of safeActions.slice(0, setup)) await h.act(action);
      const before = await h.current(), command = await h.command(kind === "critical" ? { kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-password", confirmed: true } : safeActions[setup]);
      const request = { sessionId: h.id, ownerId: h.owner, turnId: "rollback-turn", expectedRevision: before.revision, text: "ขอรายละเอียดเพิ่มเติม" };
      const run = () => kind === "dialogue" ? h.dialogue.sendMessage(request) : h.core.submit(command);
      fault = true; let rejected = false; try { await run(); } catch (e) { rejected = errorCategory(e) === "INJECTED_SHADOW_ROLLBACK"; } finally { fault = false; }
      ensure(rejected && !mismatchCategories(before, await h.current()).length, "FAULT_ROLLBACK_MISMATCH");
      await run(); const after = await h.current(); ensure(after.revision === before.revision + 1, "FAULT_RETRY_REVISION");
      if (kind === "critical") ensure(after.result?.outcome === "CRITICAL_FAILURE", "CRITICAL_RESULT_MISSING");
      if (kind === "safe-result") ensure(after.status === "COMPLETED" && after.result, "COMPLETION_RESULT_MISSING");
    });
  }
  await caseRun("foreign-key-write-failure-atomic-rollback", async () => {
    const h = await harness(), before = await h.current(), next = structuredClone(before); next.revision++;
    next.actions.push({ id: "fk-action", sessionId: h.id, kind: "DECISION", fingerprint: "fixture", state: "contact", revision: 0, at: 1000, validationStatus: "ACCEPTED" });
    next.opportunities[0].earned = 10;
    next.events.push({ id: "fk-event", sessionId: h.id, actionId: "missing-action", opportunityId: "d1", code: "VERIFY_SOURCE", state: "contact", ruleId: "fixture", authority: "BACKEND_VALIDATED", critical: false, at: 1000 });
    let rejected = false; try { await repo.save(next, 0); } catch { rejected = true; }
    ensure(rejected && !mismatchCategories(before, await h.current()).length, "FK_ROLLBACK_MISMATCH");
  });
  await caseRun("create-fault-seam-no-save-reload", async () => {
    const s = forkSnapshot(data.cases[0].snapshot), count = shadow.comparisons.length;
    fault = true; let rejected = false; try { await repo.create(s); } catch (e) { rejected = errorCategory(e) === "INJECTED_SHADOW_ROLLBACK"; } finally { fault = false; }
    ensure(rejected && shadow.comparisons.length === count && await client.trainingSession.count({ where: { id: s.id } }) === 0, "CREATE_FAULT_ROLLBACK_MISMATCH");
  });
  for (const [name, mutate, expected] of [
    ["owner-identity-tamper", s => { s.ownerId = randomUUID(); }, "SESSION_IDENTITY_IMMUTABLE"],
    ["message-history-tamper", s => { s.messages[0].text = "ข้อความที่ถูกเปลี่ยน"; }, "HISTORY_IMMUTABLE"],
    ["opportunity-identity-tamper", s => { s.opportunities[0].eligibleMaximum++; }, "OPPORTUNITY_IMMUTABLE"],
    ["finalized-opportunity-tamper", s => { s.opportunities[0].earned = 5; }, "OPPORTUNITY_IMMUTABLE"],
  ]) await caseRun(name, async () => {
    const h = await harness(); await h.say(); if (name === "finalized-opportunity-tamper") await h.act(safeActions[0]);
    const before = await h.current(), next = structuredClone(before); next.revision++; mutate(next);
    let code; try { await repo.save(next, before.revision); } catch (e) { code = e?.code; }
    ensure(code === expected && !mismatchCategories(before, await h.current()).length, "VALIDATION_ROLLBACK_MISMATCH");
  }, { probeGetScope: name === "owner-identity-tamper" });
  // Supported and codec stress snapshots: revision-only port saves, not new learner actions.
  for (const [n, source] of data.cases.entries()) {
    for (const zone of ["physical-reverse", "before-epoch", "millisecond-boundary"].includes(source.name) ? ["UTC", "Asia/Bangkok", "America/New_York"] : ["UTC"]) {
      const s = forkSnapshot(source.snapshot), group = repos.get(zone);
      await (source.reverse ? reverseFixtureInserts(new PrismaTrainingRepository(group.client)) : group.repo).create(s);
      if (source.resultVariant) {
        const value = source.resultVariant === "sql-null" ? Prisma.DbNull : source.resultVariant === "json-null" ? Prisma.JsonNull : source.resultVariant === "empty-array" ? [] : source.resultVariant === "empty-object" ? {}
          : { empty: [], object: {}, nested: [null, false, 0, { dateText: "2026-01-01T00:00:00Z", thai: "ภาษาไทย" }] };
        await group.client.trainingResult.update({ where: { sessionId: s.id }, data: { decisionSummary: value } });
      }
      const before = await group.repo.get(s.id, s.ownerId), next = structuredClone(before); next.revision++;
      await group.shadow.run("corpus-" + source.name + "-" + zone, () => group.repo.save(next, before.revision));
      const after = await group.repo.get(s.id, s.ownerId); ensure(!mismatchCategories(next, after).length, "CORPUS_SAVE_MISMATCH");
      report.corpus.push({ case: source.name, timezone: zone, status: "PASS" });
    } if (n % 10 === 0) progress("corpus", { completed: n + 1, total: data.cases.length });
  }
  await caseRun("result-immutability-rejection", async () => {
    const base = data.cases.find(c => c.name === "completed-sms-v2"), s = forkSnapshot(base.snapshot); await repo.create(s);
    const before = await repo.get(s.id, s.ownerId), next = structuredClone(before); next.revision++; next.result.outcome = "NEEDS_PRACTICE";
    let rejected = false; try { await repo.save(next, before.revision); } catch (e) { rejected = e?.code === "RESULT_IMMUTABLE"; }
    ensure(rejected && !mismatchCategories(before, await repo.get(s.id, s.ownerId)).length, "RESULT_ROLLBACK_MISMATCH");
  });
  for (const [table, key] of [["SessionOpportunity", "position"], ["TrainingEvent", "position"], ["TrainingMessage", "position"], ["DialogueTurnReceipt", "committedRevision"]]) {
    await caseRun("malformed-" + table, async () => {
      const s = forkSnapshot(data.history); await repo.create(s);
      await client.$executeRawUnsafe(`UPDATE "public"."${table}" SET "${key}"=0 WHERE "sessionId"=$1`, s.id);
      const raw = () => client.trainingSession.findUniqueOrThrow({ where: { id: s.id }, include: oracle.include });
      const beforeRow = await raw(), before = oracle.decode(beforeRow), next = structuredClone(before); next.revision++;
      let getRejected = false; try { await repo.get(s.id, s.ownerId); } catch (e) { getRejected = e?.message === "UNSUPPORTED_PERSISTED_ORDERING"; }
      const count = shadow.comparisons.length; fault = true;
      try { await repo.save(next, before.revision); } catch {} finally { fault = false; }
      const comparison = shadow.comparisons[count], afterRow = await raw();
      const relations = ["actions", "opportunities", "events", "messages", "turns"];
      const headers = row => Object.fromEntries(Object.entries(row).filter(([key]) => !relations.includes(key)));
      ensure(getRejected && comparison?.candidateError === "UNSUPPORTED_PERSISTED_ORDERING" && !mismatchCategories(headers(beforeRow), headers(afterRow)).length && relations.every(r => sameMembersIgnoringOrder(beforeRow[r], afterRow[r])), "MALFORMED_NOT_REJECTED_OR_REPAIRED");
    }, { malformed: true });
  }
  report.attempts = shadows.flatMap(s => s.attempts); report.comparisons = shadows.flatMap(s => s.comparisons);
  const supported = report.comparisons.filter(c => !c.malformed), malformed = report.comparisons.filter(c => c.malformed);
  ensure(supported.every(c => !c.candidateError && !c.rowMismatches.length && !c.domainMismatches.length && c.baselineValidation === c.candidateValidation && c.postCasRevisionEquivalent && c.baselineStatements === 8 && c.candidateStatements === 1), "POST_CAS_PARITY_FAILED");
  ensure(malformed.length === 4 && malformed.every(c => c.candidateError === "UNSUPPORTED_PERSISTED_ORDERING"), "MALFORMED_REJECTION_FAILED");
  ensure(report.attempts.filter(a => a.casMatched === false).every(a => a.reloads === 0), "STALE_CAS_RELOADED");
  report.summary = { supportedComparisons: supported.length, exactMatches: supported.length, malformedRejections: malformed.length, baselineReloadSelects: 8, candidateReloadSelects: 1,
    staleCasAttempts: report.attempts.filter(a => a.casMatched === false).length, getScopedOwnerProbe: supported.some(c => c.case === "owner-identity-tamper" && c.unadaptedGetScopeReturnedNull === true) };
  ensure(report.summary.getScopedOwnerProbe, "IDENTITY_SCOPE_PROOF_MISSING");
  report.status = "PASS"; report.recommendation = "IMPLEMENT_SAVE_ONE_SELECT";
}
try { await main(); } catch (e) { report.status = "FAIL"; report.failureCategory = /^[A-Z_]{3,70}$/.test(e?.message ?? "") ? e.message : errorCategory(e); process.exitCode = 1; }
finally {
  await Promise.allSettled(clients.map(c => c.$disconnect()));
  report.attempts ??= shadows.flatMap(s => s.attempts); report.comparisons ??= shadows.flatMap(s => s.comparisons);
  report.runtimeUnchanged = runtimeFiles.every(f => hash(f) === report.sourceSha256[f]);
  report.proofUnchanged = Object.entries(report.proofSha256).every(([f, sha]) => hash(f) === sha);
  if (!report.runtimeUnchanged || !report.proofUnchanged) { report.status = "FAIL"; report.recommendation = "DEFER_SAVE_OPTIMIZATION"; process.exitCode = 1; }
  report.completedAt = new Date().toISOString(); mkdirSync("docs/performance", { recursive: true }); writeFileSync("docs/performance/postgres-phase5g-save-proof.json", JSON.stringify(report, null, 2) + "\n");
  progress("complete", { status: report.status, recommendation: report.recommendation, comparisons: report.comparisons?.length ?? 0 });
}
