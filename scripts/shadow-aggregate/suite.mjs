import { randomUUID, createHash } from "node:crypto";
import { buildFixtures, forkSnapshot, reverseFixtureInserts } from "./fixtures.mjs";
import { mismatchCategories, loadOracle, sameMembersIgnoringOrder } from "./oracle.mjs";
import { readExplicit } from "./explicit-reader.mjs";

const code = e => /getTime is not a function/.test(e?.message) ? "TIMESTAMP_HYDRATION" : ["P2010", "P2026", "P2028"].includes(e?.code) ? e.code : "READ_OR_DECODE_FAILURE";
export async function runSuite({ baseline, native, explicit, repo, observer, oracle, scratch, PrismaTrainingRepository, Prisma, progress, evidence }) {
  const fixtureData = await buildFixtures(), cases = [], fixtures = [], counts = [];
  for (const t of fixtureData.templates) await repo.publish(t);
  for (const fixture of fixtureData.cases) {
    const writer = fixture.reverse ? reverseFixtureInserts(new PrismaTrainingRepository(baseline)) : repo;
    await writer.create(fixture.snapshot);
    if (fixture.resultVariant) {
      const value = fixture.resultVariant === "sql-null" ? Prisma.DbNull : fixture.resultVariant === "json-null" ? Prisma.JsonNull : fixture.resultVariant === "empty-object" ? {} : fixture.resultVariant === "empty-array" ? []
        : { zero: 0, false: false, null: null, emptyArray: [], emptyObject: {}, nested: [null, { thai: "ภาษาไทย", dateText: "2026-01-01T00:00:00Z" }, [], {}], textNull: "null" };
      await baseline.trainingResult.update({ where: { sessionId: fixture.snapshot.id }, data: { decisionSummary: value, trainingScore: null } });
    }
    fixtures.push(fixture);
  }
  // Dedicated codec stress row: a double's signed zero must not silently change.
  const signed = { name: "scalar-negative-zero", snapshot: forkSnapshot(fixtureData.history) };
  await repo.create(signed.snapshot);
  await baseline.$executeRawUnsafe('UPDATE "public"."SessionOpportunity" SET earned=\'-0\'::double precision WHERE "sessionId"=$1', signed.snapshot.id);
  fixtures.push(signed);
  async function load(client, fixture, strategy, timezone = "UTC", writerBetween) {
    return client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      if (timezone !== "UTC") await tx.$executeRawUnsafe(timezone === "Asia/Bangkok" ? "SET LOCAL TIME ZONE 'Asia/Bangkok'" : "SET LOCAL TIME ZONE 'America/New_York'");
      return observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: 0 }, async () => strategy === "explicit"
        ? readExplicit(tx, fixture.snapshot.id, fixture.snapshot.ownerId)
        : tx.trainingSession.findFirst({ where: { id: fixture.snapshot.id, ownerId: fixture.snapshot.ownerId }, include: oracle.include,
          ...(strategy === "baseline" ? {} : { relationLoadStrategy: strategy }) }));
    }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  }
  async function differential(strategy, client) {
    const results = [];
    for (const [index, fixture] of fixtures.entries()) {
      const zones = ["physical-reverse", "before-epoch", "millisecond-boundary", "scalar-negative-zero"].includes(fixture.name) ? ["UTC", "Asia/Bangkok", "America/New_York"] : ["UTC"];
      for (const timezone of zones) {
        let result = { case: fixture.name, timezone, rowMismatches: [], domainMismatches: [] };
        try {
          const reference = await load(baseline, fixture, "baseline", timezone);
          const baselineDomain = await repo.get(fixture.snapshot.id, fixture.snapshot.ownerId);
          const actual = await load(client, fixture, strategy, timezone);
          result.statements = observer.exportSamples().at(-1).queries.length;
          result.rowMismatches = mismatchCategories(reference, actual);
          result.domainMismatches = mismatchCategories(baselineDomain, oracle.decode(actual));
          result.oracleMatchesActualRepository = mismatchCategories(baselineDomain, oracle.decode(reference)).length === 0;
          if (!result.oracleMatchesActualRepository) result.domainMismatches.push("ORACLE_REFERENCE_MISMATCH");
        } catch (e) { result.error = code(e); }
        results.push(result);
      }
      if (index % 10 === 0) progress("differential", { strategy, completed: index + 1, total: fixtures.length });
    }
    return results;
  }
  const nativeCases = native ? await differential("join", native) : [];
  evidence.nativeCases = nativeCases;
  const failed = rows => rows.some(r => r.error || r.rowMismatches.length || r.domainMismatches.length);
  let explicitCases = !native || failed(nativeCases) ? await differential("explicit", explicit) : [];
  evidence.explicitCases = explicitCases;
  let selected = explicitCases.length ? "explicit" : "join", candidate = selected === "explicit" ? explicit : native;
  const target = fixtures.find(f => f.name === "physical-reverse");
  // Wrong-owner/absent roots: both return no row. Candidate has no Core authority.
  const ownership = [];
  for (const which of ["other-owner", "missing-session"]) {
    const f = { snapshot: { ...target.snapshot, ...(which === "other-owner" ? { ownerId: randomUUID() } : { id: randomUUID() }) } };
    const a = await load(baseline, f, "baseline"), b = await load(candidate, f, selected);
    ownership.push({ case: which, baselineNull: a === null, candidateNull: b === null });
  }
  let ties = []; const tieFixtures = [];
  for (const [table, key] of [["SessionOpportunity", "position"], ["TrainingEvent", "position"], ["TrainingMessage", "position"], ["DialogueTurnReceipt", "committedRevision"]]) {
    const f = { name: "tied-" + table, snapshot: forkSnapshot(fixtureData.history) }; await reverseFixtureInserts(new PrismaTrainingRepository(baseline)).create(f.snapshot);
    await baseline.$executeRawUnsafe(`UPDATE "public"."${table}" SET "${key}"=0 WHERE "sessionId"=$1`, f.snapshot.id);
    tieFixtures.push({ table, key, fixture: f });
    const orders = new Set(), mismatches = [], membersEqual = [];
    for (let n = 0; n < 3; n++) {
      const a = await load(baseline, f, "baseline"), b = await load(candidate, f, selected);
      orders.add(createHash("sha256").update(JSON.stringify(a)).digest("hex"));
      mismatches.push(mismatchCategories(a, b));
      const key = { SessionOpportunity: "opportunities", TrainingEvent: "events", TrainingMessage: "messages", DialogueTurnReceipt: "turns" }[table];
      membersEqual.push(sameMembersIgnoringOrder(a[key], b[key]));
    }
    ties.push({ relation: table, orderingKey: key, repetitions: 3, distinctBaselineRepresentations: orders.size, mismatches, sameMembersIgnoringOrder: membersEqual,
      deterministicTotalOrderGuaranteed: false, tieBreakerAdded: false });
  }
  const nativeTies = selected === "join" ? ties : [];
  if (selected === "join" && ties.some(t => t.mismatches.some(m => m.length))) {
    explicitCases = await differential("explicit", explicit); selected = "explicit"; candidate = explicit;
    ties = [];
    for (const { table, key, fixture } of tieFixtures) {
      const mismatches = [], orders = new Set(), membersEqual = [];
      for (let n = 0; n < 3; n++) {
        const a = await load(baseline, fixture, "baseline"), b = await load(explicit, fixture, "explicit");
        orders.add(createHash("sha256").update(JSON.stringify(a)).digest("hex")); mismatches.push(mismatchCategories(a, b));
        const relationKey = { SessionOpportunity: "opportunities", TrainingEvent: "events", TrainingMessage: "messages", DialogueTurnReceipt: "turns" }[table];
        membersEqual.push(sameMembersIgnoringOrder(a[relationKey], b[relationKey]));
      }
      ties.push({ relation: table, orderingKey: key, repetitions: 3, distinctBaselineRepresentations: orders.size, mismatches, sameMembersIgnoringOrder: membersEqual, deterministicTotalOrderGuaranteed: false, tieBreakerAdded: false });
    }
    ownership.length = 0;
    for (const which of ["other-owner", "missing-session"]) {
      const f = { snapshot: { ...target.snapshot, ...(which === "other-owner" ? { ownerId: randomUUID() } : { id: randomUUID() }) } };
      ownership.push({ case: which, baselineNull: await load(baseline, f, "baseline") === null, candidateNull: await load(explicit, f, "explicit") === null });
    }
  }
  const quizOracle = await loadOracle(scratch, "quiz"), quiz = [];
  const quizId = randomUUID(), quizOwner = randomUUID();
  await baseline.quizAttempt.create({ data: { id: quizId, ownerId: quizOwner, mode: "PRE_TEST", bankVersion: "shadow", blueprint: "shadow", status: "COMPLETED", revision: 3,
    startedAt: new Date(-1234), completedAt: new Date(1234), snapshot: { questions: [], baseline: null, nested: [false, 0, null, {}, []] }, answers: {}, result: Prisma.DbNull } });
  for (const revision of [3, 1, 2]) await baseline.quizReceipt.create({ data: { attemptId: quizId, requestId: randomUUID(), fingerprint: "0".repeat(64), revision } });
  for (const operation of ["get", "recent", "latestPreTest"]) {
   let reference;
   for (const strategy of ["baseline", "default", "query", "join"]) {
    if (strategy !== "baseline" && !native) continue;
    const client = strategy === "baseline" ? baseline : native;
    const row = await client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: 0 }, () => {
        const opts = { where: operation === "get" ? { id: quizId, ownerId: quizOwner } : operation === "recent" ? { ownerId: quizOwner }
          : { ownerId: quizOwner, bankVersion: "shadow", blueprint: "shadow", mode: "PRE_TEST", status: "COMPLETED", completedAt: { lte: new Date(2000) } }, include: quizOracle.include,
          ...(strategy === "baseline" || strategy === "default" ? {} : { relationLoadStrategy: strategy }) };
        return operation === "recent" ? tx.quizAttempt.findMany({ ...opts, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 50 })
          : tx.quizAttempt.findFirst({ ...opts, ...(operation === "latestPreTest" ? { orderBy: [{ completedAt: "desc" }, { id: "desc" }] } : {}) });
      });
    }, { isolationLevel: "RepeatableRead" });
    if (strategy === "baseline") reference = row;
    const decode = value => Array.isArray(value) ? value.map(quizOracle.decode) : quizOracle.decode(value);
    quiz.push({ operation, strategy, statements: observer.exportSamples().at(-1).queries.length, rowMismatches: mismatchCategories(reference, row), domainMismatches: mismatchCategories(decode(reference), decode(row)) });
   }
  }
  // Same repeatable-read transaction, writer commits between read opportunities.
  const concurrency = [];
  for (const strategy of ["baseline", selected]) {
    const f = { name: "coherence", snapshot: forkSnapshot(fixtureData.history) };
    // Use an ACTIVE fixture so the unchanged Core may authoritatively quit.
    f.snapshot = forkSnapshot(fixtures.find(f => f.snapshot.status === "ACTIVE").snapshot); await repo.create(f.snapshot);
    const client = strategy === "baseline" ? baseline : candidate;
    const { TrainingCore } = await import("../../src/core.ts"); const core = await TrainingCore.create([], repo, () => f.snapshot.lastActivityAt + 1);
    await client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const read = () => strategy === "explicit" ? readExplicit(tx, f.snapshot.id, f.snapshot.ownerId)
        : tx.trainingSession.findFirst({ where: { id: f.snapshot.id, ownerId: f.snapshot.ownerId }, include: oracle.include, ...(strategy === "baseline" ? {} : { relationLoadStrategy: strategy }) });
      const first = await read();
      await core.submit({ sessionId: f.snapshot.id, ownerId: f.snapshot.ownerId, actionId: randomUUID(), expectedRevision: f.snapshot.revision, action: { kind: "QUIT_SESSION" } });
      const second = await read(); const latest = await repo.get(f.snapshot.id, f.snapshot.ownerId);
      concurrency.push({ strategy, repeatableSnapshotEqual: mismatchCategories(first, second).length === 0, latestRevisionAdvanced: latest.revision === first.revision + 1, latestStatus: latest.status,
        firstChildrenUnchanged: first.actions.length === second.actions.length });
    }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  }
  const expiryFixture = { snapshot: forkSnapshot(fixtures.find(f => f.snapshot.status === "ACTIVE").snapshot) }; await repo.create(expiryFixture.snapshot);
  const beforeExpiry = await load(candidate, expiryFixture, selected);
  const { TrainingCore } = await import("../../src/core.ts"), { IDLE_TIMEOUT_MS } = await import("../../src/domain/constants.ts");
  const expiryCore = await TrainingCore.create([], repo, () => expiryFixture.snapshot.lastActivityAt + IDLE_TIMEOUT_MS);
  const expired = await expiryCore.resume(expiryFixture.snapshot.id, expiryFixture.snapshot.ownerId), candidateExpired = await load(candidate, expiryFixture, selected);
  const expiry = { candidateDidNotExpireOrWrite: beforeExpiry.status === "ACTIVE" && beforeExpiry.revision === expiryFixture.snapshot.revision,
    authoritativeCoreExpired: expired.status === "EXPIRED" && expired.revision === expiryFixture.snapshot.revision + 1,
    domainMismatches: mismatchCategories(expired, oracle.decode(candidateExpired)) };
  const candidateTransactionCounts = [];
  for (const strategy of ["baseline", selected]) {
    const client = strategy === "baseline" ? baseline : candidate;
    await observer.sample({ endpoint: "session_pooler", operation: "get", phase: "control", index: 0 }, () => client.$transaction(tx => strategy === "explicit"
      ? readExplicit(tx, target.snapshot.id, target.snapshot.ownerId) : tx.trainingSession.findFirst({ where: { id: target.snapshot.id, ownerId: target.snapshot.ownerId }, include: oracle.include, ...(strategy === "baseline" ? {} : { relationLoadStrategy: strategy }) }), { isolationLevel: "RepeatableRead", timeout: 15000 }));
    const sample = observer.exportSamples().at(-1);
    candidateTransactionCounts.push({ strategy, total: sample.queries.length, selects: sample.queries.filter(q => q.command === "SELECT").length, commands: sample.queries.map(q => q.command) });
  }
  const physical = await baseline.$queryRawUnsafe('SELECT position FROM "public"."TrainingMessage" WHERE "sessionId"=$1 ORDER BY ctid', target.snapshot.id);
  const physicalInsertionAudit = { messageRows: physical.length, physicalOrderDiffersFromLogical: physical.some((r, i) => r.position !== i), logicalOrderUnchanged: true };
  const jsonNullStorage = [];
  for (const f of fixtures.filter(f => ["sql-null", "json-null"].includes(f.resultVariant))) {
    const r = await baseline.$queryRawUnsafe('SELECT "decisionSummary" IS NULL AS sql_null, "decisionSummary"=\'null\'::jsonb AS json_null FROM "public"."TrainingResult" WHERE "sessionId"=$1', f.snapshot.id);
    jsonNullStorage.push({ case: f.resultVariant, sqlNull: r[0].sql_null, jsonNull: r[0].json_null });
  }
  const coverage = { statuses: [...new Set(fixtures.map(f => f.snapshot.status))].sort(), outcomes: [...new Set(fixtures.map(f => f.snapshot.result?.outcome).filter(Boolean))].sort(),
    variants: [...new Set(fixtures.map(f => f.snapshot.variant))].sort(),
    relationCardinalities: Object.fromEntries(["actions", "opportunities", "events", "messages", "dialogueTurns"].map(k => [k, { empty: fixtures.some(f => f.snapshot[k].length === 0), one: fixtures.some(f => f.snapshot[k].length === 1), many: fixtures.some(f => f.snapshot[k].length > 1) }])),
    legacyMissingAssessment: fixtures.some(f => f.snapshot.opportunities.some(o => !Object.hasOwn(o, "assessment"))), categoricalNullAssessment: fixtures.some(f => f.snapshot.opportunities.some(o => Object.hasOwn(o, "assessment") && o.assessment === null)),
    absentResult: fixtures.some(f => f.snapshot.result === null), categoricalNullTrainingScore: fixtures.some(f => f.snapshot.result?.evaluationMode === "DECISION_RULES_V1" && f.snapshot.result.trainingScore === null) };
  return { fixtureCount: fixtures.length, historicalVersions: [...new Set(fixtureData.templates.map(t => t.version))].sort(), nativeCases, explicitCases, selectedReader: selected, ownership, ties, nativeTies, quiz, concurrency, expiry, candidateTransactionCounts, physicalInsertionAudit, jsonNullStorage, coverage,
    nativeUntiedParity: nativeCases.length > 0 && !failed(nativeCases), explicitUntiedParity: explicitCases.length > 0 && !failed(explicitCases) };
}
