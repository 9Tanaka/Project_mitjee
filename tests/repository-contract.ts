import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TrainingCore } from "../src/core.js";
import { copy } from "../src/domain/copy.js";
import type { TrainingRepository } from "../src/domain/training-repository.js";
import type { ActionInput } from "../src/domain/training-action.js";
import { smsPhishingDialogueFixture as fixture } from "../src/fixtures/sms-phishing-dialogue.js";
import { ScenarioDialogueOrchestrator } from "../src/dialogue/orchestrator.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";

export const safeActions: ActionInput[] = [
  { kind: "DECISION", opportunityId: "d1", choiceId: "verify" },
  { kind: "PROGRESS", transitionId: "review-sms" },
  { kind: "WARNING_FINALIZE", opportunityId: "w1", selectedEvidenceIds: ["wrong-domain", "urgency", "logo"] },
  { kind: "PROGRESS", transitionId: "inspect-link" },
  { kind: "DECISION", opportunityId: "d2", choiceId: "refuse" },
  { kind: "PROGRESS", transitionId: "verify-and-close" },
  { kind: "DECISION", opportunityId: "d3", choiceId: "official-channel" },
  { kind: "SAFE_ACTION", opportunityId: "s1", actionId: "verify-end-report" },
  { kind: "PROGRESS", transitionId: "resolve" },
];

export async function repositoryHarness(repository: TrainingRepository, id = randomUUID()) {
  const core = await TrainingCore.create([fixture], repository, () => 1000);
  await core.start(id, "test-owner", fixture.id, fixture.version);
  let sequence = 0;
  const current = () => core.resume(id, "test-owner");
  const command = async (action: ActionInput, actionId = `a-${++sequence}`) => ({
    sessionId: id, ownerId: "test-owner", actionId, expectedRevision: (await current()).revision, action,
  });
  const act = async (action: ActionInput) => core.submit(await command(action));
  const provider = new MockScenarioModelProvider();
  const dialogue = new ScenarioDialogueOrchestrator(core, provider);
  const say = async (text = "ขอตรวจสอบผู้ส่ง", turnId = `t-${++sequence}`) => dialogue.sendMessage({
    sessionId: id, ownerId: "test-owner", turnId, expectedRevision: (await current()).revision, text,
  });
  return { core, repository, id, current, command, act, provider, dialogue, say };
}

