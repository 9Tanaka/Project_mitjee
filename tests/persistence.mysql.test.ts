import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { TrainingCore } from "../src/core.js";
import { createPrismaClient } from "../src/persistence/prisma-client.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { repositoryContract, repositoryHarness, safeActions } from "./repository-contract.js";
import { smsPhishingDialogueFixture as fixture } from "../src/fixtures/sms-phishing-dialogue.js";
import { smsPhishingDecisionRulesFixture } from "../src/fixtures/sms-phishing-decision-rules.js";
import { smsPhishingFeedbackFixture } from "../src/fixtures/sms-phishing-feedback.js";
import { additionalScamScenarios } from "../src/fixtures/scam-scenarios.js";
import type { ActionInput } from "../src/domain/training-action.js";

const url = process.env.MYSQL_TEST_DATABASE_URL;
if (url && !/^mitjee_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname.slice(1))) {
  throw new Error("Use a dedicated database named mitjee_test or mitjee_test_<suffix>");
}
const publicKeyPath = process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH;
const connectionOptions = publicKeyPath ? { loopbackRsaPublicKey: publicKeyPath } : {};
const client = url ? createPrismaClient(url, connectionOptions) : null;
afterAll(async () => { await client?.$disconnect(); });

describe.skipIf(!client)("Real MySQL / Prisma persistence (no DB mock)", () => {
  repositoryContract("Prisma repository port", () => new PrismaTrainingRepository(client!));

  it.each([...additionalScamScenarios, smsPhishingDecisionRulesFixture, smsPhishingFeedbackFixture])(
    "$id v$version: categorical assessments survive every write and fresh-client reload", async template => {
      const id = randomUUID(), owner = "assessment-test-" + randomUUID();
      let core = await TrainingCore.create([template], new PrismaTrainingRepository(client!), () => 1000);
      await core.start(id, owner, template.id, template.version, template.variant);
      const sms = template.category === "SMS_PHISHING";
      const actions: ActionInput[] = [
        { kind: "DECISION", opportunityId: "d1", choiceId: "verify" },
        { kind: "PROGRESS", transitionId: sms ? "review-sms" : "read-claim" },
        { kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: sms ? ["wrong-domain", "urgency"] : ["unverified-claim", "pressure"] },
        { kind: "PROGRESS", transitionId: sms ? "inspect-link" : "consider-request" },
        { kind: "DECISION", opportunityId: "d2", choiceId: "refuse" },
        { kind: "PROGRESS", transitionId: sms ? "verify-and-close" : "choose-response" },
        ...(sms ? [{ kind: "DECISION" as const, opportunityId: "d3", choiceId: "official-channel" }] : []),
        { kind: "SAFE_ACTION", opportunityId: "s1", actionId: "verify-end-report" },
        { kind: "PROGRESS", transitionId: "resolve" },
      ];
      let freshClient: ReturnType<typeof createPrismaClient> | null = null;
      try {
        for (const [index, action] of actions.entries()) {
          const before = await core.resume(id, owner);
          const committed = await core.submit({ sessionId: id, ownerId: owner, expectedRevision: before.revision,
            actionId: "step-" + index, action });
          await freshClient?.$disconnect();
          freshClient = createPrismaClient(url!, connectionOptions);
          core = await TrainingCore.create([], new PrismaTrainingRepository(freshClient), () => 1000);
          const reloaded = await core.resume(id, owner);
          expect(reloaded).toEqual(committed.session);
          for (const opportunity of reloaded.opportunities) {
            expect(opportunity).toHaveProperty("assessment", opportunity.finalizedAt === null ? null : "SAFE");
          }
        }
        const result = (await core.resume(id, owner)).result;
        expect((await core.resume(id, owner)).status).toBe("COMPLETED");
        expect(result).toMatchObject({ outcome: "PASSED", evaluationMode: "DECISION_RULES_V1", trainingScore: null,
          decisionSummary: { review: 0, unassessed: 0, safe: sms ? 5 : 4 } });
        expect((await client!.trainingResult.findUniqueOrThrow({ where: { sessionId: id } })).evaluationMode).toBe("DECISION_RULES_V1");
      } finally { await freshClient?.$disconnect(); }
    }, 30_000,
  );

  it("persists version 3 categorical result and resumes it without rewriting legacy history", async () => {
    const id = randomUUID();
    const repository = new PrismaTrainingRepository(client!);
    const core = await TrainingCore.create([fixture, smsPhishingDecisionRulesFixture], repository, () => 1000);
    await core.start(id, "test-owner", smsPhishingDecisionRulesFixture.id, 3);
    await core.submit({ sessionId: id, ownerId: "test-owner", actionId: "early-safe-stop", expectedRevision: 0,
      action: { kind: "PROGRESS", transitionId: "end-contact-early" } });
    const row = await client!.trainingResult.findUniqueOrThrow({ where: { sessionId: id } });
    expect(row.evaluationMode).toBe("DECISION_RULES_V1");
    expect(row.trainingScore).toBeNull();
    expect(row.decisionSummary).toEqual({ encountered: 0, safe: 0, review: 0, unassessed: 0 });
    const reopened = await TrainingCore.create([], new PrismaTrainingRepository(client!), () => 1000);
    expect((await reopened.resume(id, "test-owner")).result?.outcome).toBe("PASSED");
    expect((await reopened.getSessionTemplate(id, "test-owner")).evaluationMode).toBe("DECISION_RULES_V1");
  });

  it("complete aggregate is identical to InMemory after every action and dialogue turn", async () => {
    const id = randomUUID();
    const memory = await repositoryHarness(new InMemoryTrainingRepository(), id);
    const mysql = await repositoryHarness(new PrismaTrainingRepository(client!), id);
    for (const action of safeActions) {
      await memory.say(); await mysql.say();
      expect(await mysql.current()).toEqual(await memory.current());
      await memory.act(action); await mysql.act(action);
      expect(await mysql.current()).toEqual(await memory.current());
    }
    expect(await client!.trainingResult.count({ where: { sessionId: id } })).toBe(1);
  });

  it.each(["decision", "transition", "critical", "dialogue", "safe-result"])("atomic rollback after %s writes restores every table and revision", async kind => {
    let fail = false;
    const repo = new PrismaTrainingRepository(client!, { beforeCommit: () => { if (fail) throw new Error("INJECTED_COMMIT_FAILURE"); } });
    const h = await repositoryHarness(repo);
    const setup = kind === "transition" ? 1 : kind === "critical" ? 4 : kind === "safe-result" ? 8 : 0;
    for (const action of safeActions.slice(0, setup)) await h.act(action);
    const before = await h.current();
    const counts = async () => Promise.all([
      client!.trainingAction.count({ where: { sessionId: h.id } }), client!.trainingEvent.count({ where: { sessionId: h.id } }),
      client!.sessionOpportunity.count({ where: { sessionId: h.id } }), client!.trainingMessage.count({ where: { sessionId: h.id } }),
      client!.dialogueTurnReceipt.count({ where: { sessionId: h.id } }), client!.trainingResult.count({ where: { sessionId: h.id } }),
    ]);
    const beforeCounts = await counts(); fail = true;
    const operation = () => kind === "dialogue" ? h.say() : h.act(kind === "critical"
      ? { kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-password", confirmed: true } : safeActions[setup]!);
    await expect(operation()).rejects.toThrow("INJECTED_COMMIT_FAILURE");
    expect(await h.current()).toEqual(before); expect(await counts()).toEqual(beforeCounts);
    fail = false; await operation(); expect((await h.current()).revision).toBe(before.revision + 1);
  });

  it("DB-level foreign key failure rolls back an action, opportunity and revision", async () => {
    const h = await repositoryHarness(new PrismaTrainingRepository(client!)); const before = await h.current();
    const snapshot = structuredClone(before); snapshot.revision++;
    snapshot.actions.push({ id: "insert-then-rollback", sessionId: h.id, kind: "DECISION", fingerprint: "fixture", state: "contact", revision: 0, at: 1000, validationStatus: "ACCEPTED" });
    snapshot.opportunities[0]!.earned = 10;
    snapshot.events.push({ id: "invalid-fk", sessionId: h.id, actionId: "missing-action", opportunityId: "d1", code: "VERIFY_SOURCE", state: "contact", ruleId: "fixture", authority: "BACKEND_VALIDATED", critical: false, at: 1000 });
    await expect(h.repository.save(snapshot, 0)).rejects.toThrow();
    expect(await h.current()).toEqual(before);
    expect(await client!.trainingAction.count({ where: { sessionId: h.id } })).toBe(0);
  });

  it("published configuration cannot be changed or deleted through a direct Prisma client", async () => {
    const h = await repositoryHarness(new PrismaTrainingRepository(client!));
    const where = { templateId_version_variant: { templateId: fixture.id, version: 2, variant: "DEFAULT" } };
    await expect(client!.scenarioTemplateVersion.update({ where, data: { configuration: {} } })).rejects.toThrow();
    await expect(client!.scenarioTemplateVersion.delete({ where })).rejects.toThrow();
    expect(await h.core.getSessionTemplate(h.id, "test-owner")).toEqual(fixture);
  });

  it("unique and foreign key constraints reject duplicate/orphan records", async () => {
    const h = await repositoryHarness(new PrismaTrainingRepository(client!)); await h.say("สวัสดี", "one");
    const action = await client!.trainingAction.findFirstOrThrow({ where: { sessionId: h.id } });
    const turn = await client!.dialogueTurnReceipt.findFirstOrThrow({ where: { sessionId: h.id } });
    const opportunity = await client!.sessionOpportunity.findFirstOrThrow({ where: { sessionId: h.id } });
    await expect(client!.trainingAction.create({ data: action })).rejects.toThrow();
    await expect(client!.dialogueTurnReceipt.create({ data: { ...turn, response: turn.response as object } })).rejects.toThrow();
    await expect(client!.sessionOpportunity.create({ data: { ...opportunity, correctWarningSignIds: [], incorrectEvidenceIds: [] } })).rejects.toThrow();
    await expect(client!.trainingAction.create({ data: { ...action, sessionId: "missing-session" } })).rejects.toThrow();
    for (const action of safeActions) await h.act(action);
    const result = await client!.trainingResult.findUniqueOrThrow({ where: { sessionId: h.id } });
    await expect(client!.trainingResult.create({ data: { ...result, scores: {}, criticalEventIds: [], weakestSkills: [], recommendation: {}, decisionSummary: Prisma.DbNull } })).rejects.toThrow();
    expect(await client!.trainingResult.count({ where: { sessionId: h.id } })).toBe(1);
  });

  it("a new database client resumes without republishing or relying on process memory", async () => {
    const h = await repositoryHarness(new PrismaTrainingRepository(client!)); await h.say(); await h.act(safeActions[0]!);
    const before = await h.current(); const secondClient = createPrismaClient(url!, connectionOptions);
    try {
      const core = await TrainingCore.create([], new PrismaTrainingRepository(secondClient), () => 1000);
      expect(await core.resume(h.id, "test-owner")).toEqual(before);
      expect(await core.getSessionTemplate(h.id, "test-owner")).toEqual(fixture);
    } finally { await secondClient.$disconnect(); }
  });
});
