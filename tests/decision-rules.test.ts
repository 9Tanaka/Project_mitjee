import { describe, expect, it } from "vitest";
import { TrainingCore } from "../src/core.js";
import { copy, InMemoryTrainingRepository } from "../src/domain/repository.js";
import { validateTemplate } from "../src/domain/template-validator.js";
import type { ActionInput } from "../src/domain/training-action.js";
import { smsPhishingDialogueFixture } from "../src/fixtures/sms-phishing-dialogue.js";
import { smsPhishingDecisionRulesFixture } from "../src/fixtures/sms-phishing-decision-rules.js";
import { smsPhishingFeedbackFixture } from "../src/fixtures/sms-phishing-feedback.js";

async function harness() {
  const repository = new InMemoryTrainingRepository();
  const core = await TrainingCore.create([smsPhishingDialogueFixture, smsPhishingDecisionRulesFixture, smsPhishingFeedbackFixture], repository, () => 1000);
  await core.start("new", "learner", smsPhishingFeedbackFixture.id, 4);
  let sequence = 0;
  const current = () => core.resume("new", "learner");
  const act = async (action: ActionInput) => core.submit({ sessionId: "new", ownerId: "learner",
    actionId: `action-${++sequence}`, expectedRevision: (await current()).revision, action });
  const decision = (opportunityId: string, choiceId: string) => act({ kind: "DECISION", opportunityId, choiceId });
  const progress = (transitionId: string) => act({ kind: "PROGRESS", transitionId });
  const warning = (selectedEvidenceIds: string[], opportunityId = "w1") => act({ kind: "WARNING_FINALIZE", opportunityId, selectedEvidenceIds });
  const toRequest = async () => {
    await decision("d1", "verify"); await progress("review-sms");
    await warning(["wrong-domain", "urgency"]); await progress("inspect-link");
  };
  const finish = async () => {
    await decision("d2", "refuse"); await progress("verify-and-close");
    await decision("d3", "official-channel");
    await act({ kind: "SAFE_ACTION", opportunityId: "s1", actionId: "verify-end-report" });
    return (await progress("resolve")).session;
  };
  return { core, repository, current, act, decision, progress, warning, toRequest, finish };
}