export function repositoryContract(name: string, createRepository: () => TrainingRepository) {
  describe(name, () => {
    it("opaque identities preserve exact case and trailing space without crossing ownership", async () => {
      const repository = createRepository(); const h = await repositoryHarness(repository);
      const upper = `Case-${h.id}`; const lower = `case-${h.id}`; const padded = upper + " ";
      await h.core.start(upper, "OWNER", fixture.id, 2);
      await h.core.start(lower, "OWNER", fixture.id, 2);
      await h.core.start(padded, "OWNER ", fixture.id, 2);
      expect((await repository.get(upper, "OWNER")).id).toBe(upper);
      expect((await repository.get(lower, "OWNER")).id).toBe(lower);
      expect((await repository.get(padded, "OWNER ")).id).toBe(padded);
      await expect(repository.get(upper, "owner")).rejects.toThrow("SESSION_NOT_FOUND");
      await expect(repository.get(padded, "OWNER")).rejects.toThrow("SESSION_NOT_FOUND");
    });
    it("safe complete multi-turn path preserves full D/W/S and one official result", async () => {
      const h = await repositoryHarness(createRepository());
      for (const action of safeActions) { await h.say(); await h.act(action); }
      const s = await h.current();
      expect(s.status).toBe("COMPLETED"); expect(s.result?.trainingScore).toBe(100);
      expect(Object.values(s.result!.scores).map(x => x.normalized)).toEqual([100, 100, 100]);
      expect(s.opportunities.find(o => o.definitionId === "w1")?.incorrectEvidenceIds).toEqual(["logo"]);
      expect(s.opportunities.some(o => o.definitionId === "w-extra")).toBe(false);
      expect(s.messages).toHaveLength(18); expect(s.dialogueTurns).toHaveLength(9);
    });
    it("explicit simulated critical action persists immediate failure and result", async () => {
      const h = await repositoryHarness(createRepository());
      for (const action of safeActions.slice(0, 4)) await h.act(action);
      await h.act({ kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-password", confirmed: true });
      const s = await h.current();
      expect(s.status).toBe("FAILED"); expect(s.result?.outcome).toBe("CRITICAL_FAILURE");
      expect(s.events.filter(e => e.critical)).toHaveLength(1);
    });
    it("duplicate action is idempotent and a changed payload conflicts", async () => {
      const h = await repositoryHarness(createRepository()); const command = await h.command(safeActions[0]!);
      const first = await h.core.submit(command); const retry = await h.core.submit(command);
      expect(retry.duplicate).toBe(true); expect(await h.current()).toEqual(first.session);
      await expect(h.core.submit({ ...command, action: { ...safeActions[0], choiceId: "hesitate" } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    });
    it("concurrent duplicate actions commit exactly once", async () => {
      const h = await repositoryHarness(createRepository()); const command = await h.command(safeActions[0]!);
      const replies = await Promise.all([h.core.submit(command), h.core.submit(command)]);
      expect(replies.filter(r => r.duplicate)).toHaveLength(1);
      const s = await h.current(); expect(s.actions).toHaveLength(1); expect(s.events).toHaveLength(1);
      expect(s.opportunities[0]?.earned).toBe(10); expect(s.revision).toBe(1);
    });
    it("duplicate turn resumes the receipt without calling provider again", async () => {
      const h = await repositoryHarness(createRepository()); const first = await h.say("สวัสดี", "same");
      const before = await h.current(); const retry = await h.say("สวัสดี", "same");
      expect(retry.duplicate).toBe(true); expect(retry.turn).toEqual(first.turn);
      expect(await h.current()).toEqual(before); expect(h.provider.callCount).toBe(1);
      await expect(h.say("คำถามอื่น", "same")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    });
    it("concurrent duplicate turns share one committed receipt", async () => {
      const h = await repositoryHarness(createRepository());
      const request = { sessionId: h.id, ownerId: "test-owner", turnId: "concurrent", text: "สวัสดี", expectedRevision: 0 };
      const replies = await Promise.all([h.dialogue.sendMessage(request), h.dialogue.sendMessage(request)]);
      expect(replies.filter(r => r.duplicate)).toHaveLength(1);
      const s = await h.current(); expect(s.dialogueTurns).toHaveLength(1); expect(s.messages).toHaveLength(2);
      expect(s.actions).toHaveLength(1); expect(s.revision).toBe(1);
    });
    it("two different requests at the same revision allow one winner, no partial loser", async () => {
      const h = await repositoryHarness(createRepository()); const command = await h.command(safeActions[0]!);
      const replies = await Promise.allSettled([h.core.submit(command), h.core.submit({ ...command, actionId: "competitor" })]);
      expect(replies.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(replies.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
      const s = await h.current(); expect(s.actions).toHaveLength(1); expect(s.events).toHaveLength(1);
      expect(s.revision).toBe(1); expect(s.opportunities[0]?.earned).toBe(10); expect(s.state).toBe("contact");
    });
    it("stale transition cannot open a second opportunity or move the state twice", async () => {
      const h = await repositoryHarness(createRepository()); await h.act(safeActions[0]!);
      const command = await h.command(safeActions[1]!); await h.core.submit(command);
      const before = await h.current();
      await expect(h.core.submit({ ...command, actionId: "stale-transition" })).rejects.toThrow("REVISION_CONFLICT");
      expect(await h.current()).toEqual(before); expect(before.opportunities).toHaveLength(2);
    });
    it("published template and referenced version are immutable across Core instances", async () => {
      const h = await repositoryHarness(createRepository()); const changed = copy(fixture); changed.title = "Changed";
      await expect(h.core.publishTemplate(changed)).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
      const other = await TrainingCore.create([], h.repository, () => 1000);
      await expect(other.publishTemplate(changed)).rejects.toThrow("PUBLISHED_TEMPLATE_IMMUTABLE");
      await other.publishTemplate({ ...fixture, version: 3 });
      expect((await other.getSessionTemplate(h.id, "test-owner")).version).toBe(2);
      const session = await h.current(); session.templateVersion = 3; session.revision++;
      await expect(h.repository.save(session, 0)).rejects.toThrow("SESSION_IDENTITY_IMMUTABLE");
      expect((await h.current()).revision).toBe(0);
    });
    it("variant is part of the template key", async () => {
      const repository = createRepository(); const id = `variant-${randomUUID()}`;
      await repository.publish({ ...fixture, id, category: "CALL_CENTER", variant: "NORMAL_CALL" });
      await repository.publish({ ...fixture, id, category: "CALL_CENTER", variant: "SCAM_CALL" });
      expect((await repository.getTemplate(id, 2, "NORMAL_CALL")).variant).toBe("NORMAL_CALL");
      expect((await repository.getTemplate(id, 2, "SCAM_CALL")).variant).toBe("SCAM_CALL");
    });
    it("refresh/recreated Core restores state, events, opportunities and sanitized dialogue", async () => {
      const h = await repositoryHarness(createRepository()); await h.say(); await h.act(safeActions[0]!);
      const before = await h.current(); const restored = await TrainingCore.create([], h.repository, () => 1000);
      expect(await restored.resume(h.id, "test-owner")).toEqual(before);
      await expect(restored.resume(h.id, "another-owner")).rejects.toThrow("SESSION_NOT_FOUND");
      before.actions.length = 0; expect((await h.current()).actions.length).toBe(2);
    });
    it("invalid transition and required checkpoint fail atomically", async () => {
      const h = await repositoryHarness(createRepository()); const before = await h.current();
      await expect(h.act(safeActions[1]!)).rejects.toThrow("CHECKPOINT_OR_EVENT_REQUIRED");
      await expect(h.act(safeActions[8]!)).rejects.toThrow("INVALID_TRANSITION");
      expect(await h.current()).toEqual(before);
    });
    it("sanitizes user/provider content and never stores raw free text or secret fingerprints", async () => {
      const h = await repositoryHarness(createRepository()); await h.say("OTP 847193 email learner@example.com โทร 081-234-5678");
      const stored = JSON.stringify(await h.current());
      for (const secret of ["847193", "learner@example.com", "081-234-5678"]) expect(stored).not.toContain(secret);
      expect(stored).toContain("REDACTED");
      const before = await h.current(); const corrupt = copy(before); corrupt.revision++;
      corrupt.messages[0] = { ...corrupt.messages[0]!, text: "OTP 847193" };
      await expect(h.repository.save(corrupt, before.revision)).rejects.toThrow();
      expect(await h.current()).toEqual(before);
    });
  });
}