describe("decision rules v1", () => {
  it("safe stop at first contact passes only the encountered path with no numeric score", async () => {
    const h = await harness();
    expect((await h.current()).opportunities).toHaveLength(1);
    const session = (await h.progress("end-contact-early")).session;
    expect(session.status).toBe("COMPLETED");
    expect(session.result?.outcome).toBe("PASSED");
    expect(session.result?.evaluationMode).toBe("DECISION_RULES_V1");
    expect(session.result?.decisionSummary).toEqual({ encountered: 0, safe: 0, review: 0, unassessed: 0, critical: 0, checkpoints: [] });
    expect(session.result?.trainingScore).toBeNull();
    expect(session.events).toEqual([]);
  });

  it("all finalized decisions safe passes without requiring checkpoints on other paths", async () => {
    const h = await harness(); await h.toRequest();
    const session = await h.finish();
    expect(session.result?.outcome).toBe("PASSED");
    expect(session.result?.decisionSummary).toMatchObject({ encountered: 5, safe: 5, review: 0, unassessed: 0 });
    expect(session.result?.decisionSummary?.checkpoints?.map(c => c.ruleId)).toEqual([
      "d1:verify", "w1:finalize", "d2:refuse", "d3:official-channel", "s1:verify-end-report",
    ]);
    expect(session.result?.decisionSummary?.checkpoints?.[0]?.explanation).toContain("ช่องทางอื่น");
    expect(session.opportunities.some(o => o.definitionId === "w-extra")).toBe(false);
  });

  it("a reviewed explicit choice takes precedence over otherwise safe decisions", async () => {
    const h = await harness(); await h.decision("d1", "hesitate"); await h.progress("review-sms");
    await h.warning(["wrong-domain", "urgency"]); await h.progress("inspect-link");
    const session = await h.finish();
    expect(session.result?.outcome).toBe("NEEDS_PRACTICE");
    expect(session.result?.decisionSummary?.review).toBe(1);
    expect(session.result?.recommendation.recommendationType).toBe("DECISION_PRACTICE");
  });

  it("opened optional checkpoint left unanswered is unassessed, while early safe exit is exempt", async () => {
    const h = await harness(); await h.decision("d1", "verify"); await h.progress("review-sms");
    await h.warning(["wrong-domain", "urgency"]); await h.progress("extra-message");
    await h.progress("continue-link");
    const session = await h.finish();
    expect(session.result?.outcome).toBe("UNASSESSED");
    expect(session.result?.decisionSummary).toMatchObject({ encountered: 6, safe: 5, review: 0, unassessed: 1 });
    expect(session.result?.decisionSummary?.checkpoints?.find(c => c.checkpointId === "w-extra")).toMatchObject({
      ruleId: "w-extra:unanswered", assessment: "UNASSESSED",
    });
  });

  it("validated critical action fails immediately even with incomplete checkpoints", async () => {
    const h = await harness(); await h.toRequest();
    const session = (await h.act({ kind: "SIMULATED_ACTION", ruleId: "confirm-simulated-otp", confirmed: true })).session;
    expect(session.status).toBe("FAILED");
    expect(session.result?.outcome).toBe("CRITICAL_FAILURE");
    expect(session.result?.criticalEventIds).toHaveLength(1);
    expect(session.result?.decisionSummary?.checkpoints?.at(-1)).toMatchObject({ ruleId: "confirm-simulated-otp", assessment: "CRITICAL" });
    expect(session.result?.trainingScore).toBeNull();
  });

  it("free text and AI candidate cannot record a decision or critical event", async () => {
    const h = await harness(); const before = await h.current();
    await h.act({ kind: "FREE_TEXT", text: "ฉันจะส่ง OTP" });
    expect(await h.core.inspectAI("new", "learner", { eventCode: "DISCLOSE_OTP", opportunityId: "d1", sourceMessageId: "m1", confidence: 1 })).toBe("REJECTED");
    const after = await h.current();
    expect(after.events).toEqual(before.events);
    expect(after.opportunities).toEqual(before.opportunities);
    expect(after.result).toBeNull();
  });

  it("early resolution is unavailable after leaving contact", async () => {
    const h = await harness(); await h.decision("d1", "verify"); await h.progress("review-sms");
    await expect(h.progress("end-contact-early")).rejects.toThrow("INVALID_TRANSITION");
  });

  it("publication rejects missing assessment metadata in the new version", () => {
    const template = copy(smsPhishingFeedbackFixture);
    const d1 = template.opportunities.find(o => o.id === "d1");
    if (!d1 || d1.skill !== "D") throw new Error("missing fixture checkpoint");
    delete d1.choices[0]!.assessment;
    expect(() => validateTemplate(template)).toThrow("Missing decision assessment");
  });

  it("publication rejects missing public explanations when feedback is enabled", () => {
    const template = copy(smsPhishingFeedbackFixture);
    delete template.opportunities[0]!.publicCheckpointLabel;
    expect(() => validateTemplate(template)).toThrow("Missing public checkpoint feedback");
  });

  it("version 3 remains playable and retains its original count-only result", async () => {
    const h = await harness();
    await h.core.start("prior", "learner", smsPhishingDecisionRulesFixture.id, 3);
    const session = (await h.core.submit({ sessionId: "prior", ownerId: "learner", actionId: "prior-stop",
      expectedRevision: 0, action: { kind: "PROGRESS", transitionId: "end-contact-early" } })).session;
    expect(session.result?.decisionSummary).toEqual({ encountered: 0, safe: 0, review: 0, unassessed: 0 });
    expect(session.result?.outcome).toBe("PASSED");
  });

  it("legacy version remains immutable and retains numeric result semantics", async () => {
    const h = await harness();
    await h.core.start("old", "learner", smsPhishingDialogueFixture.id, 2);
    const old = await h.core.resume("old", "learner");
    expect(old.templateVersion).toBe(2);
    expect(old.opportunities[0]).not.toHaveProperty("assessment");
    expect((await h.core.getSessionTemplate("old", "learner")).evaluationMode).toBeUndefined();
  });
});
